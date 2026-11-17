// [개발 > 프론트엔드] 감사 기준(근거 자료) — 규칙, KTAS 목표 시간, 데이터 출처
import type { Rule, Summary } from "../types";

interface Props {
  rules: Record<string, Rule>;
  summary: Summary;
  storeName: string;
}

const KTAS_TARGETS = [
  { level: 1, name: "소생", target: "즉시" },
  { level: 2, name: "긴급", target: "10분 이내" },
  { level: 3, name: "응급", target: "30분 이내" },
  { level: 4, name: "준응급", target: "60분 이내" },
  { level: 5, name: "비응급", target: "120분 이내" },
];

const STORE_LABEL: Record<string, string> = {
  postgres: "Postgres(Neon)에 저장",
  memory: "서버 메모리 + 브라우저에 저장 (데모)",
  browser: "이 브라우저에만 저장",
};

export default function RulesPanel({ rules, summary, storeName }: Props) {
  return (
    <div className="stack">
      <h1 className="page-title">감사 기준</h1>
      <section className="card">
        <h2>감사 규칙</h2>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>규칙</th><th>등급</th><th>근거</th><th className="num">해당</th></tr></thead>
            <tbody>
              {Object.entries(rules).map(([code, r]) => (
                <tr key={code}>
                  <td><b>{r.title}</b><div className="mono small muted">{code}</div></td>
                  <td><span className={`pill ${r.severity === "high" ? "pill-danger" : "pill-warn"}`}>{r.severity === "high" ? "확인 필요" : "주의"}</span></td>
                  <td>{r.basis}</td>
                  <td className="num strong">{summary.rule_counts[code] ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid-2">
        <section className="card">
          <h2>KTAS 등급별 진료 목표</h2>
          <ul className="ktas-targets">
            {KTAS_TARGETS.map((k) => (
              <li key={k.level}>
                <span className={`ktas-chip ktas-${k.level}`}><span>KTAS {k.level}</span></span>
                <b>{k.name}</b>
                <span className="muted">{k.target}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="card">
          <h2>데이터와 결정 기록</h2>
          <ul className="plain">
            <li><b>데이터</b> {summary.hospital}, {summary.period}, 내원 {summary.total}건. 모두 <b>가상 데이터</b>이며 실제 환자 정보가 없습니다.</li>
            <li><b>결정 저장</b> {STORE_LABEL[storeName] ?? "확인 중"}</li>
            <li><b>AI 역할</b> 감사 근거를 정리해 제안만 합니다. 진단·치료 판단은 하지 않으며, 결정은 담당자가 합니다.</li>
            <li><b>주의</b> 감사 기준값은 데모용 예시입니다. 실제 적용 시 기관 지침과 평가 기준을 확인하세요.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
