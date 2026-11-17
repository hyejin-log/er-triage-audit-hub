"""
[설계 > 사용자 시나리오] 부서와 감사 규칙의 담당 관계

QI팀이 '소명 요청'을 하면, 그 내원 건의 가장 중요한 감사 신호(첫 번째 flag)를 보고
담당 부서로 자동 배정합니다. 부서는 소명을 제출하고, QI팀이 읽고 최종 확정합니다.
"""
from __future__ import annotations

from typing import Any

DEPARTMENTS: dict[str, dict[str, str]] = {
    "QI": {"name": "QI팀", "role": "감사·최종 판정"},
    "NURSING": {"name": "응급간호팀", "role": "KTAS 분류"},
    "EM": {"name": "응급의학과", "role": "진료"},
    "BED": {"name": "병상관리팀", "role": "입원·병상"},
}

# 감사 규칙 → 소명 담당 부서
RULE_DEPT: dict[str, str] = {
    "DOWNGRADE_NO_REASON": "NURSING",
    "DOWNGRADE_WITH_REASON": "NURSING",
    "UNDERTRIAGE_VITALS": "NURSING",
    "PHYSICIAN_DELAY": "EM",
    "BOUNCE_BACK_72H": "EM",
    "LOS_OVER_24H": "BED",
    "BOARDING_OVER_6H": "BED",
}


def owner_dept(visit: dict[str, Any]) -> str | None:
    """가장 앞의(가장 심각한) 감사 신호의 담당 부서."""
    flags = visit.get("flags") or []
    if not flags:
        return None
    return RULE_DEPT.get(flags[0]["code"], "QI")


def dept_name(code: str | None) -> str:
    return DEPARTMENTS.get(code or "", {}).get("name", "-")
