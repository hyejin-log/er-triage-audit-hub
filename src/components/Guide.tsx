// [기획 > 사용자 이해] 업무 안내 탭: 처리 절차(담당 단계 강조), 부서별 업무 순서, 상태 표시
import { ArrowRight, CheckCircle2, Cog, Users } from "lucide-react";
import type { Tab } from "../App";
import type { User } from "../types";
import { DEPT_GUIDE, FLOW_STEPS, LEGEND, STAGE_PLAIN } from "../guide";

interface Props {
  user: User;
  onGo: (t: Tab) => void;
  onDone: () => void;
}

/** 안내 문구의 탭 이름 → 실제 탭 */
function tabFor(name: string): Tab {
  if (name.endsWith("홈")) return "overview";
  if (name.endsWith("소명") || name === "소명 현황") return "explain";
  if (name === "확인 필요") return "high";
  if (name === "전체 내원") return "all";
  return "overview";
}

export default function Guide({ user, onGo, onDone }: Props) {
  const g = DEPT_GUIDE[user.dept];
  const isMine = (actor: string) => actor === user.dept || (actor === "TEAM" && user.dept !== "QI");

  return (
    <div className="stack guide">
      <section className={`card guide-hero dept-${user.dept}`}>
        <div>
          <p className="eyebrow">업무 안내</p>
          <h1>{user.dept_name} 업무 안내 <span className="dc">{g.role}</span></h1>
          <p className="lead small">{g.does}</p>
        </div>
        <button className="btn btn-primary" onClick={onDone}>
          업무 시작 <ArrowRight className="ico" />
        </button>
      </section>

      <div className="guide-grid">
        <section className="card">
          <div className="card-head">
            <h2>처리 절차</h2>
            <span className="muted small">강조 표시: {user.dept_name} 담당 단계</span>
          </div>
          <ol className="flow-steps">
            {FLOW_STEPS.map((s) => (
              <li key={s.no} className={isMine(s.actor) ? "is-mine" : ""}>
                <span className="fs-no">{s.no}</span>
                <div className="fs-body">
                  <div className="fs-top">
                    <b>{s.title}</b>
                    <span className={`fs-actor ${s.actor === "SYSTEM" ? "sys" : ""}`}>
                      {s.actor === "SYSTEM" ? <Cog className="ico" /> : <Users className="ico" />}
                      {s.actorName}
                    </span>
                  </div>
                  <p className="small muted">{s.body}</p>
                  <span className="fs-stage">상태 → {s.stage}</span>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <div className="stack-sm">
          <section className="card">
            <div className="card-head">
              <h2>{user.dept_name} 업무 순서</h2>
              <span className="muted small">탭 이름을 누르면 해당 화면으로 이동합니다</span>
            </div>
            <ol className="todo-steps">
              {g.steps.map((s, i) => (
                <li key={i}>
                  <span className="ts-no">{i + 1}</span>
                  <div>
                    <button className="tab-chip" onClick={() => onGo(tabFor(s.tab))}>{s.tab} →</button>
                    <p className="small">{s.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="card">
            <h2>상태 표시</h2>
            <ul className="legend-list">
              {LEGEND.map((l) => (
                <li key={l.label}><span className={`lg-dot ${l.tone}`} /><b>{l.label}</b><span className="muted small">{l.text}</span></li>
              ))}
            </ul>
            <ul className="stage-list">
              {Object.values(STAGE_PLAIN).map((t) => (
                <li key={t} className="small"><CheckCircle2 className="ico" />{t}</li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
