"""
[개발 > DB구축] 응급실 내원 가상 데이터 생성기

실제 환자 정보는 하나도 들어가지 않습니다. 시드(seed)를 고정해서
매번 같은 데이터가 나오게 하고, 감사 규칙이 걸리는 사례를 의도적으로 섞습니다.

사용법:
    python scripts/generate_data.py            # data/ed_visits.json 생성
    python scripts/generate_data.py --n 150    # 건수 변경
"""
from __future__ import annotations

import argparse
import json
import random
from datetime import datetime, timedelta
from pathlib import Path

SEED = 20261031
YEAR, MONTH = 2026, 10
AUDIT_DAYS = [30, 31]
# 0시~23시 내원 가중치 (오전 10시~밤 11시에 몰림)
HOURLY_WEIGHTS = [3, 2, 2, 1, 1, 1, 2, 3, 4, 6, 8, 9, 9, 8, 8, 8, 9, 9, 10, 10, 9, 8, 6, 4]

ZONES = {
    # 구역: (병상 수, 주로 오는 KTAS 등급)
    "소생구역": (4, [1, 2]),
    "중증구역": (14, [2, 3]),
    "경증구역": (12, [3, 4, 5]),
    "소아구역": (6, [2, 3, 4, 5]),
}

# 주호소: (기본 KTAS 후보, 활력징후 이상 경향)
COMPLAINTS = {
    "흉통": ([2, 3], "cardiac"),
    "호흡곤란": ([2, 3], "resp"),
    "의식저하": ([1, 2], "neuro"),
    "복통": ([3, 4], "normal"),
    "발열": ([3, 4, 5], "fever"),
    "두통": ([3, 4], "normal"),
    "어지럼증": ([3, 4], "normal"),
    "열상": ([4, 5], "normal"),
    "골절 의심": ([3, 4], "normal"),
    "교통사고 외상": ([2, 3], "trauma"),
    "토혈": ([2, 3], "bleed"),
    "경련": ([2, 3], "neuro"),
}

ARRIVAL_MODES = ["119 구급차", "도보·자가용", "타병원 전원"]
NURSES = ["TN-01", "TN-02", "TN-03", "TN-04", "TN-05", "TN-06"]
PHYSICIANS = ["EM-11", "EM-12", "EM-13", "EM-14", "EM-15"]

# KTAS 등급별 의사 진료 목표 시간(분)
KTAS_TARGET_MIN = {1: 0, 2: 10, 3: 30, 4: 60, 5: 120}


def vitals_for(trend: str, ktas: int, rng: random.Random) -> dict:
    """주호소 경향과 등급에 맞는 활력징후를 만듭니다."""
    sick = ktas <= 2
    v = {
        "sbp": rng.randint(110, 145),
        "hr": rng.randint(68, 98),
        "rr": rng.randint(14, 20),
        "spo2": rng.randint(96, 100),
        "temp": round(rng.uniform(36.3, 37.3), 1),
        "gcs": 15,
        "pain": rng.randint(0, 6),
    }
    if trend == "cardiac":
        v["pain"] = rng.randint(5, 9)
        if sick:
            v["hr"] = rng.randint(100, 125)
    elif trend == "resp":
        v["rr"] = rng.randint(22, 30) if sick else rng.randint(18, 23)
        v["spo2"] = rng.randint(88, 93) if sick else rng.randint(93, 96)
    elif trend == "neuro":
        v["gcs"] = rng.randint(7, 12) if sick else rng.randint(13, 15)
    elif trend == "fever":
        v["temp"] = round(rng.uniform(38.0, 39.8), 1)
        v["hr"] = rng.randint(90, 115)
    elif trend == "trauma":
        v["pain"] = rng.randint(6, 10)
        if sick:
            v["sbp"] = rng.randint(85, 100)
            v["hr"] = rng.randint(105, 130)
    elif trend == "bleed":
        v["sbp"] = rng.randint(82, 100) if sick else rng.randint(100, 120)
        v["hr"] = rng.randint(100, 128) if sick else rng.randint(85, 105)
    return v


