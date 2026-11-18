// [기획 > 사용자 이해] 감사 기준 — KTAS 등급을 쉬운 말과 예시로, 감사 규칙을 '무엇이 문제인지 · 누가 설명하는지'로 풀어 씀
import type { Rule, Summary } from "../types";
import { deptName } from "../format";
import { KTAS_LEVELS, RULE_PLAIN } from "../guide";

interface Props {
  rules: Record<string, Rule>;
  summary: Summary;
  storeName: string;
}

const STORE_LABEL: Record<string, string> = {
  postgres: "DB(Neon)에 저장 — 모든 팀이 같은 기록을 봐요",
  memory: "서버 메모리에 임시 저장(데모)",
  unavailable: "저장소에 연결하지 못했어요",
};

export default function RulesPanel({ rules, summary, storeName }: Props) {
  const total = summary.total || 1;

  return (
    <div className="stack">
      <div>
        <h1 className="page-title">감사 기준</h1>
        <p className="muted">무엇을 기준으로 ‘다시 볼 기록’을 골라내는지 정리했어요.</p>
      </div>

      <section className="card">
        <div className="card-head">
          <h2>KTAS 등급 — 응급실이 환자 순서를 정하는 기준</h2>
          <span className="muted small">숫자가 작을수록 위급하고, 의사를 만나야 하는 목표 시간이 짧아요.</span>
        </div>
        <p className="small ktas-intro">
          응급실에 도착하면 간호사가 증상과 혈압·맥박·산소포화도 같은 <b>활력징후</b>를 보고 1~5등급 중 하나를 매겨요.
          먼저 온 순서가 아니라 <b>위급한 순서</b>로 진료하기 위해서예요. 아래 예시는 이해를 돕기 위한 것이고, 실제 분류는 의료진이 종합해 판단해요.
        </p>
        <div className="table-wrap">
          <table className="table ktas-table">
            <thead>
              <tr>
                <th>등급</th><th>쉬운 뜻</th><th>이런 경우 (예시)</th><th>의사 진료 목표</th><th>주로 가는 구역</th><th className="num">이번 데이터</th>
              </tr>
            </thead>
            <tbody>
              {KTAS_LEVELS.map((k) => {
                const n = summary.ktas_mix[String(k.level)] ?? 0;
                return (
                  <tr key={k.level} className="no-click">
                    <td><span className={`ktas-badge k${k.level}`}>KTAS {k.level} · {k.name}</span></td>
                    <td>{k.plain}</td>
                    <td className="muted">{k.examples}</td>
                    <td><b className={k.level <= 2 ? "text-danger" : ""}>{k.target}</b></td>
                    <td className="muted">{k.zone}</td>
                    <td className="num">
                      <b>{n}명</b>
                      <div className="ktas-share"><span style={{ width: `${(n / total) * 100}%` }} className={`k${k.level}`} /></div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="muted small">진료 목표 시간은 ‘분류가 끝난 뒤 의사를 처음 만날 때까지’예요. 이 시간을 넘기면 ‘진료 지연’으로 표시돼요(5분 여유).</p>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>감사 규칙 — 이런 기록을 ‘다시 볼 기록’으로 골라요</h2>
          <span className="muted small">빨강은 꼭 확인, 주황은 확인하면 좋은 기록이에요.</span>
        </div>
        <div className="table-wrap">
          <table className="table rules-table">
            <thead><tr><th>무엇이 문제인가</th><th>왜 보나요</th><th>설명할 팀</th><th>중요도</th><th className="num">해당</th></tr></thead>
            <tbody>
              {Object.entries(rules).map(([code, r]) => {
                const p = RULE_PLAIN[code];
                return (
                  <tr key={code} className="no-click">
                    <td><b>{p?.plain ?? r.title}</b><div className="muted small">{r.title}</div></td>
                    <td className="small">{p?.why ?? r.basis}</td>
                    <td><span className={`pill dept-pill-sm dept-${p?.dept ?? "QI"}`}>{deptName(p?.dept)}</span></td>
                    <td><span className={`pill ${r.severity === "high" ? "pill-danger" : "pill-warn"}`}>{r.severity === "high" ? "꼭 확인" : "주의"}</span></td>
                    <td className="num strong">{summary.rule_counts[code] ?? 0}건</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>데이터와 기록</h2>
        <ul className="plain">
          <li><b>데이터</b> {summary.hospital}, {summary.period}, 내원 {summary.total}건. 모두 <b>가상 데이터</b>이며 실제 환자 정보는 없어요.</li>
          <li><b>결정 저장</b> {STORE_LABEL[storeName] ?? "확인 중"}</li>
          <li><b>AI 역할</b> 문제를 요약해 제안만 해요. 진단·치료 판단은 하지 않고, 결정은 QI팀이 해요.</li>
          <li><b>주의</b> 기준값은 데모용 예시예요. 실제로 쓸 때는 병원 지침과 응급의료기관 평가 기준을 확인하세요.</li>
        </ul>
      </section>
    </div>
  );
}
