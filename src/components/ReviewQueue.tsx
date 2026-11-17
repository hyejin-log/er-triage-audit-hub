// [개발 > 프론트엔드] 확인 필요 / 주의 관찰 큐 — High Risk 이상 징후 카드 + AI 근거 제안 + 담당자 확정
import { useState } from "react";
import { api, ApiError } from "../api";
import type { Decision, Rationale, Review, Visit } from "../types";
import { clock, duration, safeStorage, saveStorage } from "../format";

interface Props {
  visits: Visit[];
  reviews: Record<string, Review>;
  onDecide: (id: string, d: Decision, note: string, reviewer: string) => Promise<void>;
  onUndo: (id: string) => Promise<void>;
  onOpen: (v: Visit) => void;
  tone?: "high" | "medium";
  authEnabled: boolean;
  userEmail: string | null;
}

const DECISIONS: { value: Decision; hint: string }[] = [
  { value: "적정 확인", hint: "기록상 문제가 없음" },
  { value: "재분류 확정", hint: "분류·조치가 부적절했음" },
  { value: "소명 요청", hint: "담당 부서에 설명 요청" },
];

export default function ReviewQueue({ visits, reviews, onDecide, onUndo, onOpen, tone = "high", authEnabled, userEmail }: Props) {
  const [typedReviewer, setReviewer] = useState<string>(() => safeStorage("er-audit:reviewer", ""));
  // [개발 > 인증] 로그인이 켜져 있으면 로그인 이메일이 검토자입니다.
  const reviewer = authEnabled ? userEmail ?? "" : typedReviewer;
  const pending = visits.filter((v) => !reviews[v.visit_id]);
  const done = visits.filter((v) => reviews[v.visit_id]);

  const updateReviewer = (value: string) => {
    setReviewer(value);
    saveStorage("er-audit:reviewer", value);
  };

  if (visits.length === 0) {
    return (
      <div className="empty card">
        <strong>{tone === "high" ? "확인할 High Risk 건이 없어요" : "주의 관찰 건이 없어요"}</strong>
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
            {" "}미결 {pending.length}건 · 완료 {done.length}건
          </p>
        </div>
        {authEnabled ? (
          <div className={`reviewer-status ${userEmail ? "" : "is-off"}`}>
            <span className="muted small">검토자</span>
            <b>{userEmail ?? "로그인이 필요해요"}</b>
            {!userEmail && <span className="muted small">오른쪽 위 ‘담당자 로그인’으로 로그인하면 결정을 기록할 수 있어요.</span>}
          </div>
        ) : (
          <label className="field reviewer">
            <span>검토자 이름</span>
            <input value={typedReviewer} maxLength={40} placeholder="예: QI 간호사 김OO" onChange={(e) => updateReviewer(e.target.value)} />
          </label>
        )}
      </div>

      <div className="cards">
        {pending.map((v) => (
          <RiskCard key={v.visit_id} visit={v} reviewer={reviewer} authEnabled={authEnabled} onDecide={onDecide} onOpen={onOpen} tone={tone} />
        ))}
      </div>

      {done.length > 0 && (
        <section className="card">
          <h2>결정 완료</h2>
          <ul className="done-list">
            {done.map((v) => {
              const r = reviews[v.visit_id];
              return (
                <li key={v.visit_id}>
                  <button className="link" onClick={() => onOpen(v)}>{v.visit_id}</button>
                  <span className="muted">{v.flags[0]?.title}</span>
                  <span className={`pill decision-${r.decision.replace(" ", "")}`}>{r.decision}</span>
                  <span className="muted small">{r.reviewer}{r.note ? ` · ${r.note}` : ""}</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => onUndo(v.visit_id)}>되돌리기</button>
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
  reviewer,
  authEnabled,
  onDecide,
  onOpen,
  tone,
}: {
  visit: Visit;
  reviewer: string;
  authEnabled: boolean;
  onDecide: Props["onDecide"];
  onOpen: (v: Visit) => void;
  tone: "high" | "medium";
}) {
  const [rationale, setRationale] = useState<Rationale | null>(null);
  const [loading, setLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const askAi = async () => {
    setLoading(true);
    setAiError(null);
    try {
      const r = await api.aiReview(visit.visit_id);
      setRationale(r);
      setDecision((d) => d ?? r.suggested_action);
    } catch (e) {
      setAiError(e instanceof ApiError ? e.message : "근거를 불러오지 못했어요.");
    } finally {
      setLoading(false);
    }
  };

  const submit = async () => {
    if (!decision) return setFormError("결정을 골라 주세요.");
    if (!reviewer.trim())
      return setFormError(authEnabled ? "먼저 오른쪽 위 ‘담당자 로그인’으로 로그인해 주세요." : "위쪽에 검토자 이름을 적어 주세요.");
    if (decision !== "적정 확인" && !note.trim()) return setFormError("재분류·소명 요청은 메모가 필요해요.");
    setFormError(null);
    setSaving(true);
    await onDecide(visit.visit_id, decision, note.trim(), reviewer.trim());
    setSaving(false);
  };

  const m = visit.metrics;
  return (
    <article className={`risk-card ${tone === "high" ? "is-high" : "is-medium"}`}>
      <header className="risk-head">
        <div>
          <span className={`pill ${tone === "high" ? "pill-danger" : "pill-warn"}`}>
            {tone === "high" ? "High Risk" : "주의"}
          </span>
          <h3>{visit.flags[0]?.title}</h3>
        </div>
        <button className="link" onClick={() => onOpen(visit)}>{visit.visit_id} 타임라인 →</button>
      </header>

      <dl className="facts">
        <div><dt>환자</dt><dd>{visit.age}세 {visit.sex === "M" ? "남" : "여"} · {visit.chief_complaint}</dd></div>
        <div><dt>KTAS</dt><dd>{visit.ktas_initial === visit.ktas_final ? visit.ktas_final : `${visit.ktas_initial} → ${visit.ktas_final}`}</dd></div>
        <div><dt>구역</dt><dd>{visit.zone}</dd></div>
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

      <div className="ai-box">
        {!rationale ? (
          <button className="btn btn-sm" onClick={askAi} disabled={loading}>
            {loading ? "근거 정리 중…" : "AI 근거 제안 받기"}
          </button>
        ) : (
          <div className="ai-result">
            <div className="ai-meta">
              <span className="pill pill-muted">{rationale.source === "claude" ? "Claude 제안" : "규칙 엔진 제안"}</span>
              <span className="muted small">제안: <b>{rationale.suggested_action}</b></span>
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

      <fieldset className="decide">
        <legend>담당자 결정</legend>
        <div className="seg">
          {DECISIONS.map((d) => (
            <button
              key={d.value}
              type="button"
              className={`seg-btn ${decision === d.value ? "is-on" : ""}`}
              aria-pressed={decision === d.value}
              title={d.hint}
              onClick={() => { setDecision(d.value); setFormError(null); }}
            >
              {d.value}
            </button>
          ))}
        </div>
        <label className="field">
          <span>메모 {decision && decision !== "적정 확인" ? "(필수)" : "(선택)"}</span>
          <textarea rows={2} maxLength={500} value={note} onChange={(e) => { setNote(e.target.value); setFormError(null); }} placeholder="확인한 기록, 요청할 내용" />
        </label>
        {formError && <p className="text-danger small" role="alert">{formError}</p>}
        <button className="btn btn-primary" onClick={submit} disabled={saving}>
          {saving ? "저장 중…" : decision ? `${decision}로 기록하기` : "결정 기록하기"}
        </button>
      </fieldset>
    </article>
  );
}