def pick_zone(ktas: int, age: int, rng: random.Random) -> str:
    if age < 15:
        return "소아구역"
    if ktas == 1:
        return "소생구역"
    if ktas == 2:
        return rng.choice(["소생구역", "중증구역", "중증구역"])
    if ktas == 3:
        return rng.choice(["중증구역", "경증구역"])
    return "경증구역"


def iso(dt: datetime | None) -> str | None:
    return dt.strftime("%Y-%m-%dT%H:%M") if dt else None


def make_visit(idx: int, rng: random.Random) -> dict:
    complaint = rng.choice(list(COMPLAINTS))
    ktas_pool, trend = COMPLAINTS[complaint]
    ktas = rng.choice(ktas_pool)
    age = rng.choice([rng.randint(1, 14)] + [rng.randint(18, 92) for _ in range(6)])
    sex = rng.choice(["M", "F"])

    # 48시간 감사 구간(10/30~31). 낮~저녁 시간대에 내원이 몰리도록 가중치를 줍니다.
    day = rng.choice(AUDIT_DAYS)
    hour = rng.choices(range(24), weights=HOURLY_WEIGHTS)[0]
    arrival = datetime(YEAR, MONTH, day, hour, rng.randint(0, 59))
    triage_at = arrival + timedelta(minutes=rng.randint(1, 6))
    # 대부분은 목표 시간 안에 진료
    wait = rng.randint(0, max(1, int(KTAS_TARGET_MIN[ktas] * 0.9)))
    seen_at = triage_at + timedelta(minutes=wait)

    disposition = rng.choices(
        ["귀가", "일반병동 입원", "중환자실 입원", "전원"],
        weights=[60, 25, 8, 7] if ktas >= 3 else [15, 45, 32, 8],
    )[0]

    decision_at = seen_at + timedelta(minutes=rng.randint(40, 240))
    bed_at = None
    if "입원" in disposition:
        bed_at = decision_at + timedelta(minutes=rng.randint(20, 300))
        depart_at = bed_at + timedelta(minutes=rng.randint(10, 40))
    else:
        depart_at = decision_at + timedelta(minutes=rng.randint(10, 90))

    return {
        "visit_id": f"ED-2610-{idx:03d}",
        "patient_ref": f"P-{rng.randint(1000, 9999)}",
        "age": age,
        "sex": sex,
        "arrival_mode": rng.choices(ARRIVAL_MODES, weights=[35, 55, 10])[0],
        "chief_complaint": complaint,
        "zone": pick_zone(ktas, age, rng),
        "ktas_initial": ktas,
        "ktas_final": ktas,
        "retriage_reason": None,
        "triage_nurse": rng.choice(NURSES),
        "physician": rng.choice(PHYSICIANS),
        "vitals": vitals_for(trend, ktas, rng),
        "times": {
            "arrival": iso(arrival),
            "triage": iso(triage_at),
            "physician_seen": iso(seen_at),
            "disposition_decision": iso(decision_at),
            "bed_assigned": iso(bed_at),
            "departure": iso(depart_at),
        },
        "disposition": disposition,
    }


def shift(visit: dict, key: str, minutes: int) -> None:
    """특정 시점 이후의 시각을 모두 뒤로 미룹니다."""
    order = ["arrival", "triage", "physician_seen", "disposition_decision", "bed_assigned", "departure"]
    start = order.index(key)
    for k in order[start:]:
        t = visit["times"][k]
        if t:
            visit["times"][k] = iso(datetime.fromisoformat(t) + timedelta(minutes=minutes))


