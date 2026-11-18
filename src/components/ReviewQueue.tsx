// [개발 > 프론트엔드] 확인 필요 / 주의 관찰 큐 — High Risk 카드 + AI 근거 제안 + QI팀 결정
// 소명이 제출된 건은 다시 이 큐로 올라와 QI팀이 최종 확정합니다.
import { useEffect, useId, useState } from "react";
import { Wand2 } from "lucide-react";
import { demoDecisionNote } from "../demoText";
import { api, ApiError } from "../api";
import type { Decision, Rationale, Review, User, Visit } from "../types";
import { clock, deptName, duration, josa, stamp } from "../format";

interface Props {
  visits: Visit[];
  reviews: Record<string, Review>;
  user: User | null;
  onDecide: (id: string, d: Decision, note: string) => Promise<boolean>;
  onUndo: (id: string) => Promise<boolean>;
  onOpen: (v: Visit) => void;
  tone?: "high" | "medium";
}

const FIRST_DECISIONS: { value: Decision; hint: string }[] = [
  { value: "적정 확인", hint: "문제 없음" },
  { value: "재분류 확정", hint: "등급이 잘못됨" },
  { value: "소명 요청", hint: "부서에 경위 질문" },
];
const FINAL_DECISIONS = FIRST_DECISIONS.slice(0, 2);

