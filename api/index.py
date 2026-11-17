"""
[개발 > 백엔드 API] ER Triage & Bottleneck Audit Hub — FastAPI

로컬:   uvicorn api.index:app --reload --port 8000
Vercel: api/index.py 가 서버리스 함수로 배포되고 /api/* 요청을 처리합니다(vercel.json).
"""
from __future__ import annotations

import io
import json
import logging
import sys
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend import store  # noqa: E402
from backend.auth import User, email_login_enabled, issue_demo_token, require_qi, require_user  # noqa: E402
from backend.departments import DEPARTMENTS, RULE_DEPT, dept_name, owner_dept  # noqa: E402
from backend.ai import ai_rationale  # noqa: E402
from backend.audit import run_audit  # noqa: E402

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("er-audit.api")

DATA_FILE = ROOT / "data" / "ed_visits.json"

app = FastAPI(title="ER Triage & Bottleneck Audit Hub", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5180", "http://127.0.0.1:5180"],
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
)


@lru_cache(maxsize=1)
def audit_result() -> dict[str, Any]:
    try:
        dataset = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise RuntimeError("data/ed_visits.json 이 없습니다. scripts/generate_data.py 를 먼저 실행하세요.") from exc
    except json.JSONDecodeError as exc:
        raise RuntimeError("data/ed_visits.json 형식이 올바르지 않습니다.") from exc
    result = run_audit(dataset)
    for v in result["visits"]:
        v["owner_dept"] = owner_dept(v)  # 소명 요청 시 배정될 부서
    return result


def find_visit(visit_id: str) -> dict[str, Any]:
    for v in audit_result()["visits"]:
        if v["visit_id"] == visit_id:
            return v
    raise HTTPException(status_code=404, detail=f"{visit_id} 내원 기록을 찾을 수 없습니다.")


@app.exception_handler(RuntimeError)
async def runtime_error_handler(_, exc: RuntimeError):
    log.error("runtime error: %s", exc)
    return JSONResponse(status_code=503, content={"detail": str(exc)})


# ── 조회 ─────────────────────────────────────────────────────────────
@app.get("/api/health")
def health():
    db = store.ping()
    return {"ok": db.get("db_ok") is not False, "visits": len(audit_result()["visits"]), "email_login": email_login_enabled(), "demo_login": True, **db}


@app.get("/api/summary")
def summary():
    return audit_result()["summary"]


@app.get("/api/rules")
def rules():
    return audit_result()["rules"]


@app.get("/api/visits")
def visits(
    status: Literal["all", "high", "medium", "normal"] = "all",
    zone: str | None = None,
    q: str | None = Query(default=None, max_length=50),
    _user: User = Depends(require_user),  # [개발 > 인증] 내원 상세는 로그인한 팀만
):
    items = audit_result()["visits"]
    if status != "all":
        items = [v for v in items if v["status"] == status]
    if zone:
        items = [v for v in items if v["zone"] == zone]
    if q:
        needle = q.strip().lower()
        items = [
            v for v in items
            if needle in v["visit_id"].lower()
            or needle in v["patient_ref"].lower()
            or needle in v["chief_complaint"].lower()
        ]
    return {"count": len(items), "items": items}


@app.get("/api/visits/{visit_id}")
def visit_detail(visit_id: str, _user: User = Depends(require_user)):
    return find_visit(visit_id)


@app.post("/api/visits/{visit_id}/ai-review")
def visit_ai_review(visit_id: str, _user: User = Depends(require_user)):
    return ai_rationale(find_visit(visit_id))


# ── 로그인 ─────────────────────────────────────────────────────────
class DemoLoginIn(BaseModel):
    dept: Literal["QI", "NURSING", "EM", "BED"]


@app.post("/api/demo-login")
def demo_login(body: DemoLoginIn):
    """[개발 > 인증] 부서별 원클릭 데모 로그인 (메일·비밀번호 없음)."""
    token, user = issue_demo_token(body.dept)
    return {"token": token, "user": user.to_dict()}


@app.get("/api/me")
def me(user: User = Depends(require_user)):
    return user.to_dict()


@app.get("/api/departments")
def departments():
    return {"departments": DEPARTMENTS, "rule_dept": RULE_DEPT}


# ── QI팀 결정 → 부서 소명 → QI팀 확정 ──────────────────────────────────
class ReviewIn(BaseModel):
    visit_id: str = Field(min_length=3, max_length=30)
    decision: Literal["적정 확인", "재분류 확정", "소명 요청"]
    note: str = Field(default="", max_length=500)


class ResponseIn(BaseModel):
    response: str = Field(min_length=5, max_length=1000)


def _store_call(fn, *args):
    try:
        return fn(*args)
    except store.StageConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except store.StoreError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.get("/api/progress")
def progress():
    """[공개] 로그인 전 소개 화면용 진행 집계 — 건별 내용 없이 숫자만."""
    try:
        items = store.list_reviews().values()
    except store.StoreError:
        return {"available": False}
    flagged = sum(1 for v in audit_result()["visits"] if v["flags"])
    by_stage = {"requested": 0, "answered": 0, "closed": 0}
    for r in items:
        by_stage[r.get("stage") or "closed"] = by_stage.get(r.get("stage") or "closed", 0) + 1
    decided = sum(by_stage.values())
    return {"available": True, "flagged": flagged, "undecided": max(flagged - decided, 0), **by_stage}


