// [기획 > MVP 소개] 로그인 전 첫 화면 — 허브 설명 + 전체 집계 한눈에 보기 + 팀별 입장
// 건별 내원 정보는 로그인한 팀에게만 보여 줍니다. 여기에는 숫자 집계만 나옵니다.
import { useState } from "react";
import { AlertOctagon, BedDouble, CheckCircle2, Clock, Users } from "lucide-react";
import type { DeptCode, Progress, Summary } from "../types";
import { DEPTS, duration, withRo } from "../format";

interface Props {
  summary: Summary | null;
  progress: Progress | null;
  onDemoLogin: (dept: DeptCode) => Promise<void>;
}

const TEAM_VIEW: Record<DeptCode, string[]> = {
  QI: ["확인 필요·주의 관찰 건 판정", "담당 부서에 소명 요청, 답변 후 최종 확정", "병원 전체 감사 현황과 엑셀 보고"],
  NURSING: ["하향 재분류·근거 기록률·과소분류 지표", "분류 간호사별 현황", "KTAS 관련 소명 답변"],
  EM: ["KTAS 등급별 진료 목표 달성률", "담당의별 진료 대기", "진료 지연·72시간 재내원 소명 답변"],
  BED: ["구역별 과밀화(병상 대비 재실)", "입원 결정→병상 배정 대기 분포", "24시간 초과·병상 대기 소명 답변"],
};

const STEPS = [
  { title: "자동 감지", body: "내원 기록에서 24시간 초과 체류, 근거 없는 KTAS 하향, 과소분류 의심, 진료·병상 지연을 찾아요." },
  { title: "QI팀 판정", body: "AI가 근거를 정리해 제안하고, QI팀이 적정 확인·재분류 확정·소명 요청 중에서 결정해요." },
  { title: "담당 팀 소명", body: "소명 요청은 감사 신호에 맞는 팀(응급간호팀·응급의학과·병상관리팀)으로 자동 배정돼요." },
  { title: "최종 확정", body: "QI팀이 소명을 읽고 확정하면 종결돼요. 모든 기록은 팀 간에 공유돼요." },
];

export default function Landing({ summary, progress, onDemoLogin }: Props) {
  const [busy, setBusy] = useState<DeptCode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const worst = summary?.zones[0];

  const enter = async (dept: DeptCode) => {
    setBusy(dept);
    setError(null);
    try {
      await onDemoLogin(dept);
    } catch {
      setError("로그인하지 못했어요. 잠시 후 다시 시도해 주세요.");
      setBusy(null);
    }
  };

  return (
    <div className="stack landing">
      <section className="hero card landing-hero">
        <p className="eyebrow">응급실 KTAS 감사 허브 · 가상 데이터 데모</p>
        <h1>응급실 내원 기록에서 분류 오류와 지연을 찾아내고,<br className="hide-sm" /> 담당 팀의 소명을 받아 확정하는 곳입니다.</h1>
        <p className="lead">
          {summary ? `${summary.hospital}의 ${summary.period} 내원 ${summary.total}건` : "응급실 내원 기록"}을 감사 규칙으로 살펴봐요.
          QI팀이 판정하고, 응급간호팀·응급의학과·병상관리팀이 각자 맡은 건에 소명을 남깁니다.
        </p>
        <div className="hero-actions">
          <button className="btn btn-primary" onClick={() => enter("QI")} disabled={busy !== null}>
            {busy === "QI" ? "들어가는 중…" : "QI팀으로 시작하기 →"}
          </button>
          <a className="btn btn-ghost" href="#teams">팀 골라서 로그인 ↓</a>
        </div>
      </section>

      <section>
        <div className="section-head">
          <h2>한눈에 보기</h2>
          <span className="muted small">로그인 전에는 전체 숫자만 보여요. 건별 내용은 로그인한 팀에게 보여요.</span>
        </div>
        {!summary ? (
          <div className="skeleton-grid" aria-busy="true"><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /></div>
        ) : (
          <div className="kpis kpis-5">
            <article className="kpi">
              <span className="kpi-icon" aria-hidden><Users /></span>
              <span className="kpi-label">감사 대상 내원</span>
              <strong className="kpi-value">{summary.total}<small>건</small></strong>
              <span className="kpi-foot">{summary.period}</span>
            </article>
            <article className="kpi kpi-danger">
              <span className="kpi-icon tone-danger" aria-hidden><AlertOctagon /></span>
              <span className="kpi-label">감사 신호</span>
              <strong className="kpi-value">{summary.high + summary.medium}<small>건</small></strong>
              <span className="kpi-foot">확인 필요 {summary.high} · 주의 관찰 {summary.medium}</span>
            </article>
            <article className={`kpi ${worst && worst.ratio > 100 ? "kpi-warn" : ""}`}>
              <span className="kpi-icon tone-warn" aria-hidden><BedDouble /></span>
              <span className="kpi-label">가장 붐빈 구역</span>
              <strong className="kpi-value kpi-value-sm">{worst?.zone} {worst?.ratio}%</strong>
              <span className="kpi-foot">병상 {worst?.beds}개에 최대 {worst?.peak}명</span>
            </article>
            <article className="kpi">
              <span className="kpi-icon tone-accent" aria-hidden><Clock /></span>
              <span className="kpi-label">체류 시간 중앙값</span>
              <strong className="kpi-value kpi-value-sm">{duration(summary.median_los_min)}</strong>
              <span className="kpi-foot">24시간 초과 {summary.los_buckets["24시간 초과"] ?? 0}명</span>
            </article>
            <article className="kpi">
              <span className="kpi-icon tone-ok" aria-hidden><CheckCircle2 /></span>
              <span className="kpi-label">감사 진행</span>
              {progress?.available ? (
                <>
                  <strong className="kpi-value kpi-value-sm">종결 {progress.closed}<small>/{progress.flagged}</small></strong>
                  <span className="kpi-foot">판정 대기 {progress.undecided + progress.answered} · 소명 중 {progress.requested}</span>
                </>
              ) : (
                <>
                  <strong className="kpi-value kpi-value-sm">-</strong>
                  <span className="kpi-foot">진행 현황을 불러오지 못했어요</span>
                </>
              )}
            </article>
          </div>
        )}
      </section>

      <section className="card">
        <h2>어떻게 동작하나요</h2>
        <ol className="flow">
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <span className="flow-no">{i + 1}</span>
              <b>{s.title}</b>
              <p className="muted small">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="teams">
        <div className="section-head">
          <h2>팀별로 로그인하기</h2>
          <span className="muted small">메일 없이 바로 들어가는 데모 계정이에요. 팀마다 첫 화면과 할 수 있는 일이 달라요.</span>
        </div>
        <div className="team-cards">
          {DEPTS.map((d) => (
            <article key={d.code} className={`team-card dept-${d.code}`}>
              <div>
                <b className="team-name">{d.name}</b>
                <span className="muted small">{d.role}</span>
              </div>
              <ul>
                {TEAM_VIEW[d.code].map((t) => <li key={t}>{t}</li>)}
              </ul>
              <button className="btn" onClick={() => enter(d.code)} disabled={busy !== null}>
                {busy === d.code ? "들어가는 중…" : `${withRo(d.name)} 로그인`}
              </button>
            </article>
          ))}
        </div>
        {error && <p className="text-danger small" role="alert">{error}</p>}
        <p className="muted small landing-note">
          실제 이메일 계정으로 들어가려면 오른쪽 위 ‘로그인’에서 로그인 링크를 받으세요(QI팀 권한). 모든 데이터는 가상이며 실제 환자 정보는 없습니다.
        </p>
      </section>
    </div>
  );
}
