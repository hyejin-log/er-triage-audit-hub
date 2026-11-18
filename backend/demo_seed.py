"""
[기획 > 시연] 예시 기록 채우기 — 처음 보는 사람이 실제 사용 모습을 바로 볼 수 있게
판정 완료 · 소명 요청중 · 소명 제출 단계의 예시 기록과 부서별 팀 메모를 만듭니다.

QI팀만 실행할 수 있고, 실행하면 기존 결정·소명·팀 메모를 먼저 비웁니다.
"""
from __future__ import annotations

from typing import Any

from . import store

# 감사 항목별 예시 문장 (프론트엔드 src/demoText.ts 와 같은 내용)
REQUEST = {
    "DOWNGRADE_NO_REASON": "등급을 {ki}등급에서 {kf}등급으로 낮췄는데 이유가 기록되어 있지 않습니다. 다시 확인했을 때의 증상과 혈압·맥박 같은 수치, 낮춘 이유를 알려 주세요.",
    "DOWNGRADE_WITH_REASON": "이유는 기록되어 있지만 {ki}등급에서 {kf}등급으로 크게 낮췄습니다. 다시 확인한 시각과 측정값을 보충해 주세요.",
    "UNDERTRIAGE_VITALS": "혈압·산소 수치가 위험한 범위인데 {kf}등급으로 낮게 분류되었습니다. 분류할 때 어떤 점을 보고 판단했는지 알려 주세요.",
    "LOS_OVER_24H": "응급실에 24시간 넘게 머물렀습니다. 입원 병실 배정이 늦어진 이유와 당시 병동 상황을 알려 주세요.",
    "BOARDING_OVER_6H": "입원이 정해진 뒤 병실 배정까지 6시간 넘게 걸렸습니다. 늦어진 이유를 알려 주세요.",
    "PHYSICIAN_DELAY": "{kf}등급 환자인데 목표 시간보다 늦게 진료했습니다. 같은 시간대 환자 수 등 늦어진 이유를 알려 주세요.",
    "BOUNCE_BACK_72H": "집에 돌아간 뒤 3일 안에 더 위급한 상태로 다시 왔습니다. 첫 방문 때 귀가를 결정한 이유와 안내한 주의 사항을 알려 주세요.",
}
RESPONSE = {
    "DOWNGRADE_NO_REASON": "다시 확인했을 때 통증이 줄고 수치가 안정되어 등급을 낮췄지만 이유 입력을 빠뜨렸습니다. 등급을 바꿀 때 이유를 꼭 입력하도록 팀 교육을 하겠습니다.",
    "DOWNGRADE_WITH_REASON": "다시 확인했을 때 증상이 크게 좋아져 등급을 낮췄습니다. 확인 시각과 측정값을 기록에 보충했고, 앞으로 크게 낮출 때는 두 사람이 함께 확인하겠습니다.",
    "UNDERTRIAGE_VITALS": "측정 오류일 수 있어 다시 재려고 했으나 기록이 남지 않았습니다. 위험한 수치가 나오면 바로 등급을 올리도록 분류 점검표를 고치겠습니다.",
    "LOS_OVER_24H": "당시 병동이 가득 차 입원 병실이 나지 않았습니다. 야간에도 병실 조정 회의를 열고, 다른 병원으로 옮기는 기준을 앞당기겠습니다.",
    "BOARDING_OVER_6H": "중환자실 병실이 부족해 배정이 늦었습니다. 병실 현황을 2시간마다 응급실과 공유하도록 바꾸겠습니다.",
    "PHYSICIAN_DELAY": "같은 시간대에 위급한 환자 두 명을 동시에 진료해 늦어졌습니다. 붐빌 때 추가 의료진을 부르는 기준을 만들겠습니다.",
    "BOUNCE_BACK_72H": "첫 방문 때 검사 결과가 정상이라 귀가했지만, 증상이 나빠지면 바로 다시 오라는 안내가 부족했습니다. 귀가 안내문을 보완하겠습니다.",
}
TEAM_NOTE = {
    "QI": "다음 달 의료 질 향상 위원회 보고 사례로 올릴 것. 비슷한 건이 반복되는지 함께 확인.",
    "NURSING": "팀 회의 안건: 등급을 바꿀 때 이유 입력 교육 자료에 이 사례 추가.",
    "EM": "다음 주 응급의학과 사례 회의에서 공유. 붐빌 때 진료 순서 조정 방법 논의.",
    "BED": "병동 협의 때 병실 배정 지연 사례로 보고. 야간 병실 현황 공유 방식 점검.",
}
DEPT_NAME = {"QI": "QI팀", "NURSING": "응급간호팀", "EM": "응급의학과", "BED": "병상관리팀"}