def inject_anomalies(visits: list[dict], rng: random.Random) -> None:
    """감사 규칙이 실제로 걸리는 사례를 섞습니다. (시연용)"""
    pool = visits[:]
    rng.shuffle(pool)

    # 1) 24시간 초과 체류: 입원 결정 후 병상을 못 구한 환자 3명
    for v in pool[0:3]:
        v["disposition"] = "일반병동 입원"
        v["ktas_initial"] = v["ktas_final"] = 2
        v["zone"] = "중증구역" if v["age"] >= 15 else "소아구역"
        dec = datetime.fromisoformat(v["times"]["disposition_decision"])
        bed = dec + timedelta(hours=rng.randint(22, 30))
        v["times"]["bed_assigned"] = iso(bed)
        v["times"]["departure"] = iso(bed + timedelta(minutes=25))

    # 2) KTAS 하향 재분류 (근거 기록 없음 2건, 근거 있음 1건)
    for v, reason in zip(pool[3:6], [None, None, "재평가 시 통증 완화, 활력징후 안정"]):
        v["ktas_initial"] = 2
        v["ktas_final"] = 4
        v["zone"] = "경증구역" if v["age"] >= 15 else "소아구역"
        v["retriage_reason"] = reason
        v["chief_complaint"] = rng.choice(["흉통", "호흡곤란", "토혈"])

    # 3) 활력징후와 맞지 않는 낮은 등급 (과소분류 의심) 2건
    for v, vit in zip(pool[6:8], [{"sbp": 84, "hr": 128}, {"spo2": 87, "rr": 29}]):
        v["ktas_initial"] = v["ktas_final"] = 4
        v["zone"] = "경증구역" if v["age"] >= 15 else "소아구역"
        v["vitals"].update(vit)

    # 4) 진료 지연: KTAS 목표 시간 초과 4건
    for v in pool[8:12]:
        target = KTAS_TARGET_MIN[v["ktas_final"]]
        shift(v, "physician_seen", target + rng.randint(25, 70))

    # 5) 입원 병상 배정 지연(6시간 초과, 24시간 미만) 3건
    for v in pool[12:15]:
        v["disposition"] = "중환자실 입원"
        dec = datetime.fromisoformat(v["times"]["disposition_decision"])
        bed = dec + timedelta(hours=rng.randint(7, 12), minutes=rng.randint(0, 59))
        v["times"]["bed_assigned"] = iso(bed)
        v["times"]["departure"] = iso(bed + timedelta(minutes=20))

    # 6) 72시간 내 재내원 + 등급 상향 (같은 환자) 1쌍
    first, second = pool[15], pool[16]
    second["patient_ref"] = first["patient_ref"]
    second["age"], second["sex"] = first["age"], first["sex"]
    first["disposition"] = "귀가"
    first["ktas_initial"] = first["ktas_final"] = 4
    first["chief_complaint"] = second["chief_complaint"] = "복통"
    f_dep = datetime.fromisoformat(first["times"]["departure"])
    gap = timedelta(hours=rng.randint(20, 60))
    new_arrival = f_dep + gap
    delta_min = int((new_arrival - datetime.fromisoformat(second["times"]["arrival"])).total_seconds() // 60)
    shift(second, "arrival", delta_min)
    second["ktas_initial"] = second["ktas_final"] = 2
    second["zone"] = "중증구역" if second["age"] >= 15 else "소아구역"
    second["disposition"] = "일반병동 입원"


def main() -> None:
    parser = argparse.ArgumentParser(description="응급실 가상 데이터 생성")
    parser.add_argument("--n", type=int, default=160, help="내원 건수 (기본 160)")
    parser.add_argument("--out", default=str(Path(__file__).resolve().parents[1] / "data" / "ed_visits.json"))
    args = parser.parse_args()
    if args.n < 30:
        raise SystemExit("감사 사례를 넣으려면 최소 30건이 필요합니다.")

    rng = random.Random(SEED)
    visits = [make_visit(i + 1, rng) for i in range(args.n)]
    inject_anomalies(visits, rng)
    visits.sort(key=lambda v: v["times"]["arrival"])
    for i, v in enumerate(visits, start=1):
        v["visit_id"] = f"ED-2610-{i:03d}"

    payload = {
        "meta": {
            "hospital": "가상 권역응급의료센터 (데모)",
            "period": f"{YEAR}-{MONTH:02d}-{AUDIT_DAYS[0]:02d} ~ {YEAR}-{MONTH:02d}-{AUDIT_DAYS[-1]:02d} (48시간)",
            "generated_by": "scripts/generate_data.py",
            "seed": SEED,
            "synthetic": True,
            "zone_beds": {z: beds for z, (beds, _) in ZONES.items()},
            "ktas_target_minutes": KTAS_TARGET_MIN,
        },
        "visits": visits,
    }
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"{len(visits)}건 생성 → {out}")


if __name__ == "__main__":
    main()
