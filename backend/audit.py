"""
[개발 > 백엔드 API] 응급실 KTAS 감사 규칙 엔진

Rebate Lens의 "관련 거래처 합산 → 전결 한도 초과 차단 → AI 근거 제안 → 담당자 확정"
구조를 응급실 감사에 옮긴 것입니다.

    판매장려금 지급 건      →  응급실 내원 건
    관련 거래처 그룹 합산   →  구역별 동시 재실 환자 합산
    전결 한도               →  구역 병상 수 (과밀화 100%)
    지급 보류(확인 필요)    →  High Risk 이상 징후 카드
"""
from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime
from typing import Any

# ── 규칙 정의 ───────────────────────────────────────────────────────────
# severity: high = 확인 필요(빨간 카드), medium = 주의 관찰
RULES: dict[str, dict[str, str]] = {
    "LOS_OVER_24H": {
        "severity": "high",
        "title": "24시간 초과 체류",
        "basis": "응급실 재실시간 24시간 이상은 응급의료기관 평가에서 관리하는 핵심 지표입니다.",
    },
    "DOWNGRADE_NO_REASON": {
        "severity": "high",
        "title": "근거 없는 KTAS 하향 재분류",
        "basis": "재분류로 등급이 낮아질 때(숫자 증가)는 재평가 근거를 기록해야 합니다.",
    },
    "UNDERTRIAGE_VITALS": {
        "severity": "high",
        "title": "활력징후 대비 과소분류 의심",
        "basis": "수축기혈압 <90, 산소포화도 <90%, GCS ≤12, 호흡수 ≥30 중 하나라도 있으면 KTAS 1~2 고려 대상입니다.",
    },
    "BOUNCE_BACK_72H": {
        "severity": "high",
        "title": "72시간 내 재내원 · 등급 상향",
        "basis": "귀가 후 72시간 안에 더 높은 중증도로 다시 온 경우 첫 방문의 분류·퇴실 판단을 검토합니다.",
    },
    "PHYSICIAN_DELAY": {
        "severity": "medium",
        "title": "KTAS 목표 시간 내 진료 미달",
        "basis": "KTAS 등급별 의사 진료 목표: 1등급 즉시, 2등급 10분, 3등급 30분, 4등급 60분, 5등급 120분.",
    },
    "BOARDING_OVER_6H": {
        "severity": "medium",
        "title": "입원 결정 후 병상 배정 6시간 초과",
        "basis": "입원 결정 후 응급실 대기(boarding)가 길어지면 과밀화와 환자 안전 위험이 커집니다.",
    },
    "DOWNGRADE_WITH_REASON": {
        "severity": "medium",
        "title": "KTAS 하향 재분류 (근거 기록됨)",
        "basis": "근거는 있지만 2단계 이상 하향은 담당자 확인을 권장합니다.",
    },
}

SEVERITY_ORDER = {"high": 0, "medium": 1}
LOS_LIMIT_H = 24
BOARDING_LIMIT_H = 6
BOUNCE_BACK_H = 72


