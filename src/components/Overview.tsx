// [개발 > 프론트엔드] 한눈에 보기 — 요약 / 구역 합산 vs 병상 한도 / 환자 흐름 시각화
import type { Review, Summary, Visit } from "../types";
import { AlertOctagon, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import type { Tab } from "../App";
import { clock, DEPTS, duration } from "../format";

interface Props {
  summary: Summary;
  visits: Visit[];
  reviews: Record<string, Review>;
  pendingHigh: number;
  onGo: (t: Tab) => void;
}

const DISPO_COLORS: Record<string, string> = {
  귀가: "var(--c-normal)",
  "일반병동 입원": "var(--c-accent)",
  "중환자실 입원": "var(--c-accent-strong)",
  전원: "var(--c-muted-strong)",
};

export default function Overview({ summary, visits, reviews, pendingHigh, onGo }: Props) {
  const all = Object.values(reviews);
  const requested = all.filter((r) => r.stage === "requested");
  const answered = all.filter((r) => r.stage === "answered");
  const closed = all.filter((r) => r.stage === "closed");
  const flagged = visits.filter((v) => v.flags.length > 0);
  const worst = summary.zones[0];
  const dispoTotal = Object.values(summary.disposition).reduce((a, b) => a + b, 0) || 1;
  const losTotal = Object.values(summary.los_buckets).reduce((a, b) => a + b, 0) || 1;

  return (
    <div className="stack">
      <section className="hero card">
        <p className="eyebrow">한눈에 보기 · {summary.period}</p>
        <h1>
          이 화면은 {summary.hospital} 질향상(QI)팀이 응급실 내원 {summary.total}건의
          <br className="hide-sm" /> 중증도 분류와 체류 시간이 적절했는지 검토하는 곳입니다.
        </h1>
        <p className="lead">
          구역별 재실 환자를 합쳐 병상 한도를 넘긴 시간대를 찾고, 24시간 초과 체류나 근거 없는 KTAS 하향 같은
          High Risk 건을 승인 전에 잡습니다. AI는 근거를 제안하고 결정은 담당자가 합니다.
        </p>
        <div className="hero-actions">
          <button className="btn btn-danger" onClick={() => onGo("high")}>
            확인 필요 {pendingHigh}건 처리하기 →
          </button>
          <button className="btn" onClick={() => onGo("medium")}>주의 관찰 {summary.medium}건 보기 →</button>
          <button className="btn btn-ghost" onClick={() => onGo("all")}>전체 {summary.total}건 보기 →</button>
        </div>
      </section>

      <section className="kpis">
        <article className="kpi kpi-danger">
          <span className="kpi-icon tone-danger" aria-hidden><AlertOctagon /></span>
          <span className="kpi-label">확인 필요</span>
          <strong className="kpi-value">{summary.high}<small>건</small></strong>
          <span className="kpi-foot">QI 판정 대기 {pendingHigh}건 · 종결 {closed.length}건</span>
        </article>
        <article className="kpi kpi-warn">
          <span className="kpi-icon tone-warn" aria-hidden><AlertTriangle /></span>
          <span className="kpi-label">주의 관찰</span>
          <strong className="kpi-value">{summary.medium}<small>건</small></strong>
          <span className="kpi-foot">진료 지연 · 병상 대기 6시간 초과</span>
        </article>
        <article className="kpi">
          <span className="kpi-icon tone-ok" aria-hidden><CheckCircle2 /></span>
          <span className="kpi-label">정상 진행</span>
          <strong className="kpi-value">{summary.normal}<small>건</small></strong>
          <span className="kpi-foot">전체 {summary.total}건 중 {Math.round((summary.normal / summary.total) * 100)}%</span>
        </article>
        <article className="kpi">
          <span className="kpi-icon tone-accent" aria-hidden><Clock /></span>
          <span className="kpi-label">체류 시간 중앙값</span>
          <strong className="kpi-value kpi-value-sm">{duration(summary.median_los_min)}</strong>
          <span className="kpi-foot">24시간 초과 {summary.los_buckets["24시간 초과"] ?? 0}명</span>
        </article>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>부서별 소명 현황</h2>
          <button className="link" onClick={() => onGo("explain")}>소명 현황 보기 →</button>
        </div>
        <div className="dept-strip">
          {DEPTS.filter((d) => d.code !== "QI").map((d) => {
            const mine = flagged.filter((v) => v.owner_dept === d.code);
            const req = requested.filter((r) => r.assigned_dept === d.code);
            const ans = answered.filter((r) => r.assigned_dept === d.code);
            return (
              <div key={d.code} className={`dept-strip-item dept-${d.code}`}>
                <b>{d.name}</b>
                <span className="muted small">담당 감사 신호 {mine.length}건</span>
                <span className="small">
                  {req.length ? <span className="text-warn">답변 대기 {req.length}</span> : <span className="muted">답변 대기 0</span>}
                  {" · "}
                  {ans.length ? <span className="text-accent">QI 확인 대기 {ans.length}</span> : <span className="muted">QI 확인 대기 0</span>}
                </span>
                {req.length > 0 && <span className="muted small mono">{req.map((r) => r.visit_id).join(", ")}</span>}
              </div>
            );
          })}
        </div>
      </section>

      <section className="card">
        <h2>이 화면이 하는 일</h2>
        <ol className="steps">
          <li><b>구역별 재실 합산</b><span>{worst.zone} 최대 {worst.peak}명 · 병상의 {worst.ratio}%</span></li>
          <li><b>승인 전 차단</b><span>High Risk {summary.high}건은 담당자 결정 전까지 보류</span></li>
          <li><b>부서 소명 · QI 확정</b><span>소명 요청은 담당 부서로 배정, 답변 후 QI팀이 확정</span></li>
          <li><b>QI 보고 반영</b><span>결정 결과를 엑셀로 내보내 위원회에 보고</span></li>
        </ol>
      </section>

      <div className="grid-2">
        <section className="card">
          <div className="card-head">
            <h2>구역별 최대 재실 vs 병상 한도</h2>
            <span className="muted">한도 = 병상 수 (100%)</span>
          </div>
          <ul className="zone-list">
            {summary.zones.map((z) => {
              const scale = Math.max(150, ...summary.zones.map((x) => x.ratio));
              const within = Math.min(z.ratio, 100);
              const over = Math.max(0, z.ratio - 100);
              return (
                <li key={z.zone} className="zone">
                  <div className="zone-top">
                    <b>{z.zone}</b>
                    <span className={z.ratio > 100 ? "text-danger strong" : "muted"}>{z.ratio}%</span>
                  </div>
                  <div className="bar" role="img" aria-label={`${z.zone} 최대 ${z.peak}명, 병상 ${z.beds}개, ${z.ratio}%`}>
                    <span className="bar-in" style={{ width: `${(within / scale) * 100}%` }} />
                    {over > 0 && <span className="bar-over" style={{ width: `${(over / scale) * 100}%` }} />}
                    <span className="bar-limit" style={{ left: `${(100 / scale) * 100}%` }} />
                  </div>
                  <div className="zone-foot muted">
                    병상 {z.beds} · 최대 {z.peak}명 ({clock(z.peak_at)})
                    {z.over_beds > 0 && <span className="text-danger"> · 한도 초과 {z.over_beds}명, {duration(z.over_minutes)} 지속</span>}
                  </div>
                </li>
              );
            })}
          </ul>
          {worst.ratio > 100 && (
            <p className="callout">
              {worst.zone}은 병상 {worst.beds}개에 최대 {worst.peak}명이 머물러 한도를 {worst.over_beds}명 넘었습니다. 같은 시간대 진료 지연 건과 함께 보세요.
            </p>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <h2>환자가 어디로 가는지</h2>
            <span className="muted">퇴실 경로 · {summary.total}명</span>
          </div>
          <div className="stacked" role="img" aria-label="퇴실 경로 비율">
            {Object.entries(summary.disposition).map(([k, n]) => (
              <span key={k} style={{ width: `${(n / dispoTotal) * 100}%`, background: DISPO_COLORS[k] ?? "var(--c-muted)" }} title={`${k} ${n}명`} />
            ))}
          </div>
          <ul className="legend">
            {Object.entries(summary.disposition).map(([k, n]) => (
              <li key={k}>
                <i style={{ background: DISPO_COLORS[k] ?? "var(--c-muted)" }} />
                {k}<b>{n}명</b><span className="muted">{Math.round((n / dispoTotal) * 100)}%</span>
              </li>
            ))}
          </ul>

          <h3 className="sub">체류 시간 분포</h3>
          <ul className="los">
            {Object.entries(summary.los_buckets).map(([k, n]) => (
              <li key={k} className={k === "24시간 초과" ? "is-danger" : ""}>
                <span>{k}</span>
                <div className="los-bar"><span style={{ width: `${(n / losTotal) * 100}%` }} /></div>
                <b>{n}명</b>
              </li>
            ))}
          </ul>

          <h3 className="sub">최종 KTAS 분포</h3>
          <div className="ktas-row">
            {Object.entries(summary.ktas_mix).map(([k, n]) => (
              <div key={k} className={`ktas-chip ktas-${k}`}>
                <span>KTAS {k}</span>
                <b>{n}</b>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
