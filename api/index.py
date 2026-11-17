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

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend import store  # noqa: E402
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
    allow_headers=["Content-Type"],
)


@lru_cache(maxsize=1)
def audit_result() -> dict[str, Any]:
    try:
        dataset = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise RuntimeError("data/ed_visits.json 이 없습니다. scripts/generate_data.py 를 먼저 실행하세요.") from exc
    except json.JSONDecodeError as exc:
        raise RuntimeError("data/ed_visits.json 형식이 올바르지 않습니다.") from exc
    return run_audit(dataset)


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
    return {"ok": True, "store": store.backend_name(), "visits": len(audit_result()["visits"])}


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
def visit_detail(visit_id: str):
    return find_visit(visit_id)


@app.post("/api/visits/{visit_id}/ai-review")
def visit_ai_review(visit_id: str):
    return ai_rationale(find_visit(visit_id))


# ── 담당자 결정 ───────────────────────────────────────────────────────
class ReviewIn(BaseModel):
    visit_id: str = Field(min_length=3, max_length=30)
    decision: Literal["적정 확인", "재분류 확정", "소명 요청"]
    note: str = Field(default="", max_length=500)
    reviewer: str = Field(min_length=1, max_length=40)


@app.get("/api/reviews")
def get_reviews():
    try:
        return {"store": store.backend_name(), "items": store.list_reviews()}
    except store.StoreError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post("/api/reviews", status_code=201)
def post_review(body: ReviewIn):
    find_visit(body.visit_id)  # 존재 확인
    try:
        return store.save_review(body.visit_id, body.decision, body.note.strip(), body.reviewer.strip())
    except store.StoreError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.delete("/api/reviews/{visit_id}", status_code=204)
def remove_review(visit_id: str):
    try:
        store.delete_review(visit_id)
    except store.StoreError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


# ── 내보내기 (이음 프로젝트와 같은 openpyxl 기반) ──────────────────────
@app.get("/api/export.xlsx")
def export_xlsx():
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
              "진료대기(분)", "병상대기(분)", "퇴실", "감사 신호", "담당자 결정", "메모"]
    ws.append(header)
    for cell in ws[1]:
        cell.font = Font(bold=True)
    red = PatternFill("solid", fgColor="FDE2E1")
    label = {"high": "확인 필요", "medium": "주의", "normal": "정상"}
    for v in audit_result()["visits"]:
        r = reviews.get(v["visit_id"], {})
        ws.append([
            v["visit_id"], label[v["status"]], v["zone"], v["ktas_initial"], v["ktas_final"],
            v["chief_complaint"], v["metrics"]["los_min"], v["metrics"]["door_to_doc_min"],
            v["metrics"]["boarding_min"], v["disposition"],
            " / ".join(f["title"] for f in v["flags"]), r.get("decision", ""), r.get("note", ""),
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
