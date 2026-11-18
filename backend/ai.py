"""
[개발 > 백엔드 API] AI 근거 제안

- ANTHROPIC_API_KEY 가 있으면 Claude에게 근거 요약을 요청합니다.
- 키가 없거나 호출이 실패하면 규칙 기반 근거(backend.audit.rule_based_rationale)로 대체합니다.
- AI는 근거만 제안하고, 승인·재분류·소명 요청 결정은 항상 담당자가 합니다.

개인정보: 가상 데이터만 전송하며, 실제 환자 데이터를 연결할 때는 비식별화가 필수입니다.
"""
from __future__ import annotations

import json
import logging
import os
from typing import Any

from .audit import rule_based_rationale

log = logging.getLogger("er-audit.ai")

MODEL = os.getenv("CLAUDE_MODEL", "claude-opus-5-5")
ALLOWED_ACTIONS = ("적정 확인", "재분류 확정", "소명 요청")

SYSTEM_PROMPT = """당신은 응급실 진료 질 감사를 돕는 보조자입니다.
입력으로 응급실 내원 1건의 KTAS 분류, 활력징후, 시간 기록, 규칙 엔진이 찾은 신호가 주어집니다.
감사 담당자가 빠르게 판단할 수 있도록 근거를 정리하세요. 최종 결정은 담당자가 합니다.

규칙:
- 주어진 데이터에 없는 사실을 지어내지 마세요.
- 진단이나 치료 권고는 하지 마세요. 기록·절차 관점의 감사 근거만 다룹니다.
- 한국어 합니다체로, 짧고 구체적으로 씁니다. 응급의료를 모르는 사람도 읽을 수 있게 전문 용어는 일상어로 풀어 씁니다(예: 활력징후 → 혈압·맥박 같은 기본 수치).
- 반드시 아래 JSON 하나만 출력합니다.
{"summary": "2~3문장 요약", "suggested_action": "적정 확인 | 재분류 확정 | 소명 요청 중 하나", "checklist": ["담당자가 확인할 기록 2~4개"]}"""


def _visit_payload(visit: dict[str, Any]) -> dict[str, Any]:
    """LLM에 보낼 최소 정보만 추립니다(환자 참조번호 제외)."""
    return {
        "visit_id": visit["visit_id"],
        "age": visit["age"],
        "sex": visit["sex"],
        "chief_complaint": visit["chief_complaint"],
        "arrival_mode": visit["arrival_mode"],
        "zone": visit["zone"],
        "ktas_initial": visit["ktas_initial"],
        "ktas_final": visit["ktas_final"],
        "retriage_reason": visit.get("retriage_reason"),
        "vitals": visit["vitals"],
        "times": visit["times"],
        "metrics": visit.get("metrics"),
        "disposition": visit["disposition"],
        "flags": [{"title": f["title"], "detail": f["detail"]} for f in visit.get("flags", [])],
    }


def _parse(text: str) -> dict[str, Any] | None:
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end <= start:
        return None
    try:
        data = json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        return None
    if not isinstance(data.get("summary"), str):
        return None
    action = data.get("suggested_action")
    checklist = data.get("checklist") if isinstance(data.get("checklist"), list) else []
    return {
        "summary": data["summary"].strip(),
        "suggested_action": action if action in ALLOWED_ACTIONS else "소명 요청",
        "checklist": [str(c) for c in checklist][:5],
    }


def ai_rationale(visit: dict[str, Any]) -> dict[str, Any]:
    fallback = rule_based_rationale(visit)
    if not visit.get("flags"):
        return fallback
    if not os.getenv("ANTHROPIC_API_KEY"):
        return {**fallback, "note": "ANTHROPIC_API_KEY 가 없어 규칙 기반 근거를 보여줍니다."}

    try:
        import anthropic
    except ImportError:
        return {**fallback, "note": "anthropic 패키지가 설치되지 않았습니다."}

    try:
        client = anthropic.Anthropic(timeout=30.0, max_retries=1)
        response = client.beta.messages.create(
            model=MODEL,
            max_tokens=2000,
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            output_config={"effort": "low"},
            system=SYSTEM_PROMPT,
            messages=[{
                "role": "user",
                "content": json.dumps(_visit_payload(visit), ensure_ascii=False),
            }],
        )
    except anthropic.RateLimitError:
        log.warning("Claude rate limited")
        return {**fallback, "note": "AI 호출 한도에 걸려 규칙 기반 근거를 보여줍니다."}
    except anthropic.APIStatusError as exc:
        log.warning("Claude API error %s", exc.status_code)
        return {**fallback, "note": f"AI 호출 오류({exc.status_code})로 규칙 기반 근거를 보여줍니다."}
    except anthropic.APIConnectionError:
        log.warning("Claude connection error")
        return {**fallback, "note": "AI 서버에 연결하지 못해 규칙 기반 근거를 보여줍니다."}

    if response.stop_reason == "refusal":
        return {**fallback, "note": "AI가 이 요청에 답하지 않아 규칙 기반 근거를 보여줍니다."}

    text = "".join(block.text for block in response.content if block.type == "text")
    parsed = _parse(text)
    if parsed is None:
        return {**fallback, "note": "AI 응답 형식이 맞지 않아 규칙 기반 근거를 보여줍니다."}
    return {"source": "claude", "model": response.model, **parsed}
