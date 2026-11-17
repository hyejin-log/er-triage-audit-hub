"""
[개발 > DB구축] 감사 결정·소명 저장소

흐름 (Rebate Lens의 '소명 요청중'과 같은 구조)
    QI팀 결정 ── 적정 확인 / 재분류 확정 ─────────────▶ stage = closed
             └─ 소명 요청 → 담당 부서 배정 ─▶ stage = requested
                                   부서 소명 제출 ─▶ stage = answered
                        QI팀 최종 확정(적정/재분류) ─▶ stage = closed

- DATABASE_URL(Neon) 또는 POSTGRES_URL 이 있으면 Postgres, 없으면 메모리에 저장합니다.
- 테이블·컬럼은 첫 연결 때 자동으로 만들고 늘립니다(ALTER … ADD COLUMN IF NOT EXISTS).
"""
from __future__ import annotations

import logging
import os
import threading
from datetime import datetime, timezone
from typing import Any

log = logging.getLogger("er-audit.store")

_memory: dict[str, dict[str, Any]] = {}
_notes: list[dict[str, Any]] = []
_note_seq = 0
_lock = threading.Lock()
_schema_ready = False

COLUMNS = (
    "visit_id", "decision", "note", "reviewer", "decided_at",
    "stage", "assigned_dept", "response", "responder", "responded_at",
)

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS reviews (
    visit_id    TEXT PRIMARY KEY,
    decision    TEXT NOT NULL CHECK (decision IN ('적정 확인', '재분류 확정', '소명 요청')),
    note        TEXT NOT NULL DEFAULT '',
    reviewer    TEXT NOT NULL,
    decided_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS stage TEXT NOT NULL DEFAULT 'closed';
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS assigned_dept TEXT;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS response TEXT;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS responder TEXT;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS review_log (
    id          BIGSERIAL PRIMARY KEY,
    visit_id    TEXT NOT NULL,
    decision    TEXT NOT NULL,
    note        TEXT NOT NULL DEFAULT '',
    reviewer    TEXT NOT NULL,
    logged_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE review_log ADD COLUMN IF NOT EXISTS action TEXT NOT NULL DEFAULT 'decision';
CREATE INDEX IF NOT EXISTS idx_review_log_visit ON review_log (visit_id, logged_at DESC);
-- 팀 내부 메모: 같은 부서만 읽고 씁니다(API에서 부서로 거릅니다).
CREATE TABLE IF NOT EXISTS team_notes (
    id          BIGSERIAL PRIMARY KEY,
    visit_id    TEXT NOT NULL,
    dept        TEXT NOT NULL,
    author      TEXT NOT NULL,
    body        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_team_notes_dept ON team_notes (dept, visit_id, created_at DESC);
"""


class StoreError(RuntimeError):
    pass


class StageConflict(RuntimeError):
    """지금 단계에서 할 수 없는 작업(예: 요청되지 않은 건에 소명 제출)."""


def _db_url() -> str | None:
    return os.getenv("DATABASE_URL") or os.getenv("POSTGRES_URL") or None


def backend_name() -> str:
    return "postgres" if _db_url() else "memory"


def _connect():
    global _schema_ready
    import psycopg  # 지연 import: DB를 안 쓰면 설치하지 않아도 됩니다.

    # Neon 의 DATABASE_URL 은 PgBouncer(트랜잭션 풀링) 주소이므로 prepared statement 를 끕니다.
    conn = psycopg.connect(_db_url(), connect_timeout=8, prepare_threshold=None)
    if not _schema_ready:
        with _lock:
            if not _schema_ready:
                with conn.cursor() as cur:
                    cur.execute(SCHEMA_SQL)
                conn.commit()
                _schema_ready = True
                log.info("reviews 스키마 확인 완료")
    return conn


def _row(r: tuple) -> dict[str, Any]:
    d = dict(zip(COLUMNS, r))
    for k in ("decided_at", "responded_at"):
        if isinstance(d[k], datetime):
            d[k] = d[k].isoformat()
    return d


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def ping() -> dict[str, Any]:
    """[유지보수 > 장애 대응] /api/health 에서 DB 연결 상태를 확인합니다."""
    if not _db_url():
        return {"store": "memory", "db_ok": None}
    try:
        with _connect() as conn, conn.cursor() as cur:
            cur.execute("SELECT count(*) FROM reviews")
            (count,) = cur.fetchone()
        return {"store": "postgres", "db_ok": True, "reviews": count}
    except Exception as exc:
        log.error("DB 연결 확인 실패: %s", type(exc).__name__)
        return {"store": "postgres", "db_ok": False, "error": "DB에 연결하지 못했습니다."}


def _log(cur, visit_id: str, decision: str, note: str, actor: str, action: str) -> None:
    cur.execute(
        "INSERT INTO review_log (visit_id, decision, note, reviewer, action) VALUES (%s, %s, %s, %s, %s)",
        (visit_id, decision, note, actor, action),
    )


# ── 조회 ─────────────────────────────────────────────────────────────
def list_reviews() -> dict[str, dict[str, Any]]:
    if not _db_url():
        with _lock:
            return {k: dict(v) for k, v in _memory.items()}
    try:
        with _connect() as conn, conn.cursor() as cur:
            cur.execute(f"SELECT {', '.join(COLUMNS)} FROM reviews")
            return {r[0]: _row(r) for r in cur.fetchall()}
    except Exception as exc:  # DB 장애 시 화면은 계속 동작해야 합니다.
        log.error("reviews 조회 실패: %s", type(exc).__name__)
        raise StoreError("결정 기록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.") from exc


# ── QI팀 결정 ─────────────────────────────────────────────────────────
def save_decision(visit_id: str, decision: str, note: str, reviewer: str, assigned_dept: str | None) -> dict[str, Any]:
    """소명 요청이면 stage=requested 로 부서에 배정, 그 밖에는 종결(closed)합니다.
    소명을 받은 뒤 확정할 때는 부서와 소명 내용을 그대로 남깁니다."""
    stage = "requested" if decision == "소명 요청" else "closed"
    if not _db_url():
        with _lock:
            prev = _memory.get(visit_id, {})
            rec = {c: prev.get(c) for c in COLUMNS}
            rec.update(visit_id=visit_id, decision=decision, note=note, reviewer=reviewer, decided_at=_now(), stage=stage)
            if stage == "requested":
                rec.update(assigned_dept=assigned_dept, response=None, responder=None, responded_at=None)
            _memory[visit_id] = rec
            return dict(rec)
    try:
        with _connect() as conn, conn.cursor() as cur:
            cur.execute(
                f"""
                INSERT INTO reviews (visit_id, decision, note, reviewer, decided_at, stage, assigned_dept)
                VALUES (%s, %s, %s, %s, now(), %s, %s)
                ON CONFLICT (visit_id) DO UPDATE SET
                  decision = EXCLUDED.decision, note = EXCLUDED.note, reviewer = EXCLUDED.reviewer,
                  decided_at = now(), stage = EXCLUDED.stage,
                  assigned_dept = CASE WHEN EXCLUDED.stage = 'requested' THEN EXCLUDED.assigned_dept ELSE reviews.assigned_dept END,
                  response      = CASE WHEN EXCLUDED.stage = 'requested' THEN NULL ELSE reviews.response END,
                  responder     = CASE WHEN EXCLUDED.stage = 'requested' THEN NULL ELSE reviews.responder END,
                  responded_at  = CASE WHEN EXCLUDED.stage = 'requested' THEN NULL ELSE reviews.responded_at END
                RETURNING {', '.join(COLUMNS)}
                """,
                (visit_id, decision, note, reviewer, stage, assigned_dept if stage == "requested" else None),
            )
            row = _row(cur.fetchone())
            _log(cur, visit_id, decision, note, reviewer, "decision")
        return row
    except Exception as exc:
        log.error("결정 저장 실패: %s", type(exc).__name__)
        raise StoreError("결정을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.") from exc


# ── 부서 소명 ─────────────────────────────────────────────────────────
def save_response(visit_id: str, response: str, responder: str, dept: str) -> dict[str, Any]:
    if not _db_url():
        with _lock:
            rec = _memory.get(visit_id)
            if not rec or rec.get("stage") != "requested" or rec.get("assigned_dept") != dept:
                raise StageConflict("이 건은 지금 우리 부서가 소명할 단계가 아니에요.")
            rec.update(response=response, responder=responder, responded_at=_now(), stage="answered")
            return dict(rec)
    try:
        with _connect() as conn, conn.cursor() as cur:
            cur.execute(
                f"""
                UPDATE reviews SET response = %s, responder = %s, responded_at = now(), stage = 'answered'
                WHERE visit_id = %s AND stage = 'requested' AND assigned_dept = %s
                RETURNING {', '.join(COLUMNS)}
                """,
                (response, responder, visit_id, dept),
            )
            got = cur.fetchone()
            if not got:
                raise StageConflict("이 건은 지금 우리 부서가 소명할 단계가 아니에요.")
            _log(cur, visit_id, "소명 제출", response, responder, "response")
        return _row(got)
    except StageConflict:
        raise
    except Exception as exc:
        log.error("소명 저장 실패: %s", type(exc).__name__)
        raise StoreError("소명을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.") from exc


# ── 되돌리기·초기화 ───────────────────────────────────────────────────
def delete_review(visit_id: str) -> None:
    if not _db_url():
        with _lock:
            _memory.pop(visit_id, None)
        return
    try:
        with _connect() as conn, conn.cursor() as cur:
            cur.execute("DELETE FROM reviews WHERE visit_id = %s", (visit_id,))
    except Exception as exc:
        log.error("review 삭제 실패: %s", type(exc).__name__)
        raise StoreError("결정을 되돌리지 못했습니다.") from exc


def reset_reviews(actor: str) -> int:
    """[데모] 모든 결정·소명·팀 메모를 비웁니다. 이력(review_log)에는 초기화 기록을 남깁니다."""
    if not _db_url():
        with _lock:
            n = len(_memory)
            _memory.clear()
            _notes.clear()
            return n
    try:
        with _connect() as conn, conn.cursor() as cur:
            cur.execute("DELETE FROM reviews")
            n = cur.rowcount
            cur.execute("DELETE FROM team_notes")
            _log(cur, "*", "초기화", f"{n}건 삭제", actor, "reset")
        return n
    except Exception as exc:
        log.error("초기화 실패: %s", type(exc).__name__)
        raise StoreError("데모 데이터를 초기화하지 못했습니다.") from exc


# ── 팀 내부 메모 ──────────────────────────────────────────────────────
NOTE_COLUMNS = ("id", "visit_id", "dept", "author", "body", "created_at")


def _note(r: tuple) -> dict[str, Any]:
    d = dict(zip(NOTE_COLUMNS, r))
    if isinstance(d["created_at"], datetime):
        d["created_at"] = d["created_at"].isoformat()
    return d


def list_notes(dept: str, visit_id: str | None = None) -> list[dict[str, Any]]:
    """같은 부서의 메모만 돌려줍니다. 최신순."""
    if not _db_url():
        with _lock:
            items = [dict(n) for n in _notes if n["dept"] == dept and (visit_id is None or n["visit_id"] == visit_id)]
        return sorted(items, key=lambda n: n["created_at"], reverse=True)
    try:
        with _connect() as conn, conn.cursor() as cur:
            if visit_id:
                cur.execute(
                    f"SELECT {', '.join(NOTE_COLUMNS)} FROM team_notes WHERE dept = %s AND visit_id = %s ORDER BY created_at DESC",
                    (dept, visit_id),
                )
            else:
                cur.execute(
                    f"SELECT {', '.join(NOTE_COLUMNS)} FROM team_notes WHERE dept = %s ORDER BY created_at DESC LIMIT 200",
                    (dept,),
                )
            return [_note(r) for r in cur.fetchall()]
    except Exception as exc:
        log.error("팀 메모 조회 실패: %s", type(exc).__name__)
        raise StoreError("팀 메모를 불러오지 못했습니다.") from exc


def add_note(visit_id: str, dept: str, author: str, body: str) -> dict[str, Any]:
    global _note_seq
    if not _db_url():
        with _lock:
            _note_seq += 1
            rec = {"id": _note_seq, "visit_id": visit_id, "dept": dept, "author": author, "body": body, "created_at": _now()}
            _notes.append(rec)
            return dict(rec)
    try:
        with _connect() as conn, conn.cursor() as cur:
            cur.execute(
                f"INSERT INTO team_notes (visit_id, dept, author, body) VALUES (%s, %s, %s, %s) RETURNING {', '.join(NOTE_COLUMNS)}",
                (visit_id, dept, author, body),
            )
            return _note(cur.fetchone())
    except Exception as exc:
        log.error("팀 메모 저장 실패: %s", type(exc).__name__)
        raise StoreError("팀 메모를 저장하지 못했습니다.") from exc


def delete_note(note_id: int, dept: str) -> bool:
    """같은 부서의 메모만 지웁니다. 지웠으면 True."""
    if not _db_url():
        with _lock:
            for i, n in enumerate(_notes):
                if n["id"] == note_id and n["dept"] == dept:
                    _notes.pop(i)
                    return True
        return False
    try:
        with _connect() as conn, conn.cursor() as cur:
            cur.execute("DELETE FROM team_notes WHERE id = %s AND dept = %s", (note_id, dept))
            return cur.rowcount > 0
    except Exception as exc:
        log.error("팀 메모 삭제 실패: %s", type(exc).__name__)
        raise StoreError("팀 메모를 지우지 못했습니다.") from exc
