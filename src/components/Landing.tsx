// [기획 > MVP 소개] 로그인 전 첫 화면 — 데스크톱에서 스크롤 없이 한 화면에 보이도록 구성
//   1행: 팀별 로그인 카드 4개 (입장)
//   2행: 왼쪽 허브 소개 + 핵심 숫자 / 오른쪽 핵심 요약(심사위원·면접관용)
// 건별 내원 정보는 로그인한 팀에게만 보여 주고, 여기에는 숫자 집계만 나옵니다.
import { useState } from "react";
import { AlertOctagon, Award, BedDouble, CheckCircle2, Clock, LogIn, Users } from "lucide-react";
import type { DeptCode, Progress, Summary } from "../types";
import { DEPTS, duration, withRo } from "../format";
import { BriefContent } from "./JudgeBrief";

interface Props {
  summary: Summary | null;
  progress: Progress | null;
  onDemoLogin: (dept: DeptCode) => Promise<void>;
}

const TEAM_VIEW: Record<DeptCode, string> = {
  QI: "판정 · 소명 요청 · 최종 확정 · 전체 현황",
  NURSING: "재분류 근거율 · 과소분류 · 간호사별 현황",
  EM: "KTAS별 진료 목표 달성 · 담당의별 대기",
  BED: "구역 과밀화 · 병상 배정 대기 분포",
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
      {/* 1행: 팀별 입장 */}
      <section aria-labelledby="teams-title">
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
      </section>

      {/* 2행: 소개 + 숫자 | 핵심 요약 */}
      <div className="landing-main">
        <section className="card landing-intro">
          <p className="eyebrow">응급실 KTAS 감사 허브 · 가상 데이터 데모</p>
          <h1>응급실 내원 기록에서 분류 오류와 지연을 찾아내고, 담당 팀의 소명을 받아 확정합니다.</h1>
          <p className="lead small">
            {summary ? `${summary.hospital} · ${summary.period} · 내원 ${summary.total}건` : "응급실 내원 기록"}을 감사 규칙으로 살펴요.
            QI팀이 판정하고 응급간호팀·응급의학과·병상관리팀이 맡은 건에 소명합니다.
          </p>

          <div className="mini-kpis" aria-busy={!summary}>
            <Stat icon={<Users />} label="감사 대상 내원" value={summary ? `${summary.total}건` : "-"} />
            <Stat icon={<AlertOctagon />} tone="danger" label="감사 신호" value={summary ? `${summary.high + summary.medium}건` : "-"} foot={summary ? `확인 필요 ${summary.high} · 주의 ${summary.medium}` : ""} />
            <Stat icon={<BedDouble />} tone="warn" label="가장 붐빈 구역" value={worst ? `${worst.ratio}%` : "-"} foot={worst ? `${worst.zone} · 병상 ${worst.beds}개에 ${worst.peak}명` : ""} />
            <Stat icon={<Clock />} tone="accent" label="체류 중앙값" value={summary ? duration(summary.median_los_min) : "-"} foot={summary ? `24시간 초과 ${summary.los_buckets["24시간 초과"] ?? 0}명` : ""} />
            <Stat icon={<CheckCircle2 />} tone="ok" label="감사 진행" value={progress?.available ? `종결 ${progress.closed}/${progress.flagged}` : "-"} foot={progress?.available ? `판정 대기 ${progress.undecided + progress.answered} · 소명 중 ${progress.requested}` : ""} />
          </div>

          <p className="muted small landing-note">
            로그인 전에는 숫자만 보여요. 건별 내용은 로그인한 팀에게만 보입니다. 실제 이메일 계정은 오른쪽 위 ‘로그인’(QI팀 권한). 모든 데이터는 가상이에요.
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
        </section>
      </div>
    </div>
  );
}

function Stat({ icon, label, value, foot, tone }: { icon: React.ReactNode; label: string; value: string; foot?: string; tone?: string }) {
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
