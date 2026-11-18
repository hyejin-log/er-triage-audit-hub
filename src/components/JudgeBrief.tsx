// [기획 > 발표] 프로젝트 요약 (로그인 전 첫 화면 전용)
// 숫자는 모두 앱이 계산한 값입니다.
import { ArrowRight, Database, Target, TrendingDown } from "lucide-react";
import type { Progress, Summary } from "../types";
import { duration, pct } from "../format";

interface ContentProps {
  summary: Summary | null;
  progress: Progress | null;
}

const FLOW = ["규칙 기반 점검", "근거 요약", "QI팀 판정", "부서 소명", "최종 판정"];
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
          응급실 과밀과 중증도 분류 오류는 진료 지연으로 이어집니다. 그런데 감사는 대부분 기록을 한 건씩 열어 보는 수작업으로 진행됩니다.
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
              <span>검토 대상만 추려 검토량 {100 - pct(flagged, summary.total)}% 감소</span>
            </div>
            <div>
              <b>{worst?.zone} {worst?.ratio}%</b>
              <span>병상 {worst?.beds}개 / 최대 {worst?.peak}명, 초과 {duration(worst?.over_minutes ?? 0)}</span>
            </div>
            <div>
              <b>24시간 초과 {summary.los_buckets["24시간 초과"] ?? 0}명</b>
              <span>응급의료기관 평가 지표 해당</span>
            </div>
            <div>
              <b>{progress?.available ? `종결 ${progress.closed}/${progress.flagged}` : "-"}</b>
              <span>판정 대기 {progress ? progress.undecided + progress.answered : "-"}, 소명 중 {progress?.requested ?? "-"}</span>
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