def _t(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        # 잘못된 시각 형식은 감사에서 제외하고 계속 진행합니다(예외 처리).
        return None


def _minutes(a: datetime | None, b: datetime | None) -> int | None:
    if a is None or b is None:
        return None
    return int((b - a).total_seconds() // 60)


def _fmt_dur(minutes: int | None) -> str:
    if minutes is None:
        return "-"
    h, m = divmod(minutes, 60)
    return f"{h}시간 {m}분" if h else f"{m}분"


@dataclass
class Flag:
    code: str
    detail: str

    def to_dict(self) -> dict[str, str]:
        rule = RULES[self.code]
        return {
            "code": self.code,
            "severity": rule["severity"],
            "title": rule["title"],
            "basis": rule["basis"],
            "detail": self.detail,
        }


# ── 내원 1건 감사 ─────────────────────────────────────────────────────
def audit_visit(visit: dict[str, Any], targets: dict[int, int]) -> dict[str, Any]:
    t = {k: _t(v) for k, v in visit["times"].items()}
    flags: list[Flag] = []

    los = _minutes(t["arrival"], t["departure"])
    door_to_doc = _minutes(t["triage"], t["physician_seen"])
    boarding = _minutes(t["disposition_decision"], t["bed_assigned"])

    if los is not None and los >= LOS_LIMIT_H * 60:
        flags.append(Flag("LOS_OVER_24H", f"총 체류 {_fmt_dur(los)} (기준 24시간)"))

    ki, kf = visit["ktas_initial"], visit["ktas_final"]
    if kf > ki:
        if visit.get("retriage_reason"):
            if kf - ki >= 2:
                flags.append(Flag("DOWNGRADE_WITH_REASON", f"KTAS {ki} → {kf} · 근거: {visit['retriage_reason']}"))
        else:
            flags.append(Flag("DOWNGRADE_NO_REASON", f"KTAS {ki} → {kf} · 재분류 근거 기록 없음"))

    v = visit["vitals"]
    abnormal = []
    if v["sbp"] < 90:
        abnormal.append(f"수축기혈압 {v['sbp']}")
    if v["spo2"] < 90:
        abnormal.append(f"SpO₂ {v['spo2']}%")
    if v["gcs"] <= 12:
        abnormal.append(f"GCS {v['gcs']}")
    if v["rr"] >= 30:
        abnormal.append(f"호흡수 {v['rr']}")
    if abnormal and kf >= 3:
        flags.append(Flag("UNDERTRIAGE_VITALS", f"KTAS {kf}등급인데 {', '.join(abnormal)}"))

    target = targets.get(kf)
    if target is not None and door_to_doc is not None and door_to_doc > max(target, 1) + 5:
        flags.append(Flag("PHYSICIAN_DELAY", f"분류 후 진료까지 {_fmt_dur(door_to_doc)} (목표 {target}분)"))

    if boarding is not None and BOARDING_LIMIT_H * 60 <= boarding and (los or 0) < LOS_LIMIT_H * 60:
        flags.append(Flag("BOARDING_OVER_6H", f"입원 결정 후 병상 배정까지 {_fmt_dur(boarding)}"))

    return {
        "metrics": {
            "los_min": los,
            "door_to_doc_min": door_to_doc,
            "boarding_min": boarding,
            "ktas_target_min": target,
        },
        "flags": flags,
    }


def _bounce_backs(visits: list[dict[str, Any]]) -> dict[str, Flag]:
    """같은 환자가 귀가 후 72시간 안에 더 높은 중증도로 재내원한 건을 찾습니다."""
    by_patient: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for v in visits:
        by_patient[v["patient_ref"]].append(v)
    found: dict[str, Flag] = {}
    for items in by_patient.values():
        items.sort(key=lambda x: x["times"]["arrival"])
        for prev, nxt in zip(items, items[1:]):
            dep, arr = _t(prev["times"]["departure"]), _t(nxt["times"]["arrival"])
            if not dep or not arr or prev["disposition"] != "귀가":
                continue
            gap = (arr - dep).total_seconds() / 3600
            if 0 <= gap <= BOUNCE_BACK_H and nxt["ktas_final"] < prev["ktas_final"]:
                found[nxt["visit_id"]] = Flag(
                    "BOUNCE_BACK_72H",
                    f"{prev['visit_id']} 귀가(KTAS {prev['ktas_final']}) 후 {gap:.0f}시간 만에 KTAS {nxt['ktas_final']}로 재내원",
                )
    return found


# ── 구역 합산 (Rebate Lens의 '관련 거래처 그룹 합계 vs 전결 한도') ────────
def zone_crowding(visits: list[dict[str, Any]], beds: dict[str, int]) -> list[dict[str, Any]]:
    events: dict[str, list[tuple[datetime, int, str]]] = defaultdict(list)
    for v in visits:
        a, d = _t(v["times"]["arrival"]), _t(v["times"]["departure"])
        if not a or not d:
            continue
        events[v["zone"]].append((a, 1, v["visit_id"]))
        events[v["zone"]].append((d, -1, v["visit_id"]))

    result = []
    for zone, capacity in beds.items():
        current, peak, peak_at = 0, 0, None
        over_minutes, last_t = 0, None
        # 같은 시각이면 퇴실(-1)을 먼저 처리
        for when, delta, _ in sorted(events.get(zone, []), key=lambda e: (e[0], e[1])):
            if last_t is not None and current > capacity:
                over_minutes += int((when - last_t).total_seconds() // 60)
            current += delta
            last_t = when
            if current > peak:
                peak, peak_at = current, when
        ratio = round(peak / capacity * 100) if capacity else 0
        result.append({
            "zone": zone,
            "beds": capacity,
            "peak": peak,
            "peak_at": peak_at.strftime("%Y-%m-%dT%H:%M") if peak_at else None,
            "ratio": ratio,
            "over_beds": max(0, peak - capacity),
            "over_minutes": over_minutes,
            "visits": sum(1 for v in visits if v["zone"] == zone),
        })
    result.sort(key=lambda z: z["ratio"], reverse=True)
    return result


# ── 전체 감사 ─────────────────────────────────────────────────────────
def run_audit(dataset: dict[str, Any]) -> dict[str, Any]:
    meta = dataset["meta"]
    targets = {int(k): int(v) for k, v in meta["ktas_target_minutes"].items()}
    visits = dataset["visits"]
    bounce = _bounce_backs(visits)

    audited = []
    for v in visits:
        res = audit_visit(v, targets)
        flags = res["flags"]
        if v["visit_id"] in bounce:
            flags.append(bounce[v["visit_id"]])
        flags.sort(key=lambda f: SEVERITY_ORDER[RULES[f.code]["severity"]])
        sev = {RULES[f.code]["severity"] for f in flags}
        status = "high" if "high" in sev else "medium" if "medium" in sev else "normal"
        audited.append({**v, "metrics": res["metrics"], "flags": [f.to_dict() for f in flags], "status": status})

    status_count = Counter(a["status"] for a in audited)
    rule_count = Counter(f["code"] for a in audited for f in a["flags"])
    los_values = [a["metrics"]["los_min"] for a in audited if a["metrics"]["los_min"] is not None]

    los_buckets = {"6시간 이내": 0, "6~24시간": 0, "24시간 초과": 0}
    for m in los_values:
        if m < 360:
            los_buckets["6시간 이내"] += 1
        elif m < 1440:
            los_buckets["6~24시간"] += 1
        else:
            los_buckets["24시간 초과"] += 1

    summary = {
        "period": meta["period"],
        "hospital": meta["hospital"],
        "total": len(audited),
        "high": status_count.get("high", 0),
        "medium": status_count.get("medium", 0),
        "normal": status_count.get("normal", 0),
        "median_los_min": sorted(los_values)[len(los_values) // 2] if los_values else None,
        "ktas_mix": dict(sorted(Counter(a["ktas_final"] for a in audited).items())),
        "disposition": dict(Counter(a["disposition"] for a in audited).most_common()),
        "los_buckets": los_buckets,
        "rule_counts": {code: rule_count.get(code, 0) for code in RULES},
        "zones": zone_crowding(visits, meta["zone_beds"]),
    }
    return {"summary": summary, "visits": audited, "rules": RULES}


def rule_based_rationale(visit: dict[str, Any]) -> dict[str, Any]:
    """LLM 없이도 동작하는 근거 제안. 결정은 항상 담당자가 합니다."""
    flags = visit.get("flags", [])
    if not flags:
        return {
            "source": "rules",
            "summary": "감사 규칙에 걸린 항목이 없습니다. 정상 진행 대상입니다.",
            "suggested_action": "적정 확인",
            "checklist": [],
        }
    top = flags[0]
    checklist = []
    codes = {f["code"] for f in flags}
    if "DOWNGRADE_NO_REASON" in codes or "UNDERTRIAGE_VITALS" in codes:
        checklist += ["분류 간호사 재평가 기록 확인", "재분류 시점의 활력징후 재측정값 대조"]
    if "LOS_OVER_24H" in codes or "BOARDING_OVER_6H" in codes:
        checklist += ["입원 결정 시각과 병상 요청 기록 대조", "병동 병상 가용 현황(같은 시간대) 확인"]
    if "PHYSICIAN_DELAY" in codes:
        checklist += ["같은 시간대 구역 과밀화 여부 확인", "진료 시작 기록 누락 여부 확인"]
    if "BOUNCE_BACK_72H" in codes:
        checklist += ["첫 방문 퇴실 판단·교육 기록 확인", "두 방문 간 진단 변화 확인"]

    action = "소명 요청" if top["severity"] == "high" else "적정 확인"
    return {
        "source": "rules",
        "summary": f"{top['title']}: {top['detail']}. " + (f"외 {len(flags) - 1}건의 신호가 함께 있습니다." if len(flags) > 1 else ""),
        "suggested_action": action,
        "checklist": checklist,
    }


def fmt_duration(minutes: int | None) -> str:
    return _fmt_dur(minutes)


__all__ = ["RULES", "run_audit", "rule_based_rationale", "fmt_duration"]