@app.get("/api/reviews")
def get_reviews(_user: User = Depends(require_user)):
    return {"store": store.backend_name(), "items": _store_call(store.list_reviews)}


@app.post("/api/reviews", status_code=201)
def post_review(body: ReviewIn, user: User = Depends(require_qi)):
    visit = find_visit(body.visit_id)
    note = body.note.strip()
    if body.decision != "적정 확인" and not note:
        raise HTTPException(status_code=422, detail="재분류·소명 요청은 메모가 필요해요.")
    dept = visit.get("owner_dept") if body.decision == "소명 요청" else None
    if body.decision == "소명 요청" and not dept:
        raise HTTPException(status_code=422, detail="감사 신호가 없는 건은 소명을 요청할 수 없어요.")
    reviewer = f"{user.name} ({user.dept_name})" if user.kind == "email" else user.name
    return _store_call(store.save_decision, body.visit_id, body.decision, note, reviewer, dept)


@app.post("/api/reviews/{visit_id}/response", status_code=201)
def post_response(visit_id: str, body: ResponseIn, user: User = Depends(require_user)):
    """담당 부서가 소명을 제출합니다. 배정된 부서만 할 수 있습니다."""
    find_visit(visit_id)
    if user.dept == "QI":
        raise HTTPException(status_code=403, detail="소명은 배정된 부서가 제출해요. QI팀은 소명을 읽고 확정합니다.")
    responder = f"{user.name} ({user.dept_name})" if user.kind == "email" else user.name
    return _store_call(store.save_response, visit_id, body.response.strip(), responder, user.dept)


@app.delete("/api/reviews/{visit_id}", status_code=204)
def remove_review(visit_id: str, _user: User = Depends(require_qi)):
    _store_call(store.delete_review, visit_id)


@app.post("/api/demo/reset")
def demo_reset(user: User = Depends(require_qi)):
    """[데모] 모든 결정·소명을 비워 처음 상태로 되돌립니다. (QI팀만)"""
    return {"deleted": _store_call(store.reset_reviews, user.name)}


# ── 팀 내부 메모 (같은 부서만 읽고 씀) ────────────────────────────────
class NoteIn(BaseModel):
    visit_id: str = Field(min_length=3, max_length=30)
    body: str = Field(min_length=1, max_length=500)


@app.get("/api/notes")
def get_notes(visit_id: str | None = Query(default=None, max_length=30), user: User = Depends(require_user)):
    return {"dept": user.dept, "items": _store_call(store.list_notes, user.dept, visit_id)}


@app.post("/api/notes", status_code=201)
def post_note(body: NoteIn, user: User = Depends(require_user)):
    find_visit(body.visit_id)
    text = body.body.strip()
    if not text:
        raise HTTPException(status_code=422, detail="메모 내용을 적어 주세요.")
    author = f"{user.name} ({user.dept_name})" if user.kind == "email" else user.name
    return _store_call(store.add_note, body.visit_id, user.dept, author, text)


@app.delete("/api/notes/{note_id}", status_code=204)
def remove_note(note_id: int, user: User = Depends(require_user)):
    if not _store_call(store.delete_note, note_id, user.dept):
        raise HTTPException(status_code=404, detail="우리 팀 메모가 아니거나 이미 지워졌어요.")


# ── 내보내기 (이음 프로젝트와 같은 openpyxl 기반) ──────────────────────
@app.get("/api/export.xlsx")
def export_xlsx(_user: User = Depends(require_user)):
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill

    try:
        reviews = store.list_reviews()
    except store.StoreError:
        reviews = {}

    wb = Workbook()
    ws = wb.active
    ws.title = "감사 결과"
    header = ["내원번호", "상태", "구역", "KTAS 최초", "KTAS 최종", "주호소", "체류(분)",
              "진료대기(분)", "병상대기(분)", "퇴실", "감사 신호", "QI 결정", "진행 단계", "담당 부서", "QI 메모", "부서 소명"]
    ws.append(header)
    for cell in ws[1]:
        cell.font = Font(bold=True)
    red = PatternFill("solid", fgColor="FDE2E1")
    label = {"high": "확인 필요", "medium": "주의", "normal": "정상"}
    stage_label = {"requested": "소명 요청중", "answered": "소명 제출", "closed": "종결"}
    for v in audit_result()["visits"]:
        r = reviews.get(v["visit_id"], {})
        ws.append([
            v["visit_id"], label[v["status"]], v["zone"], v["ktas_initial"], v["ktas_final"],
            v["chief_complaint"], v["metrics"]["los_min"], v["metrics"]["door_to_doc_min"],
            v["metrics"]["boarding_min"], v["disposition"],
            " / ".join(f["title"] for f in v["flags"]), r.get("decision", ""), stage_label.get(r.get("stage") or "", "미결" if v["flags"] else ""),
            dept_name(r.get("assigned_dept")) if r.get("assigned_dept") else "", r.get("note", ""), r.get("response") or "",
        ])
        if v["status"] == "high":
            for cell in ws[ws.max_row]:
                cell.fill = red
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="er-triage-audit.xlsx"'},
    )
