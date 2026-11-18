// [기획 > MVP 소개] 로그인 전 첫 화면 — 데스크톱에서 스크롤 없이 한 화면에 보이도록 구성
//   왼쪽 카드: 허브 소개 → 핵심 숫자 → 팀 선택(로그인)
//   오른쪽 카드: 핵심 요약(심사위원·면접관용, 로그인 후에는 보이지 않음)
// 건별 내원 정보는 로그인한 팀에게만 보여 주고, 여기에는 숫자 집계만 나옵니다.
import { useState } from "react";
import { AlertOctagon, Award, BedDouble, CheckCircle2, Clock, LogIn, Users } from "lucide-react";
import type { DeptCode, Progress, Summary } from "../types";
import { DEPTS, duration, GLOSSARY, withRo } from "../format";
import Term from "./Term";
import { BriefContent } from "./JudgeBrief";

interface Props {
  summary: Summary | null;
  progress: Progress | null;
  onDemoLogin: (dept: DeptCode) => Promise<void>;
}

// 처음 보는 사람도 알 수 있게 쉬운 말로
const TEAM_VIEW: Record<DeptCode, string> = {
  QI: "기록 점검 · 팀에 설명 요청 · 최종 판정",
  NURSING: "위급도를 낮춘 근거 · 너무 낮게 매긴 건 · 간호사별 현황",
  EM: "등급별 목표 시간 안에 진료했는지 · 의사별 대기",
  BED: "구역이 얼마나 붐볐는지 · 입원 병상 대기 시간",
};

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
    <div className="landing-fit">
      {/* 왼쪽: 소개 + 숫자 + 팀 선택 | 오른쪽: 핵심 요약 */}
      <div className="landing-main">
        <section className="card landing-intro">
          <p className="eyebrow">응급실 진료 기록 점검 도구 · 가상 데이터 데모</p>
          <h1>응급실에서 환자의 위급도를 제대로 매겼는지, 너무 오래 기다리게 하진 않았는지 자동으로 찾아냅니다.</h1>
          <p className="lead small">
            응급실은 도착한 환자를 <Term k="KTAS" />(1~5등급, 숫자가 작을수록 위급)로 나눠 진료 순서를 정해요.
            이 도구는 {summary ? `${summary.period} 내원 ${summary.total}건` : "내원 기록"}을 점검해 문제 있는 건을 골라내고,
            <Term k="QI">QI팀(의료 질 관리팀)</Term>이 판정한 뒤 담당 팀의 <Term k="EXPLAIN">설명(소명)</Term>을 받아 마무리합니다.
          </p>

          <div className="mini-kpis" aria-busy={!summary}>
            <Stat icon={<Users />} label="점검한 내원" value={summary ? `${summary.total}건` : "-"} />
            <Stat icon={<AlertOctagon />} tone="danger" label={<Term k="SIGNAL">다시 볼 기록</Term>} value={summary ? `${summary.high + summary.medium}건` : "-"} foot={summary ? `꼭 확인 ${summary.high} · 주의 ${summary.medium}` : ""} />
            <Stat icon={<BedDouble />} tone="warn" label="가장 붐빈 구역" value={worst ? `${worst.ratio}%` : "-"} foot={worst ? `${worst.zone} · 병상 ${worst.beds}개에 최대 ${worst.peak}명` : ""} />
            <Stat icon={<Clock />} tone="accent" label="응급실 머문 시간" value={summary ? duration(summary.median_los_min) : "-"} foot={summary ? `중앙값 · 24시간 넘게 ${summary.los_buckets["24시간 초과"] ?? 0}명` : ""} />
            <Stat icon={<CheckCircle2 />} tone="ok" label="점검 마무리" value={progress?.available ? `종결 ${progress.closed}/${progress.flagged}` : "-"} foot={progress?.available ? `판정 대기 ${progress.undecided + progress.answered} · 소명 중 ${progress.requested}` : ""} />
          </div>

          {/* 팀 선택 — 소개 카드 안 아래쪽 */}
          <div className="team-pick" aria-labelledby="teams-title">
            <div className="section-head tight">
              <h2 id="teams-title">팀을 골라 들어가기</h2>
              <span className="muted small">메일 없이 바로 들어가는 데모 계정이에요. 팀마다 첫 화면과 할 수 있는 일이 달라요.</span>
            </div>
            <div className="team-row">
              {DEPTS.map((d) => (
                <button key={d.code} className={`team-tile dept-${d.code}`} onClick={() => enter(d.code)} disabled={busy !== null}>
                  <span className="team-tile-top">
                    <b>{d.name}</b>
                    <span className="muted small">{d.role}</span>
                  </span>
                  <span className="team-tile-desc">{TEAM_VIEW[d.code]}</span>
                  <span className="team-tile-cta">
                    <LogIn className="ico" />
                    {busy === d.code ? "들어가는 중…" : `${withRo(d.name)} 로그인`}
                  </span>
                </button>
              ))}
            </div>
            {error && <p className="text-danger small" role="alert">{error}</p>}
          </div>

          <p className="muted small landing-note">
            로그인 전에는 숫자만 보여요. 환자별 내용은 로그인한 팀에게만 보입니다. 모든 데이터는 가상이며 실제 환자 정보는 없어요.
          </p>
        </section>

        <section className="card landing-brief" aria-labelledby="brief-inline-title">
          <div className="brief-head">
            <span className="kpi-icon tone-accent static"><Award /></span>
            <div>
              <h2 id="brief-inline-title">핵심 요약</h2>
              <p className="muted small">심사위원·면접관을 위한 한 장 요약</p>
            </div>
          </div>
          <BriefContent summary={summary} progress={progress} />

          {/* 처음 보는 분을 위한 용어 */}
          <div className="glossary" aria-labelledby="glossary-title">
            <h3 id="glossary-title">처음 보는 분을 위한 용어</h3>
            <dl>
              {Object.values(GLOSSARY).map((g) => (
                <div key={g.term}>
                  <dt>{g.term}</dt>
                  <dd>{g.short}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      </div>
    </div>
  );
}

function Stat({ icon, label, value, foot, tone }: { icon: React.ReactNode; label: React.ReactNode; value: string; foot?: string; tone?: string }) {
  return (
    <div className="mini-kpi">
      <span className={`kpi-icon static sm ${tone ? `tone-${tone}` : ""}`} aria-hidden>{icon}</span>
      <div>
        <span className="mini-label">{label}</span>
        <b className="mini-value">{value}</b>
        {foot && <span className="mini-foot">{foot}</span>}
      </div>
    </div>
  );
}
