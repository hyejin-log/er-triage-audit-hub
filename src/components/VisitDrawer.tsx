// [개발 > 프론트엔드] 내원 상세 — Triage → 진료 → 입원 결정 → 병상 배정 → 퇴실 타임라인
import { useEffect, useId, useRef, useState } from "react";
import { Wand2 } from "lucide-react";
import { demoTeamNote } from "../demoText";
import { api, ApiError } from "../api";
import type { Review, TeamNote, User, Visit } from "../types";
import { clock, deptName, duration, STAGE_LABEL, STATUS_LABEL, stamp } from "../format";

interface Props {
  visit: Visit;
  review?: Review;
  user: User | null;
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

export default function VisitDrawer({ visit, review, user, onClose }: Props) {
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
            <div><dt>소명 담당 부서</dt><dd>{deptName(visit.owner_dept)}</dd></div>
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
            <h3 className="sub">진행 · {STAGE_LABEL[review.stage]}</h3>
            <ol className="trail">
              <li>
                <b>QI팀 {review.decision}</b> <span className="muted small">{review.reviewer} · {stamp(review.decided_at)}</span>
                {review.note && <p className="muted">{review.note}</p>}
              </li>
              {review.assigned_dept && (
                <li>
                  <b>{deptName(review.assigned_dept)} 소명</b>{" "}
                  {review.response ? (
                    <>
                      <span className="muted small">{review.responder} · {stamp(review.responded_at)}</span>
                      <p>{review.response}</p>
                    </>
                  ) : <span className="muted small">답변 대기</span>}
                </li>
              )}
            </ol>
          </section>
        )}

        <TeamNotes visitId={visit.visit_id} user={user} />
      </aside>
    </div>
  );
}

// [개발 > 협업] 팀 내부 메모 — 같은 팀만 보이고, 다른 팀에는 보이지 않습니다.
function TeamNotes({ visitId, user }: { visitId: string; user: User | null }) {
  const [notes, setNotes] = useState<TeamNote[] | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const noteId = useId();

  useEffect(() => {
    if (!user) return;
    let alive = true;
    setNotes(null);
    api.notes(visitId).then(
      (r) => alive && setNotes(r.items),
      () => alive && setError("팀 메모를 불러오지 못했습니다."),
    );
    return () => { alive = false; };
  }, [visitId, user?.dept]);

  if (!user) {
    return (
      <section>
        <h3 className="sub">팀 메모</h3>
        <p className="muted small">로그인하면 우리 팀끼리만 보는 메모를 남길 수 있습니다.</p>
      </section>
    );
  }

  const add = async () => {
    if (!text.trim()) {
      setError("메모 내용을 적어 주세요.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const n = await api.addNote(visitId, text.trim());
      setNotes((prev) => [n, ...(prev ?? [])]);
      setText("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "메모를 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    try {
      await api.deleteNote(id);
      setNotes((prev) => (prev ?? []).filter((n) => n.id !== id));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "메모를 지우지 못했습니다.");
    }
  };

  return (
    <section className={`team-notes dept-${user.dept}`}>
      <h3 className="sub">{user.dept_name} 팀 메모 <span className="muted small">· {user.dept_name}만 열람</span></h3>
      {notes === null ? (
        <p className="muted small" aria-busy="true">불러오는 중…</p>
      ) : notes.length === 0 ? (
        <p className="muted small">아직 메모가 없습니다.</p>
      ) : (
        <ul className="note-list">
          {notes.map((n) => (
            <li key={n.id}>
              <div className="note-meta">
                <span className="muted small">{n.author} · {stamp(n.created_at)}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => remove(n.id)} aria-label="메모 지우기">지우기</button>
              </div>
              <p>{n.body}</p>
            </li>
          ))}
        </ul>
      )}
      <div className="field">
        <div className="field-head">
          <label htmlFor={noteId}>새 메모</label>
          <button type="button" className="demo-fill" onClick={() => { setText(demoTeamNote(user.dept)); setError(null); }}>
            <Wand2 className="ico" />데모 문구 넣기
          </button>
        </div>
        <textarea id={noteId} rows={2} maxLength={500} value={text} onChange={(e) => { setText(e.target.value); setError(null); }} placeholder="팀 내부에서만 공유할 내용" />
      </div>
      {error && <p className="text-danger small" role="alert">{error}</p>}
      <button className="btn btn-sm" onClick={add} disabled={saving}>{saving ? "저장 중…" : "팀 메모 남기기"}</button>
    </section>
  );
}
