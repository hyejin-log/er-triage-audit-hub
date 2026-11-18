// [기획 > 발표] 프로젝트 요약 (로그인 전 첫 화면 전용)
// 숫자는 모두 앱이 계산한 값입니다.
import { ArrowRight, Database, Target, TrendingDown } from "lucide-react";
import type { Progress, Summary } from "../types";
import { duration, pct } from "../format";

interface ContentProps {
  summary: Summary | null;
  progress: Progress | null;
}

const FLOW = ["자동 점검", "문제 요약", "QI팀 판단", "부서 설명", "최종 결론"];
const STACK = "React, Vite, FastAPI, Neon Postgres, Supabase Auth, Vercel";

/** 프로젝트 요약 (로그인 전 첫 화면 오른쪽) */
export function BriefContent({ summary, progress }: ContentProps) {
  const flagged = summary ? summary.high + summary.medium : 0;
  const worst = summary?.zones[0];

  return (
    <div className="brief">
      <section className="brief-row">
        <h3><Target className="ico" /> 배경</h3>
        <p>
          응급실이 붐비거나 환자 등급을 잘못 매기면 진료가 늦어집니다. 그런데 이런 기록을 찾는 일은 대부분 한 건씩 열어 보는 수작업입니다.
        </p>
      </section>

      <section className="brief-row">
        <h3><Database className="ico" /> 처리 과정</h3>
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
        <h3><TrendingDown className="ico" /> 결과 (가상 데이터 기준)</h3>
        {summary ? (
          <div className="brief-stats">
            <div>
              <b>{summary.total}건 중 {flagged}건</b>
              <span>다시 볼 기록만 골라 사람이 볼 양을 {100 - pct(flagged, summary.total)}% 줄임</span>
            </div>
            <div>
              <b>{worst?.zone} {worst?.ratio}%</b>
              <span>침대 {worst?.beds}개에 최대 {worst?.peak}명, 넘친 시간 {duration(worst?.over_minutes ?? 0)}</span>
            </div>
            <div>
              <b>하루 넘게 머문 환자 {summary.los_buckets["24시간 초과"] ?? 0}명</b>
              <span>병원 평가에서 보는 항목</span>
            </div>
            <div>
              <b>{progress?.available ? `종결 ${progress.closed}/${progress.flagged}` : "-"}</b>
              <span>결론 대기 {progress ? progress.undecided + progress.answered : "-"}, 부서 설명 대기 {progress?.requested ?? "-"}</span>
            </div>
          </div>
        ) : (
          <p className="muted small" aria-busy="true">불러오는 중</p>
        )}
        <p className="muted small">실제 효과는 기관 데이터로 검증이 필요합니다.</p>
      </section>
    </div>
  );
}
