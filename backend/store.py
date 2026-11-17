"""
[개발 > DB구축] 담당자 결정(리뷰) 저장소

- DATABASE_URL(Neon Postgres 등)이 있으면 reviews 테이블에 저장합니다. (db/schema.sql)
- 없으면 메모리에 저장합니다. 서버리스 환경에서는 재시작 시 사라지므로
  프론트엔드도 브라우저에 사본을 남깁니다.
"""
from __future__ import annotations

import logging
import os
import threading
from datetime import datetime, timezone
from typing import Any

log = logging.getLogger("er-audit.store")

_memory: dict[str, dict[str, Any]] = {}
_lock = threading.Lock()


def _db_url() -> str | None:
    return os.getenv("DATABASE_URL") or None


def backend_name() -> str:
    return "postgres" if _db_url() else "memory"


def _connect():
    import psycopg  # 지연 import: DB를 안 쓰면 설치하지 않아도 됩니다.

    return psycopg.connect(_db_url(), connect_timeout=5)


def list_reviews() -> dict[str, dict[str, Any]]:
    if not _db_url():
        with _lock:
            return dict(_memory)
    try:
        with _connect() as conn, conn.cursor() as cur:
            cur.execute(
                "SELECT visit_id, decision, note, reviewer, decided_at FROM reviews"
            )
            return {
                r[0]: {
                    "visit_id": r[0],
                    "decision": r[1],
                    "note": r[2],
                    "reviewer": r[3],
                    "decided_at": r[4].isoformat(),
                }
                for r in cur.fetchall()
            }
    except Exception as exc:  # DB 장애 시 화면은 계속 동작해야 합니다.
        log.error("reviews 조회 실패: %s", exc)
        raise StoreError("결정 기록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.") from exc


def save_review(visit_id: str, decision: str, note: str, reviewer: str) -> dict[str, Any]:
    record = {
        "visit_id": visit_id,
        "decision": decision,
        "note": note,
        "reviewer": reviewer,
        "decided_at": datetime.now(timezone.utc).isoformat(),
    }
    if not _db_url():
        with _lock:
            _memory[visit_id] = record
        return record
    try:
        with _connect() as conn, conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO reviews (visit_id, decision, note, reviewer, decided_at)
                VALUES (%s, %s, %s, %s, now())
                ON CONFLICT (visit_id) DO UPDATE
                  SET decision = EXCLUDED.decision, note = EXCLUDED.note,
                      reviewer = EXCLUDED.reviewer, decided_at = now()
                """,
                (visit_id, decision, note, reviewer),
            )
            cur.execute(
                "INSERT INTO review_log (visit_id, decision, note, reviewer) VALUES (%s, %s, %s, %s)",
                (visit_id, decision, note, reviewer),
            )
        return record
    except Exception as exc:
        log.error("review 저장 실패: %s", exc)
        raise StoreError("결정을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.") from exc


def delete_review(visit_id: str) -> None:
    if not _db_url():
        with _lock:
            _memory.pop(visit_id, None)
        return
    try:
        with _connect() as conn, conn.cursor() as cur:
            cur.execute("DELETE FROM reviews WHERE visit_id = %s", (visit_id,))
    except Exception as exc:
        log.error("review 삭제 실패: %s", exc)
        raise StoreError("결정을 되돌리지 못했습니다.") from exc


class StoreError(RuntimeError):
    pass
