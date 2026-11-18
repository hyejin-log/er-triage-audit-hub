// [기획 > 발표] 심사위원·면접관용 핵심 요약 — 문제 · 데이터 흐름 · 확인되는 효과
// 로그인 전 첫 화면에 바로 펼쳐 보이고(BriefPanel), 로그인 후에는 상단 버튼으로 모달을 엽니다(JudgeBrief).
// 모든 숫자는 앱이 실제로 계산한 값만 씁니다(예측·과장 수치 없음).
import { useEffect, useRef } from "react";
import { ArrowRight, Award, Database, Target, TrendingDown, X } from "lucide-react";
import type { Progress, Summary } from "../types";
import { duration, pct } from "../format";

interface ContentProps {
  summary: Summary | null;
  progress: Progress | null;
}

const FLOW = ["규칙 자동 감지", "AI 근거 제안", "QI팀 판정", "담당 팀 소명", "QI팀 확정"];
const STACK = "React · Vite · FastAPI · Neon Postgres · Supabase Auth · Vercel";

/** 요약 본문 — 첫 화면 패널과 모달이 함께 씁니다. */
export function BriefContent({ summary, progress }: ContentProps) {
  const flagged = summary ? summary.high + summary.medium : 0;
  const worst = summary?.zones[0];

  return (
    <div className="brief">
      <section className="brief-row">
        <h3><Target className="ico" /> 문제</h3>
        <p>
          응급실 과밀과 KTAS 분류 오류는 진료 지연으로 이어지는데, 감사는 기록을 한 건씩 넘겨 보는 수작업이에요.
          무엇을 먼저 보고 누구에게 설명을 받을지가 흩어져 있어요.
        </p>
      </section>

      <section className="brief-row">
        <h3><Database className="ico" /> 해결 흐름</h3>
        <ol className="flow-chips">
          {FLOW.map((f, i) => (
            <li key={f}>
              <span>{f}</span>
              {i < FLOW.length - 1 && <ArrowRight className="ico" aria-hidden />}
            </li>
          ))}
        </ol>
        <p className="muted small">{STACK}</p>
      </section>

      <section className="brief-row">
        <h3><TrendingDown className="ico" /> 이 데모에서 확인되는 것</h3>
        {summary ? (
          <div className="brief-stats">
            <div>
              <b>{summary.total}→{flagged}건</b>
              <span>검토 대상만 자동 선별 (범위 {100 - pct(flagged, summary.total)}% 축소)</span>
            </div>
            <div>
              <b>{worst?.zone} {worst?.ratio}%</b>
              <span>병상 {worst?.beds}개에 최대 {worst?.peak}명, 초과 {duration(worst?.over_minutes ?? 0)}</span>
            </div>
            <div>
              <b>24시간+ {summary.los_buckets["24시간 초과"] ?? 0}명</b>
              <span>평가 지표 위반 후보를 판정 전에 보류</span>
            </div>
            <div>
              <b>{progress?.available ? `종결 ${progress.closed}/${progress.flagged}` : "-"}</b>
              <span>판정 대기 {progress ? progress.undecided + progress.answered : "-"} · 소명 중 {progress?.requested ?? "-"}</span>
            </div>
          </div>
        ) : (
          <p className="muted small" aria-busy="true">숫자를 불러오는 중이에요.</p>
        )}
        <p className="muted small">가상 데이터 기준이에요. 실제 효과는 기관 데이터로 검증이 필요해요.</p>
      </section>
    </div>
  );
}

/** 로그인 후 상단 버튼으로 여는 모달 */
export default function JudgeBrief({ summary, progress, onClose }: ContentProps & { onClose: () => void }) {
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

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="brief-title" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <div className="modal-title">
            <span className="kpi-icon tone-accent static"><Award /></span>
            <div>
              <h2 id="brief-title">핵심 요약</h2>
              <p className="muted small">심사위원·면접관을 위한 한 장 요약</p>
            </div>
          </div>
          <button ref={closeRef} className="icon-btn" onClick={onClose} aria-label="닫기"><X className="ico" /></button>
        </header>
        <BriefContent summary={summary} progress={progress} />
        <button className="btn btn-primary btn-block" onClick={onClose}>확인했어요</button>
      </div>
    </div>
  );
}