export default function ReviewQueue({ visits, reviews, user, onDecide, onUndo, onOpen, tone = "high" }: Props) {
  const isQi = user?.dept === "QI";
  const open = visits.filter((v) => !reviews[v.visit_id] || reviews[v.visit_id].stage === "answered");
  const waiting = visits.filter((v) => reviews[v.visit_id]?.stage === "requested");
  const closed = visits.filter((v) => reviews[v.visit_id]?.stage === "closed");

  if (visits.length === 0) {
    return (
      <div className="empty card">
        <strong>{tone === "high" ? "확인 필요 건이 없습니다" : "주의 관찰 건이 없습니다"}</strong>
        <p className="muted">감사 규칙에 걸린 내원이 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="queue-head">
        <div>
          <h1 className="page-title">{tone === "high" ? "확인 필요" : "주의 관찰"}</h1>
          <p className="muted">
            {tone === "high"
              ? "24시간 초과 체류, 근거 없는 하향 재분류, 활력징후 대비 과소분류, 72시간 내 재내원 건입니다."
              : "KTAS 목표 시간 내 진료 미달과 입원 결정 후 병상 대기 6시간 초과 건입니다."}
            {" "}QI 판정 대기 {open.length}건 · 소명 요청중 {waiting.length}건 · 종결 {closed.length}건
          </p>
        </div>
        {!isQi && (
          <div className="role-note">
            {user
              ? <><b>{josa(user.dept_name, "은", "는")}</b> 보기만 할 수 있습니다. 판정은 QI팀이, 소명은 ‘{user.dept_name} 소명’ 탭에서 합니다.</>
              : <>오른쪽 위 <b>로그인</b>에서 <b>QI팀</b>으로 들어가면 결정을 기록할 수 있습니다.</>}
          </div>
        )}
      </div>

      {open.length === 0 ? (
        <div className="empty card"><strong>QI팀이 판정할 건이 없습니다</strong><p className="muted">소명 요청중인 건은 부서 답변이 오면 다시 여기에 다시 표시됩니다.</p></div>
      ) : (
        <div className="cards">
          {open.map((v) => (
            <RiskCard key={v.visit_id} visit={v} review={reviews[v.visit_id]} canDecide={isQi} onDecide={onDecide} onOpen={onOpen} tone={tone} />
          ))}
        </div>
      )}

      {waiting.length > 0 && (
        <section className="card">
          <h2>소명 요청중</h2>
          <ul className="done-list">
            {waiting.map((v) => {
              const r = reviews[v.visit_id];
              return (
                <li key={v.visit_id}>
                  <button className="link" onClick={() => onOpen(v)}>{v.visit_id}</button>
                  <span className="muted">{v.flags[0]?.title}</span>
                  <span className={`pill dept-pill-sm dept-${r.assigned_dept}`}>{deptName(r.assigned_dept)} 답변 대기</span>
                  <span className="muted small">{r.note}</span>
                  {isQi && <button className="btn btn-ghost btn-sm" onClick={() => onUndo(v.visit_id)}>요청 취소</button>}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {closed.length > 0 && (
        <section className="card">
          <h2>종결</h2>
          <ul className="done-list">
            {closed.map((v) => {
              const r = reviews[v.visit_id];
              return (
                <li key={v.visit_id}>
                  <button className="link" onClick={() => onOpen(v)}>{v.visit_id}</button>
                  <span className="muted">{v.flags[0]?.title}</span>
                  <span className={`pill decision-${r.decision.replace(" ", "")}`}>{r.decision}</span>
                  <span className="muted small">
                    {r.reviewer}{r.response ? ` · ${deptName(r.assigned_dept)} 소명 반영` : ""}{r.note ? ` · ${r.note}` : ""}
                  </span>
                  {isQi && <button className="btn btn-ghost btn-sm" onClick={() => onUndo(v.visit_id)}>되돌리기</button>}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

function RiskCard({
  visit,
  review,
  canDecide,
  onDecide,
  onOpen,
  tone,
}: {
  visit: Visit;
  review?: Review;
  canDecide: boolean;
  onDecide: Props["onDecide"];
  onOpen: (v: Visit) => void;
  tone: "high" | "medium";
}) {
  const answered = review?.stage === "answered";
  const options = answered ? FINAL_DECISIONS : FIRST_DECISIONS;
  const [rationale, setRationale] = useState<Rationale | null>(null);
  const [loading, setLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  // [기획 > 시연] 메모는 예시 문장으로 미리 채워 두고, 직접 고치기 전까지는 고른 결정에 맞춰 바꿉니다.
  const [note, setNote] = useState(() => (answered ? "" : demoDecisionNote(visit, null)));
  const [noteEdited, setNoteEdited] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const noteId = useId();

  useEffect(() => {
    if (!noteEdited && decision) setNote(demoDecisionNote(visit, decision));
  }, [decision, noteEdited, visit]);

  const askAi = async () => {
    setLoading(true);
    setAiError(null);
    try {
      const r = await api.aiReview(visit.visit_id);
      setRationale(r);
      if (!answered || r.suggested_action !== "소명 요청") setDecision((d) => d ?? r.suggested_action);
    } catch (e) {
      setAiError(e instanceof ApiError ? e.message : "근거를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const submit = async () => {
    if (!decision) return setFormError("결정을 골라 주세요.");
    if (decision !== "적정 확인" && !note.trim()) return setFormError("재분류·소명 요청은 메모가 필요합니다.");
    setFormError(null);
    setSaving(true);
    await onDecide(visit.visit_id, decision, note.trim());
    setSaving(false);
  };

  const m = visit.metrics;
  return (
    <article className={`risk-card ${tone === "high" ? "is-high" : "is-medium"} ${answered ? "is-answered" : ""}`}>
      <header className="risk-head">
        <div>
          <span className={`pill ${tone === "high" ? "pill-danger" : "pill-warn"}`}>
            {tone === "high" ? "확인 필요" : "주의"}
          </span>
          {answered && <span className="pill pill-accent">소명 제출, 최종 판정 대기</span>}
          <h3>{visit.flags[0]?.title}</h3>
        </div>
        <button className="link" onClick={() => onOpen(visit)}>{visit.visit_id} 타임라인 →</button>
      </header>

      <dl className="facts">
        <div><dt>환자</dt><dd>{visit.age}세 {visit.sex === "M" ? "남" : "여"} · {visit.chief_complaint}</dd></div>
        <div><dt>KTAS</dt><dd>{visit.ktas_initial === visit.ktas_final ? visit.ktas_final : `${visit.ktas_initial} → ${visit.ktas_final}`}</dd></div>
        <div><dt>담당 부서</dt><dd>{deptName(visit.owner_dept)}</dd></div>
        <div><dt>내원</dt><dd>{clock(visit.times.arrival)}</dd></div>
        <div><dt>총 체류</dt><dd className={m.los_min && m.los_min >= 1440 ? "text-danger strong" : ""}>{duration(m.los_min)}</dd></div>
        <div><dt>진료 대기</dt><dd>{duration(m.door_to_doc_min)}</dd></div>
      </dl>

      <ul className="flag-list">
        {visit.flags.map((f) => (
          <li key={f.code} className={`flag flag-${f.severity}`}>
            <b>{f.title}</b>
            <span>{f.detail}</span>
          </li>
        ))}
      </ul>

      {answered && review && (
        <div className="response-box">
          <div className="response-meta">
            <span className={`pill dept-pill-sm dept-${review.assigned_dept}`}>{deptName(review.assigned_dept)} 소명</span>
            <span className="muted small">{review.responder} · {stamp(review.responded_at)}</span>
          </div>
          <p className="muted small">QI 요청: {review.note}</p>
          <p>{review.response}</p>
        </div>
      )}

      <div className="ai-box">
        {!rationale ? (
          <button className="btn btn-sm" onClick={askAi} disabled={loading}>
            {loading ? "불러오는 중…" : "근거 요약"}
          </button>
        ) : (
          <div className="ai-result">
            <div className="ai-meta">
              <span className="pill pill-muted">{rationale.source === "claude" ? "AI 요약" : "규칙 요약"}</span>
              <span className="muted small">권장 조치: <b>{rationale.suggested_action}</b></span>
            </div>
            <p>{rationale.summary}</p>
            {rationale.checklist.length > 0 && (
              <ul className="checklist">
                {rationale.checklist.map((c) => <li key={c}>{c}</li>)}
              </ul>
            )}
            {rationale.note && <p className="muted small">{rationale.note}</p>}
          </div>
        )}
        {aiError && <p className="text-danger small" role="alert">{aiError}</p>}
      </div>

      {canDecide ? (
        <fieldset className="decide">
          <legend>{answered ? "QI팀 최종 확정" : "QI팀 결정"}</legend>
          <div className="seg" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
            {options.map((d) => (
              <button
                key={d.value}
                type="button"
                className={`seg-btn ${decision === d.value ? "is-on" : ""}`}
                aria-pressed={decision === d.value}
                title={d.hint}
                onClick={() => { setDecision(d.value); setFormError(null); }}
              >
                {d.value}
                <small className="seg-hint">{d.hint}</small>
              </button>
            ))}
          </div>
          {decision === "소명 요청" && (
            <p className="muted small">→ <b>{deptName(visit.owner_dept)}</b>에 소명을 요청합니다.</p>
          )}
          <div className="field">
            <div className="field-head">
              <label htmlFor={noteId}>메모 {decision && decision !== "적정 확인" ? "(필수)" : "(선택)"}</label>
              <button type="button" className="demo-fill" onClick={() => { setNote(demoDecisionNote(visit, decision)); setNoteEdited(false); setFormError(null); }}>
                <Wand2 className="ico" />예시 문구 다시 넣기
              </button>
            </div>
            <textarea
              id={noteId}
              rows={2}
              maxLength={500}
              value={note}
              onChange={(e) => { setNote(e.target.value); setNoteEdited(true); setFormError(null); }}
              placeholder={decision === "소명 요청" ? "부서에 요청할 내용" : "확인한 기록, 판단 근거"}
            />
          </div>
          {formError && <p className="text-danger small" role="alert">{formError}</p>}
          <button className="btn btn-primary" onClick={submit} disabled={saving}>
            {saving ? "저장 중…" : decision === "소명 요청" ? `${deptName(visit.owner_dept)}에 소명 요청하기` : decision ? `${decision}로 기록하기` : "결정 기록하기"}
          </button>
        </fieldset>
      ) : (
        <p className="muted small locked">QI팀으로 로그인하면 결정할 수 있습니다.</p>
      )}
    </article>
  );
}