def _fill(text: str, v: dict[str, Any]) -> str:
    return text.replace("{ki}", str(v["ktas_initial"])).replace("{kf}", str(v["ktas_final"]))


def seed(visits: list[dict[str, Any]], actor: str) -> dict[str, int]:
    """예시 기록을 만들고 건수를 돌려줍니다. 기존 기록은 먼저 비웁니다."""
    store.reset_reviews(actor)
    flagged = [v for v in visits if v["flags"] and v.get("owner_dept")]
    by_dept: dict[str, list[dict[str, Any]]] = {}
    for v in flagged:
        by_dept.setdefault(v["owner_dept"], []).append(v)

    qi = "QI팀 데모"
    used: set[str] = set()
    counts = {"closed": 0, "requested": 0, "answered": 0, "notes": 0}

    def pick(dept: str) -> dict[str, Any] | None:
        for v in by_dept.get(dept, []):
            if v["visit_id"] not in used:
                used.add(v["visit_id"])
                return v
        return None

    def request(v: dict[str, Any]) -> None:
        code = v["flags"][0]["code"]
        store.save_decision(v["visit_id"], "소명 요청", _fill(REQUEST.get(code, "당시 상황과 이유를 알려 주세요."), v), qi, v["owner_dept"])

    def answer(v: dict[str, Any]) -> None:
        code = v["flags"][0]["code"]
        dept = v["owner_dept"]
        store.save_response(v["visit_id"], RESPONSE.get(code, "당시 상황을 확인했고 절차를 보완하겠습니다."), f"{DEPT_NAME[dept]} 데모", dept)

    # 1) 소명 제출 → QI 최종 판정까지 끝난 건 (응급의학과)
    if v := pick("EM"):
        request(v); answer(v)
        store.save_decision(v["visit_id"], "적정 확인", "소명 내용 확인. 당시 동시 진료로 인한 불가피한 지연으로 판단, 개선 계획 수용.", qi, None)
        counts["closed"] += 1
    # 2) 소명 제출, QI 확인 대기 (응급간호팀)
    if v := pick("NURSING"):
        request(v); answer(v)
        counts["answered"] += 1
    # 3) 소명 요청중, 부서 답변 대기 (병상관리팀)
    if v := pick("BED"):
        request(v)
        counts["requested"] += 1
    # 4) 바로 재분류 확정 (응급간호팀)
    if v := pick("NURSING"):
        store.save_decision(v["visit_id"], "재분류 확정",
                            f"[{v['visit_id']}] {v['flags'][0]['title']}. 기준에 맞지 않아 등급을 바로잡음. 해당 팀 교육 예정.", qi, None)
        counts["closed"] += 1
    # 5) 바로 적정 확인 (병상관리팀)
    if v := pick("BED"):
        store.save_decision(v["visit_id"], "적정 확인",
                            f"[{v['visit_id']}] 당시 병동이 가득 찼던 기록이 확인되어 적정으로 판단. 추가 조치 없음.", qi, None)
        counts["closed"] += 1

    # 부서별 팀 메모 (같은 부서만 볼 수 있음)
    for dept, note in TEAM_NOTE.items():
        target = next((v for v in flagged if v["owner_dept"] == dept), None) or (flagged[0] if flagged else None)
        if target:
            store.add_note(target["visit_id"], dept, f"{DEPT_NAME[dept]} 데모", note)
            counts["notes"] += 1
    return counts
