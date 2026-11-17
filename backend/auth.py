"""
[개발 > 인증] 로그인 사용자 확인 — 부서별 데모 로그인 + Supabase 이메일 로그인

1) 데모 로그인: POST /api/demo-login {dept} → 서버가 서명한 데모 토큰("demo.<payload>.<sig>")
   - 메일·비밀번호 없이 부서를 골라 바로 체험합니다. 12시간 유효.
   - 서명 키는 DEMO_TOKEN_SECRET, 없으면 Supabase 서버 비밀 키에서 파생합니다(브라우저에 노출되지 않음).
2) Supabase 매직 링크: access token 을 Supabase /auth/v1/user 로 확인합니다.
   - 부서는 DEPT_ASSIGNMENTS("메일=부서코드,…")로 지정하고, 없으면 QI팀입니다.
   - AUDITOR_EMAILS / AUDITOR_EMAIL_DOMAINS 로 허용 목록을 둘 수 있습니다.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import secrets
import threading
import time
import urllib.error
import urllib.request
from dataclasses import asdict, dataclass

from fastapi import Header, HTTPException

from .departments import DEPARTMENTS

log = logging.getLogger("er-audit.auth")

DEMO_TTL = 12 * 3600
CACHE_SECONDS = 60
_PROCESS_KEY = secrets.token_bytes(32)  # 비밀 키가 없는 로컬 개발용
_cache: dict[str, tuple[str, float]] = {}
_cache_lock = threading.Lock()


@dataclass
class User:
    id: str
    name: str
    dept: str
    dept_name: str
    kind: str  # "demo" | "email"
    email: str | None = None

    def to_dict(self) -> dict:
        return asdict(self)


# ── Supabase 설정 ───────────────────────────────────────────────────────
def _supabase_url() -> str | None:
    url = os.getenv("SUPABASE_URL") or os.getenv("SUPA_SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
    return url.rstrip("/") if url else None


def _anon_key() -> str | None:
    return os.getenv("SUPABASE_ANON_KEY") or os.getenv("SUPA_SUPABASE_ANON_KEY") or os.getenv("VITE_SUPABASE_ANON_KEY")


def email_login_enabled() -> bool:
    return bool(_supabase_url() and _anon_key())


# ── 데모 토큰 ─────────────────────────────────────────────────────────
def _signing_key() -> bytes:
    secret = (
        os.getenv("DEMO_TOKEN_SECRET")
        or os.getenv("SUPA_SUPABASE_SECRET_KEY")
        or os.getenv("SUPA_SUPABASE_SERVICE_ROLE_KEY")
        or os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    )
    if not secret:
        return _PROCESS_KEY
    return hashlib.sha256(f"er-triage-demo:{secret}".encode()).digest()


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _demo_user(dept: str) -> User:
    info = DEPARTMENTS[dept]
    return User(id=f"demo-{dept.lower()}", name=f"{info['name']} 데모", dept=dept, dept_name=info["name"], kind="demo")


def issue_demo_token(dept: str) -> tuple[str, User]:
    if dept not in DEPARTMENTS:
        raise HTTPException(status_code=422, detail="없는 부서예요.")
    payload = _b64(json.dumps({"d": dept, "exp": int(time.time()) + DEMO_TTL, "n": secrets.token_hex(4)}).encode())
    sig = _b64(hmac.new(_signing_key(), payload.encode(), hashlib.sha256).digest())
    return f"demo.{payload}.{sig}", _demo_user(dept)


def _verify_demo(token: str) -> User:
    try:
        _, payload, sig = token.split(".")
        expected = _b64(hmac.new(_signing_key(), payload.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(sig, expected):
            raise ValueError("bad signature")
        data = json.loads(_unb64(payload))
    except (ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=401, detail="데모 로그인이 만료됐어요. 다시 로그인해 주세요.") from exc
    if data.get("exp", 0) < time.time() or data.get("d") not in DEPARTMENTS:
        raise HTTPException(status_code=401, detail="데모 로그인이 만료됐어요. 다시 로그인해 주세요.")
    return _demo_user(data["d"])


# ── Supabase 이메일 사용자 ────────────────────────────────────────────
def _allowed(email: str) -> bool:
    emails = {e.strip().lower() for e in os.getenv("AUDITOR_EMAILS", "").split(",") if e.strip()}
    domains = {d.strip().lower().lstrip("@") for d in os.getenv("AUDITOR_EMAIL_DOMAINS", "").split(",") if d.strip()}
    if not emails and not domains:
        return True
    email = email.lower()
    return email in emails or email.split("@")[-1] in domains


def _dept_for(email: str) -> str:
    for pair in os.getenv("DEPT_ASSIGNMENTS", "").split(","):
        if "=" in pair:
            mail, dept = (x.strip() for x in pair.split("=", 1))
            if mail.lower() == email.lower() and dept.upper() in DEPARTMENTS:
                return dept.upper()
    return "QI"


def _fetch_email(token: str) -> str:
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


def _email_user(token: str) -> User:
    if not email_login_enabled():
        raise HTTPException(status_code=401, detail="로그인해 주세요.")
    now = time.time()
    with _cache_lock:
        hit = _cache.get(token)
    if hit and hit[1] > now:
        email = hit[0]
    else:
        email = _fetch_email(token)
        with _cache_lock:
            if len(_cache) > 500:
                _cache.clear()
            _cache[token] = (email, now + CACHE_SECONDS)
    if not _allowed(email):
        raise HTTPException(status_code=403, detail=f"{email} 계정은 감사 권한이 없어요. 관리자에게 요청해 주세요.")
    dept = _dept_for(email)
    return User(id=email, name=email, dept=dept, dept_name=DEPARTMENTS[dept]["name"], kind="email", email=email)


# ── FastAPI 의존성 ───────────────────────────────────────────────────
def optional_user(authorization: str | None = Header(default=None)) -> User | None:
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    token = authorization.split(" ", 1)[1].strip()
    if token.startswith("demo."):
        return _verify_demo(token)
    return _email_user(token)


def require_user(authorization: str | None = Header(default=None)) -> User:
    user = optional_user(authorization)
    if user is None:
        raise HTTPException(status_code=401, detail="로그인해 주세요. 부서별 데모 로그인으로 바로 체험할 수 있어요.")
    return user


def require_qi(authorization: str | None = Header(default=None)) -> User:
    user = require_user(authorization)
    if user.dept != "QI":
        raise HTTPException(status_code=403, detail=f"{user.dept_name}은(는) 감사 결정을 할 수 없어요. QI팀만 판정합니다.")
    return user
