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
  postgres: "DB(Neon) 저장, 전 부서 공유",
  memory: "서버 메모리에 임시 저장(데모)",
  unavailable: "저장소에 연결하지 못했습니다",
};

export default function RulesPanel({ rules, summary, storeName }: Props) {
  const total = summary.total || 1;

  return (
    <div className="stack">
      <div>
        <h1 className="page-title">감사 기준</h1>
        <p className="muted">검토 대상 선정 기준과 KTAS 등급별 진료 목표입니다.</p>
      </div>

      <section className="card">
        <div className="card-head">
          <h2>KTAS 등급</h2>
          <span className="muted small">숫자가 작을수록 위급하며 진료 목표 시간이 짧습니다.</span>
        </div>
        <p className="small ktas-intro">
          내원 시 분류 간호사가 증상과 <b>활력징후</b>(혈압, 맥박, 호흡수, 산소포화도, 의식 수준)를 확인해 1~5등급으로 분류합니다.
          진료는 도착 순서가 아니라 등급 순으로 진행됩니다. 예시는 참고용이며 실제 분류는 의료진이 판단합니다.
        </p>
        <div className="table-wrap">
          <table className="table ktas-table">
            <thead>
              <tr>
                <th>등급</th><th>상태</th><th>예시</th><th>진료 목표</th><th>주 진료 구역</th><th className="num">건수</th>
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
        <p className="muted small">진료 목표 시간은 분류 완료부터 의사 첫 진료까지의 시간입니다. 목표 시간에서 5분을 넘기면 진료 지연으로 분류합니다.</p>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>감사 규칙</h2>
          <span className="muted small">빨간색은 필수 확인, 주황색은 주의 항목입니다.</span>
        </div>
        <div className="table-wrap">
          <table className="table rules-table">
            <thead><tr><th>항목</th><th>검토 이유</th><th>소명 부서</th><th>구분</th><th className="num">해당</th></tr></thead>
            <tbody>
              {Object.entries(rules).map(([code, r]) => {
                const p = RULE_PLAIN[code];
                return (
                  <tr key={code} className="no-click">
                    <td><b>{p?.plain ?? r.title}</b><div className="muted small">{r.title}</div></td>
                    <td className="small">{p?.why ?? r.basis}</td>
                    <td><span className={`pill dept-pill-sm dept-${p?.dept ?? "QI"}`}>{deptName(p?.dept)}</span></td>
                    <td><span className={`pill ${r.severity === "high" ? "pill-danger" : "pill-warn"}`}>{r.severity === "high" ? "필수" : "주의"}</span></td>
                    <td className="num strong">{summary.rule_counts[code] ?? 0}건</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>데이터 및 저장</h2>
        <ul className="plain">
          <li><b>데이터</b> {summary.hospital}, {summary.period}, 내원 {summary.total}건. 모두 <b>가상 데이터</b>이며 실제 환자 정보는 없습니다.</li>
          <li><b>결정 저장</b> {STORE_LABEL[storeName] ?? "확인 중"}</li>
          <li><b>근거 요약</b> 감사 항목을 요약하고 권장 조치를 표시합니다. 진단이나 치료 판단은 하지 않으며 판정은 QI팀이 합니다.</li>
          <li><b>참고</b> 기준값은 데모용입니다. 실제 적용 시 병원 지침과 응급의료기관 평가 기준을 따릅니다.</li>
        </ul>
      </section>
    </div>
  );
}
