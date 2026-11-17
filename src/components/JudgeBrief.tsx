// [기획 > 발표] 심사위원 핵심 요약 — 문제 · 데이터 흐름 · 기대 효과
// 모든 숫자는 앱이 실제로 계산한 값만 씁니다(예측·과장 수치 없음).
import { useEffect, useRef } from "react";
import { Award, Database, Target, TrendingDown, X } from "lucide-react";
import type { Progress, Summary } from "../types";
import { duration, pct } from "../format";

interface Props {
  summary: Summary | null;
  progress: Progress | null;
  onClose: () => void;
}

const PIPELINE = [
  "가상 내원 데이터 160건 생성 (시드 고정)",
  "감사 규칙 엔진 7종 → 건별 감사 신호",
  "구역별 동시 재실 합산 → 병상 대비 과밀화",
  "AI 근거 제안 (Claude, 실패 시 규칙 엔진)",
  "QI팀 판정 → 담당 팀 소명 → QI팀 확정",
];

export default function JudgeBrief({ summary, progress, onClose }: Props) {
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

  const flagged = summary ? summary.high + summary.medium : 0;
  const worst = summary?.zones[0];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="brief-title" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <div className="modal-title">
            <span className="kpi-icon tone-accent static"><Award /></span>
            <div>
              <h2 id="brief-title">핵심 요약</h2>
              <p className="muted small">심사위원·채용 담당자를 위한 한 장 요약</p>
            </div>
          </div>
          <button ref={closeRef} className="icon-btn" onClick={onClose} aria-label="닫기"><X className="ico" /></button>
        </header>

        <section className="brief-block">
          <h3><Target className="ico" /> 1. 해결하려는 문제</h3>
          <p>
            응급실 과밀과 KTAS 분류 오류는 진료 지연으로 이어지지만, 감사는 사람이 기록을 한 건씩 넘겨 보는 수작업이에요.
            어떤 건을 먼저 봐야 하는지, 누구에게 설명을 받아야 하는지가 흩어져 있어요.
          </p>
        </section>

        <section className="brief-block">
          <h3><Database className="ico" /> 2. 데이터 흐름</h3>
          <ol className="brief-flow">
            {PIPELINE.map((p) => <li key={p}>{p}</li>)}
          </ol>
          <p className="muted small">React + Vite · FastAPI(Python) · Neon Postgres · Supabase Auth · Vercel</p>
        </section>

        <section className="brief-block">
          <h3><TrendingDown className="ico" /> 3. 이 데모에서 확인되는 효과</h3>
          {summary ? (
            <ul className="brief-facts">
              <li><b>{summary.total}건 → {flagged}건</b><span>전체 내원 중 감사가 필요한 건만 자동으로 추려 검토 범위를 {100 - pct(flagged, summary.total)}% 줄였어요.</span></li>
              <li><b>{worst?.zone} {worst?.ratio}%</b><span>병상 {worst?.beds}개에 최대 {worst?.peak}명. 한도 초과가 {duration(worst?.over_minutes ?? 0)} 이어졌어요.</span></li>
              <li><b>24시간 초과 {summary.los_buckets["24시간 초과"] ?? 0}명</b><span>평가 지표 위반 후보를 사람 판단 전에 보류해요.</span></li>
              <li>
                <b>{progress?.available ? `종결 ${progress.closed}/${progress.flagged}` : "진행 현황 -"}</b>
                <span>판정 대기 {progress ? progress.undecided + progress.answered : "-"} · 소명 중 {progress?.requested ?? "-"} (지금 DB 기준)</span>
              </li>
            </ul>
          ) : <p className="muted small">요약을 불러오는 중이에요.</p>}
          <p className="muted small">가상 데이터 기준이며, 실제 효과는 기관 데이터로 검증이 필요해요.</p>
        </section>

        <button className="btn btn-primary btn-block" onClick={onClose}>확인했어요</button>
      </div>
    </div>
  );
}
