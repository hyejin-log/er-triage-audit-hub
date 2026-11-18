// [기획 > 발표] 심사위원·면접관용 핵심 요약 — 문제 · 데이터 흐름 · 확인되는 효과
// 로그인 전 첫 화면에만 펼쳐 보입니다(로그인 후에는 필요 없어서 두지 않음).
// 모든 숫자는 앱이 실제로 계산한 값만 씁니다(예측·과장 수치 없음).
import { ArrowRight, Database, Target, TrendingDown } from "lucide-react";
import type { Progress, Summary } from "../types";
import { duration, pct } from "../format";

interface ContentProps {
  summary: Summary | null;
  progress: Progress | null;
}

const FLOW = ["규칙이 자동 점검", "AI가 근거 정리", "QI팀 판정", "담당 팀 설명(소명)", "QI팀 확정"];
const STACK = "React · Vite · FastAPI · Neon Postgres · Supabase Auth · Vercel";

/** 요약 본문 — 로그인 전 첫 화면 오른쪽 패널 */
export function BriefContent({ summary, progress }: ContentProps) {
  const flagged = summary ? summary.high + summary.medium : 0;
  const worst = summary?.zones[0];

  return (
    <div className="brief">
      <section className="brief-row">
        <h3><Target className="ico" /> 문제</h3>
        <p>
          응급실은 위급한 환자부터 봐야 하지만, 위급도를 잘못 매기거나 병상이 없어 오래 기다리는 일이 생겨요.
          이런 건을 찾는 점검은 지금까지 기록을 한 건씩 넘겨 보는 수작업이었어요.
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
              <span>다시 볼 기록만 자동으로 골라 사람이 볼 양을 {100 - pct(flagged, summary.total)}% 줄임</span>
            </div>
            <div>
              <b>{worst?.zone} {worst?.ratio}%</b>
              <span>병상 {worst?.beds}개에 최대 {worst?.peak}명, 넘친 시간 {duration(worst?.over_minutes ?? 0)}</span>
            </div>
            <div>
              <b>24시간 넘게 {summary.los_buckets["24시간 초과"] ?? 0}명</b>
              <span>응급실 평가 기준에 걸리는 환자를 먼저 표시</span>
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
