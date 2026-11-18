// [기획 > 사용자 이해] 부서 홈 상단 카드: 부서 역할, 처리할 건수, 업무 안내 바로가기
import { BookOpen } from "lucide-react";
import type { Tab } from "../App";
import type { User } from "../types";
import { DEPT_GUIDE } from "../guide";
import { josa } from "../format";

interface Props {
  user: User;
  todo: number;
  todoLabel: string;
  todoTab: Tab;
  onGo: (t: Tab) => void;
}

export default function RoleStrip({ user, todo, todoLabel, todoTab, onGo }: Props) {
  const g = DEPT_GUIDE[user.dept];
  return (
    <section className={`role-strip dept-${user.dept}`} aria-label={`${josa(user.dept_name, "이", "가")} 하는 일`}>
      <div className="rs-text">
        <b>{user.dept_name} <span className="rs-role">{g.role}</span></b>
        <span className="small muted">{g.does}</span>
      </div>
      <div className="rs-actions">
        <button className={`btn btn-sm ${todo ? "btn-primary" : ""}`} onClick={() => onGo(todoTab)}>
          {todoLabel} {todo}건 {todo ? "→" : "· 없음"}
        </button>
        <button className="btn btn-sm btn-ghost" onClick={() => onGo("guide")}>
          <BookOpen className="ico" />&nbsp;업무 안내
        </button>
      </div>
    </section>
  );
}
