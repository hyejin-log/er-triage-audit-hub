// [기획 > MVP 소개] 로그인 전 첫 화면 (데스크톱 한 화면)
//   왼쪽: 소개, 집계, 부서별 데모 접속 / 오른쪽: 프로젝트 요약, 용어 (로그인 후에는 표시하지 않음)
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

const TEAM_VIEW: Record<DeptCode, string> = {
  QI: "기록 판정, 소명 요청, 최종 판정",
  NURSING: "재분류 근거 기록률, 과소분류, 간호사별 현황",
  EM: "등급별 진료 목표 준수율, 의사별 대기 시간",
  BED: "구역별 혼잡도, 입원 병상 대기 시간",
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
      setError("접속에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      setBusy(null);
    }
  };

  return (
    <div className="landing-fit">
      {/* 왼쪽: 소개 + 숫자 + 팀 선택 | 오른쪽: 핵심 요약 */}
      <div className="landing-main">
        <section className="card landing-intro">
          <p className="eyebrow">응급실 진료 기록 감사 · 가상 데이터</p>
          <h1>응급실 중증도 분류와 진료 지연을 점검합니다</h1>
          <p className="lead small">
            응급실은 내원 환자를 <Term k="KTAS" /> 1~5등급으로 분류해 진료 순서를 정합니다(1등급이 가장 위급).
            {summary ? ` ${summary.period} 내원 ${summary.total}건` : " 내원 기록"} 가운데 분류나 대기 시간에 문제가 있는 기록을 추려{" "}
            <Term k="QI">QI팀</Term>(의료 질 향상 관리팀)이 검토하고, 필요하면 담당 부서에 <Term k="EXPLAIN">소명</Term>을 요청합니다.
          </p>

          <div className="mini-kpis" aria-busy={!summary}>
            <Stat icon={<Users />} label="전체 내원" value={summary ? `${summary.total}건` : "-"} />
            <Stat icon={<AlertOctagon />} tone="danger" label={<Term k="SIGNAL">검토 대상</Term>} value={summary ? `${summary.high + summary.medium}건` : "-"} foot={summary ? `확인 필요 ${summary.high}, 주의 ${summary.medium}` : ""} />
            <Stat icon={<BedDouble />} tone="warn" label="최대 혼잡 구역" value={worst ? `${worst.ratio}%` : "-"} foot={worst ? `${worst.zone}, 병상 ${worst.beds}개 / 최대 ${worst.peak}명` : ""} />
            <Stat icon={<Clock />} tone="accent" label="체류시간 중앙값" value={summary ? duration(summary.median_los_min) : "-"} foot={summary ? `24시간 초과 ${summary.los_buckets["24시간 초과"] ?? 0}명` : ""} />
            <Stat icon={<CheckCircle2 />} tone="ok" label="검토 완료" value={progress?.available ? `종결 ${progress.closed}/${progress.flagged}` : "-"} foot={progress?.available ? `판정 대기 ${progress.undecided + progress.answered}, 소명 중 ${progress.requested}` : ""} />
          </div>

          {/* 팀 선택 — 소개 카드 안 아래쪽 */}
          <div className="team-pick" aria-labelledby="teams-title">
            <div className="section-head tight">
              <h2 id="teams-title">부서별 데모 계정</h2>
              <span className="muted small">별도 가입 없이 접속됩니다. 부서마다 화면과 권한이 다릅니다.</span>
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
                    {busy === d.code ? "접속 중…" : `${withRo(d.name)} 접속`}
                  </span>
                </button>
              ))}
            </div>
            {error && <p className="text-danger small" role="alert">{error}</p>}
          </div>

          <p className="muted small landing-note">
            로그인 전에는 집계만 표시됩니다. 모든 데이터는 가상 데이터이며 실제 환자 정보는 포함되어 있지 않습니다.
          </p>
        </section>

        <section className="card landing-brief" aria-labelledby="brief-inline-title">
          <div className="brief-head">
            <span className="kpi-icon tone-accent static"><Award /></span>
            <div>
              <h2 id="brief-inline-title">프로젝트 요약</h2>
              <p className="muted small">심사·면접 참고용</p>
            </div>
          </div>
          <BriefContent summary={summary} progress={progress} />

          {/* 용어 */}
          <div className="glossary" aria-labelledby="glossary-title">
            <h3 id="glossary-title">용어</h3>
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
