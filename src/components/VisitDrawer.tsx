// [개발 > 프론트엔드] 내원 상세 — Triage → 진료 → 입원 결정 → 병상 배정 → 퇴실 타임라인
import { useEffect, useRef } from "react";
import type { Review, Visit } from "../types";
import { clock, duration, STATUS_LABEL } from "../format";

interface Props {
  visit: Visit;
  review?: Review;
  onClose: () => void;
}

const STEPS: { key: keyof Visit["times"]; label: string }[] = [
  { key: "arrival", label: "내원" },
  { key: "triage", label: "KTAS 분류" },
  { key: "physician_seen", label: "의사 진료 시작" },
  { key: "disposition_decision", label: "퇴실·입원 결정" },
  { key: "bed_assigned", label: "입원 병상 배정" },
  { key: "departure", label: "응급실 퇴실" },
];

function gap(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000);
}

export default function VisitDrawer({ visit, review, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus();
    };
  }, [onClose]);

  const steps = STEPS.filter((s) => visit.times[s.key]);
  const v = visit.vitals;

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={`${visit.visit_id} 상세`} onClick={(e) => e.stopPropagation()}>
        <header className="drawer-head">
          <div>
            <span className={`dot dot-${visit.status}`} />
            <span className="muted">{STATUS_LABEL[visit.status]}</span>
            <h2 className="mono">{visit.visit_id}</h2>
            <p className="muted">{visit.patient_ref} · {visit.age}세 {visit.sex === "M" ? "남" : "여"} · {visit.arrival_mode}</p>
          </div>
          <button ref={closeRef} className="btn btn-ghost btn-sm" onClick={onClose} aria-label="닫기">닫기 ✕</button>
        </header>

        <section>
          <h3 className="sub">분류</h3>
          <dl className="facts">
            <div><dt>주호소</dt><dd>{visit.chief_complaint}</dd></div>
            <div><dt>KTAS</dt><dd>{visit.ktas_initial} → {visit.ktas_final}</dd></div>
            <div><dt>구역</dt><dd>{visit.zone}</dd></div>
            <div><dt>분류 간호사</dt><dd>{visit.triage_nurse}</dd></div>
            <div><dt>담당의</dt><dd>{visit.physician}</dd></div>
            <div><dt>재분류 근거</dt><dd>{visit.retriage_reason ?? (visit.ktas_initial !== visit.ktas_final ? <span className="text-danger">기록 없음</span> : "-")}</dd></div>
          </dl>
        </section>

        <section>
          <h3 className="sub">활력징후</h3>
          <div className="vitals">
            <span className={v.sbp < 90 ? "is-bad" : ""}>혈압 <b>{v.sbp}</b></span>
            <span className={v.hr >= 120 ? "is-bad" : ""}>맥박 <b>{v.hr}</b></span>
            <span className={v.rr >= 30 ? "is-bad" : ""}>호흡 <b>{v.rr}</b></span>
            <span className={v.spo2 < 90 ? "is-bad" : ""}>SpO₂ <b>{v.spo2}%</b></span>
            <span className={v.temp >= 38 ? "is-bad" : ""}>체온 <b>{v.temp}</b></span>
            <span className={v.gcs <= 12 ? "is-bad" : ""}>GCS <b>{v.gcs}</b></span>
          </div>
        </section>

        <section>
          <h3 className="sub">타임라인 · 총 {duration(visit.metrics.los_min)}</h3>
          <ol className="timeline">
            {steps.map((s, i) => {
              const prev = i > 0 ? visit.times[steps[i - 1].key] : null;
              const g = gap(prev, visit.times[s.key]);
              const long = (s.key === "bed_assigned" && (g ?? 0) >= 360) || (s.key === "physician_seen" && (g ?? 0) > (visit.metrics.ktas_target_min ?? 999) + 5);
              return (
                <li key={s.key} className={long ? "is-long" : ""}>
                  <span className="tl-time">{clock(visit.times[s.key])}</span>
                  <span className="tl-label">{s.label}</span>
                  {g !== null && <span className="tl-gap">+{duration(g)}</span>}
                </li>
              );
            })}
          </ol>
          <p className="muted small">퇴실 경로: {visit.disposition}</p>
        </section>

        {visit.flags.length > 0 && (
          <section>
            <h3 className="sub">감사 신호</h3>
            <ul className="flag-list">
              {visit.flags.map((f) => (
                <li key={f.code} className={`flag flag-${f.severity}`}>
                  <b>{f.title}</b><span>{f.detail}</span><small className="muted">{f.basis}</small>
                </li>
              ))}
            </ul>
          </section>
        )}

        {review && (
          <section>
            <h3 className="sub">담당자 결정</h3>
            <p><b>{review.decision}</b> · {review.reviewer}</p>
            {review.note && <p className="muted">{review.note}</p>}
          </section>
        )}
      </aside>
    </div>
  );
}
