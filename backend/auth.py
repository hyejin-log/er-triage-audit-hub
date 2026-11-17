"""
[개발 > 인증] Supabase Auth 토큰 검증

- 프론트엔드가 Supabase 매직 링크로 로그인하면 access token(JWT)을 받습니다.
- 결정 저장·되돌리기 API는 Authorization: Bearer <token> 을 받아
  Supabase /auth/v1/user 로 토큰이 유효한지 확인하고, 로그인한 이메일을 검토자로 기록합니다.
- SUPABASE_URL / SUPABASE_ANON_KEY (Vercel 연동 접두어 SUPA_ 포함)가 없으면(로컬 개발) 인증을 끄고 기존처럼 동작합니다.
- AUDITOR_EMAILS(쉼표 구분) 또는 AUDITOR_EMAIL_DOMAINS 를 설정하면 그 사용자만 결정할 수 있습니다.
"""
from __future__ import annotations

import json
import logging
import os
import threading
import time
import urllib.error
import urllib.request
from dataclasses import dataclass

from fastapi import Header, HTTPException

log = logging.getLogger("er-audit.auth")

_cache: dict[str, tuple[str, float]] = {}
_cache_lock = threading.Lock()
CACHE_SECONDS = 60


def _supabase_url() -> str | None:
    url = os.getenv("SUPABASE_URL") or os.getenv("SUPA_SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
    return url.rstrip("/") if url else None


def _anon_key() -> str | None:
    return os.getenv("SUPABASE_ANON_KEY") or os.getenv("SUPA_SUPABASE_ANON_KEY") or os.getenv("VITE_SUPABASE_ANON_KEY")


def auth_enabled() -> bool:
    return bool(_supabase_url() and _anon_key())


@dataclass
class Auditor:
    email: str


def _allowed(email: str) -> bool:
    emails = {e.strip().lower() for e in os.getenv("AUDITOR_EMAILS", "").split(",") if e.strip()}
    domains = {d.strip().lower().lstrip("@") for d in os.getenv("AUDITOR_EMAIL_DOMAINS", "").split(",") if d.strip()}
    if not emails and not domains:
        return True  # 데모: 로그인한 사용자는 모두 허용
    email = email.lower()
    return email in emails or email.split("@")[-1] in domains


def _fetch_user(token: str) -> str:
    req = urllib.request.Request(
        f"{_supabase_url()}/auth/v1/user",
        headers={"apikey": _anon_key() or "", "Authorization": f"Bearer {token}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=8) as res:
            data = json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        if exc.code in (401, 403):
            raise HTTPException(status_code=401, detail="로그인이 만료됐어요. 다시 로그인해 주세요.") from exc
        log.error("Supabase 사용자 확인 실패: HTTP %s", exc.code)
        raise HTTPException(status_code=503, detail="로그인 확인 서버에 문제가 있어요. 잠시 후 다시 시도해 주세요.") from exc
    except (urllib.error.URLError, TimeoutError) as exc:
        log.error("Supabase 연결 실패: %s", type(exc).__name__)
        raise HTTPException(status_code=503, detail="로그인 확인 서버에 연결하지 못했어요.") from exc
    email = data.get("email")
    if not email:
        raise HTTPException(status_code=401, detail="이메일이 확인된 계정으로 로그인해 주세요.")
    return email


def require_auditor(authorization: str | None = Header(default=None)) -> Auditor | None:
    """FastAPI 의존성. 인증이 꺼져 있으면 None 을 돌려줍니다."""
    if not auth_enabled():
        return None
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="결정을 기록하려면 로그인해 주세요.")
    token = authorization.split(" ", 1)[1].strip()

    now = time.time()
    with _cache_lock:
        hit = _cache.get(token)
    if hit and hit[1] > now:
        email = hit[0]
    else:
        email = _fetch_user(token)
        with _cache_lock:
            if len(_cache) > 500:
                _cache.clear()
            _cache[token] = (email, now + CACHE_SECONDS)

    if not _allowed(email):
        raise HTTPException(status_code=403, detail=f"{email} 계정은 감사 결정 권한이 없어요. 관리자에게 요청해 주세요.")
    return Auditor(email=email)
