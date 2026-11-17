// [개발 > 프론트엔드] 소명 — 부서는 배정된 건에 소명을 제출하고, QI팀은 부서별 진행 현황을 봅니다.
import { useState } from "react";
import type { DeptCode, Review, User, Visit } from "../types";
import type { Tab } from "../App";
import { DEPTS, deptName, STAGE_LABEL, stamp } from "../format";

interface Props {
  visits: Visit[];
  reviews: Record<string, Review>;
  user: User | null;
  onRespond: (id: string, response: string) => Promise<boolean>;
  onOpen: (v: Visit) => void;
  onGo: (t: Tab) => void;
  onReset: () => Promise<boolean>;
}

export default function ExplanationBoard(props: Props) {
  const { user } = props;
  if (user && user.dept !== "QI") return <DeptView {...props} user={user} />;
  return <QiView {...props} />;
}

// ── 부서 화면 ─────────────────────────────────────────────────────────
function DeptView({ visits, reviews, user, onRespond, onOpen }: Props & { user: User }) {
  const byId = new Map(visits.map((v) => [v.visit_id, v]));
  const mine = Object.values(reviews).filter((r) => r.assigned_dept === user.dept);
  const todo = mine.filter((r) => r.stage === "requested");
  const done = mine.filter((r) => r.stage !== "requested");

  return (
    <div className="stack">
      <div className="queue-head">
        <div>
          <h1 className="page-title">{user.dept_name} 소명</h1>
          <p className="muted">QI팀이 소명을 요청한 건이에요. 기록을 확인하고 설명을 제출하면 QI팀이 최종 확정합니다. 답변 대기 {todo.length}건 · 제출 {done.length}건</p>
        </div>
      </div>

      {todo.length === 0 ? (
        <div className="empty card">
          <strong>지금 답변할 소명 요청이 없어요</strong>
          <p className="muted">QI팀이 {user.dept_name} 담당 건에 소명을 요청하면 여기에 나타나요. 시연하려면 QI팀으로 로그인해 ‘확인 필요’에서 소명 요청을 보내 보세요.</p>
        </div>
      ) : (
        <div className="cards">
          {todo.map((r) => {
            const v = byId.get(r.visit_id);
            return v ? <RespondCard key={r.visit_id} visit={v} review={r} onRespond={onRespond} onOpen={onOpen} /> : null;
          })}
        </div>
      )}

      {done.length > 0 && (
        <section className="card">
          <h2>제출한 소명</h2>
          <ul className="done-list">
            {done.map((r) => (
              <li key={r.visit_id}>
                <button className="link" onClick={() => { const v = byId.get(r.visit_id); if (v) onOpen(v); }}>{r.visit_id}</button>
                <span className="muted">{byId.get(r.visit_id)?.flags[0]?.title}</span>
                <span className={`pill stage-${r.stage}`}>{r.stage === "closed" ? `종결 · ${r.decision}` : "QI 확인 대기"}</span>
                <span className="muted small">{r.response}</span>
                <span />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function RespondCard({ visit, review, onRespond, onOpen }: { visit: Visit; review: Review; onRespond: Props["onRespond"]; onOpen: (v: Visit) => void }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (text.trim().length < 5) {
      setError("소명은 5자 이상 적어 주세요.");
      return;
    }
    setSaving(true);
    await onRespond(visit.visit_id, text.trim());
    setSaving(false);
  };

  return (
    <article className="risk-card is-request">
      <header className="risk-head">
        <div>
          <span className="pill pill-accent">소명 요청</span>
          <h3>{visit.flags[0]?.title}</h3>
        </div>
        <button className="link" onClick={() => onOpen(visit)}>{visit.visit_id} 타임라인 →</button>
      </header>
      <ul className="flag-list">
        {visit.flags.map((f) => (
          <li key={f.code} className={`flag flag-${f.severity}`}><b>{f.title}</b><span>{f.detail}</span></li>
        ))}
      </ul>
      <div className="response-box">
        <div className="response-meta">
          <span className="pill dept-pill-sm dept-QI">QI팀 요청</span>
          <span className="muted small">{review.reviewer} · {stamp(review.decided_at)}</span>
        </div>
        <p>{review.note}</p>
      </div>
      <label className="field">
        <span>소명 내용</span>
        <textarea
          rows={3}
          maxLength={1000}
          value={text}
          onChange={(e) => { setText(e.target.value); setError(null); }}
          placeholder="확인한 기록, 당시 상황, 개선 조치"
        />
      </label>
      {error && <p className="text-danger small" role="alert">{error}</p>}
      <button className="btn btn-primary" onClick={submit} disabled={saving}>{saving ? "제출 중…" : "소명 제출하기"}</button>
    </article>
  );
}

// ── QI팀·비로그인 화면 ───────────────────────────────────────────────
function QiView({ visits, reviews, user, onOpen, onGo, onReset }: Props) {
  const [confirming, setConfirming] = useState(false);
  const byId = new Map(visits.map((v) => [v.visit_id, v]));
  const list = Object.values(reviews).filter((r) => r.assigned_dept);
  const total = Object.keys(reviews).length;
  const order = { answered: 0, requested: 1, closed: 2 } as const;
  list.sort((a, b) => order[a.stage] - order[b.stage]);

  const count = (dept: DeptCode, stage: Review["stage"]) => list.filter((r) => r.assigned_dept === dept && r.stage === stage).length;

  return (
    <div className="stack">
      <div className="queue-head">
        <div>
          <h1 className="page-title">소명 현황</h1>
          <p className="muted">QI팀이 소명을 요청하면 감사 신호에 맞는 부서로 자동 배정돼요. 부서가 제출한 소명은 ‘확인 필요·주의 관찰’ 큐로 돌아와 QI팀이 최종 확정합니다.</p>
        </div>
        {user?.dept === "QI" && total > 0 && (
          confirming ? (
            <div className="confirm-box" role="alertdialog" aria-label="데모 초기화 확인">
              <span className="small">결정·소명 <b>{total}건</b>을 모두 지워요. 되돌릴 수 없어요.</span>
              <div className="row-gap">
                <button className="btn btn-sm btn-ghost" onClick={() => setConfirming(false)}>취소</button>
                <button className="btn btn-sm btn-danger" onClick={async () => { await onReset(); setConfirming(false); }}>{total}건 지우기</button>
              </div>
            </div>
          ) : (
            <button className="btn btn-sm" onClick={() => setConfirming(true)}>데모 데이터 초기화</button>
          )
        )}
      </div>

      <div className="dept-grid">
        {DEPTS.filter((d) => d.code !== "QI").map((d) => (
          <article key={d.code} className={`dept-card dept-${d.code}`}>
            <div className="dept-card-head"><b>{d.name}</b><span className="muted small">{d.role}</span></div>
            <dl>
              <div><dt>답변 대기</dt><dd>{count(d.code, "requested")}</dd></div>
              <div><dt>QI 확인 대기</dt><dd className={count(d.code, "answered") ? "text-accent" : ""}>{count(d.code, "answered")}</dd></div>
              <div><dt>종결</dt><dd>{count(d.code, "closed")}</dd></div>
            </dl>
          </article>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="empty card">
          <strong>아직 소명 요청이 없어요</strong>
          <p className="muted">QI팀으로 로그인해 ‘확인 필요’에서 결정을 ‘소명 요청’으로 기록해 보세요. 그다음 해당 부서로 로그인하면 소명을 제출할 수 있어요.</p>
          <button className="btn btn-sm" onClick={() => onGo("high")}>확인 필요로 가기 →</button>
        </div>
      ) : (
        <section className="card">
          <h2>소명 목록</h2>
          <ul className="done-list">
            {list.map((r) => {
              const v = byId.get(r.visit_id);
              return (
                <li key={r.visit_id}>
                  <button className="link" onClick={() => v && onOpen(v)}>{r.visit_id}</button>
                  <span className="muted">{v?.flags[0]?.title}</span>
                  <span className={`pill stage-${r.stage}`}>{deptName(r.assigned_dept)} · {r.stage === "closed" ? `종결(${r.decision})` : STAGE_LABEL[r.stage]}</span>
                  <span className="muted small">{r.response ?? r.note}</span>
                  {r.stage === "answered" && v ? (
                    <button className="btn btn-sm" onClick={() => onGo(v.status === "high" ? "high" : "medium")}>확정하러 가기</button>
                  ) : <span />}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
