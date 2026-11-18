// [개발 > 프론트엔드] 팀별 홈 — 같은 데이터를 공유하지만 팀마다 보는 지표가 다릅니다.
//   응급간호팀: KTAS 분류 품질 / 응급의학과: 진료 대기·재내원 / 병상관리팀: 과밀화·병상 대기
import { useEffect, useState } from "react";
import { Activity, AlertOctagon, AlertTriangle } from "lucide-react";
import { api } from "../api";
import type { DeptCode, Review, Summary, TeamNote, User, Visit } from "../types";
import type { Tab } from "../App";
import { clock, deptName, duration, median, pct, stamp, STAGE_LABEL } from "../format";

interface Props {
  user: User;
  summary: Summary;
  visits: Visit[];
  reviews: Record<string, Review>;
  onOpen: (v: Visit) => void;
  onGo: (t: Tab) => void;
  onShowHospital: () => void;
}

export default function TeamHome(props: Props) {
  const { user, visits, reviews, onGo, onShowHospital } = props;
  const mine = visits.filter((v) => v.owner_dept === user.dept);
  const myReviews = Object.values(reviews).filter((r) => r.assigned_dept === user.dept);
  const waiting = myReviews.filter((r) => r.stage === "requested").length;

  return (
    <div className="stack">
      <section className={`hero card team-hero dept-${user.dept}`}>
        <div className="team-hero-top">
          <p className="eyebrow">{user.dept_name} 홈 · {props.summary.period}</p>
          <button className="link" onClick={onShowHospital}>병원 전체 현황 보기 →</button>
        </div>
        <h1>{HEADLINE[user.dept]}</h1>
        <p className="lead small">판정과 소명 기록은 전 부서가 공유합니다. 아래 지표와 팀 메모는 {user.dept_name} 기준입니다.</p>
        <div className="hero-actions">
          <button className={`btn ${waiting ? "btn-danger" : ""}`} onClick={() => onGo("explain")}>
            답변할 소명 {waiting}건 {waiting ? "처리하기 →" : "· 대기 없음"}
          </button>
          <button className="btn btn-ghost" onClick={() => onGo("all")}>전체 내원 보기 →</button>
        </div>
      </section>

      {user.dept === "NURSING" && <NursingBoard {...props} />}
      {user.dept === "EM" && <EmBoard {...props} />}
      {user.dept === "BED" && <BedBoard {...props} />}

      <div className="grid-2">
        <TeamSignals visits={mine} reviews={reviews} dept={user.dept} onOpen={props.onOpen} />
        <RecentNotes user={user} visits={visits} onOpen={props.onOpen} />
      </div>
    </div>
  );
}

const HEADLINE: Record<DeptCode, string> = {
  QI: "",
  NURSING: "중증도 분류 현황",
  EM: "진료 대기 현황",
  BED: "구역 혼잡도와 병상 배정 현황",
};

// ── 응급간호팀 ─────────────────────────────────────────────────────
function NursingBoard({ visits, onOpen }: Props) {
  const retriaged = visits.filter((v) => v.ktas_initial !== v.ktas_final);
  const down = retriaged.filter((v) => v.ktas_final > v.ktas_initial);
  const up = retriaged.filter((v) => v.ktas_final < v.ktas_initial);
  const noReason = down.filter((v) => !v.retriage_reason);
  const under = visits.filter((v) => v.flags.some((f) => f.code === "UNDERTRIAGE_VITALS"));
  const triageWait = median(
    visits.map((v) => (new Date(v.times.triage).getTime() - new Date(v.times.arrival).getTime()) / 60000),
  );

  const nurses = [...new Set(visits.map((v) => v.triage_nurse))].sort().map((n) => {
    const vs = visits.filter((v) => v.triage_nurse === n);
    return {
      name: n,
      total: vs.length,
      down: vs.filter((v) => v.ktas_final > v.ktas_initial).length,
      noReason: vs.filter((v) => v.ktas_final > v.ktas_initial && !v.retriage_reason).length,
      under: vs.filter((v) => v.flags.some((f) => f.code === "UNDERTRIAGE_VITALS")).length,
    };
  });

  const levels = [1, 2, 3, 4, 5];
  const initial = levels.map((k) => visits.filter((v) => v.ktas_initial === k).length);
  const final = levels.map((k) => visits.filter((v) => v.ktas_final === k).length);
  const maxN = Math.max(...initial, ...final, 1);

  return (
    <>
      <section className="kpis">
        <Kpi label="등급을 낮춘 건" value={down.length} unit="건" foot={`올린 건 ${up.length}, 등급을 바꾼 건 전체 ${retriaged.length}`} tone={down.length ? "warn" : undefined} />
        <Kpi label="낮춘 이유를 적은 비율" value={pct(down.length - noReason.length, down.length)} unit="%" foot={`이유 없이 낮춤 ${noReason.length}건`} tone={noReason.length ? "danger" : undefined} />
        <Kpi label="위험 수치인데 낮은 등급" value={under.length} unit="건" foot="혈압·산소 수치 등이 위험 범위" tone={under.length ? "danger" : undefined} />
        <Kpi label="도착 후 등급 분류까지" value={triageWait ?? 0} unit="분" foot={`보통(중간값), 전체 ${visits.length}건`} />
      </section>

      <div className="grid-2">
        <section className="card">
          <div className="card-head"><h2>분류 간호사별</h2><span className="muted">근거 없는 하향·과소분류가 있으면 빨간색</span></div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>간호사</th><th className="num">분류한 환자</th><th className="num">등급 낮춤</th><th className="num">이유 없음</th><th className="num">낮게 매김 의심</th></tr></thead>
              <tbody>
                {nurses.map((n) => (
                  <tr key={n.name} className="no-click">
                    <td className="mono">{n.name}</td>
                    <td className="num">{n.total}</td>
                    <td className="num">{n.down}</td>
                    <td className={`num ${n.noReason ? "text-danger strong" : ""}`}>{n.noReason}</td>
                    <td className={`num ${n.under ? "text-danger strong" : ""}`}>{n.under}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card">
          <div className="card-head"><h2>KTAS 최초 vs 최종</h2><span className="muted">재분류로 바뀐 분포</span></div>
          <ul className="pair-bars">
            {levels.map((k, i) => (
              <li key={k}>
                <span className={`ktas-tag ktas-${k}`}>KTAS {k}</span>
                <div className="pair">
                  <div className="pair-bar a" style={{ width: `${(initial[i] / maxN) * 100}%` }} title={`최초 ${initial[i]}건`} />
                  <div className="pair-bar b" style={{ width: `${(final[i] / maxN) * 100}%` }} title={`최종 ${final[i]}건`} />
                </div>
                <span className="small num">{initial[i]} → {final[i]}</span>
              </li>
            ))}
          </ul>
          <ul className="legend"><li><i className="sw-a" />최초 분류</li><li><i className="sw-b" />최종 분류</li></ul>
          {noReason.length > 0 && (
            <p className="callout">
              근거 없는 하향 재분류:{" "}
              {noReason.map((v, i) => (
                <span key={v.visit_id}>{i > 0 && ", "}<button className="link" onClick={() => onOpen(v)}>{v.visit_id}</button></span>
              ))}
            </p>
          )}
        </section>
      </div>
    </>
  );
}

// ── 응급의학과 ─────────────────────────────────────────────────────
function EmBoard({ visits }: Props) {
  const withWait = visits.filter((v) => v.metrics.door_to_doc_min != null && v.metrics.ktas_target_min != null);
  const met = (v: Visit) => (v.metrics.door_to_doc_min ?? 0) <= Math.max(v.metrics.ktas_target_min ?? 0, 1) + 5;
  const delayed = visits.filter((v) => v.flags.some((f) => f.code === "PHYSICIAN_DELAY"));
  const bounce = visits.filter((v) => v.flags.some((f) => f.code === "BOUNCE_BACK_72H"));
  const d2d = median(withWait.map((v) => v.metrics.door_to_doc_min!));

  const byKtas = [1, 2, 3, 4, 5].map((k) => {
    const vs = withWait.filter((v) => v.ktas_final === k);
    return { k, n: vs.length, target: vs[0]?.metrics.ktas_target_min ?? [0, 10, 30, 60, 120][k - 1], med: median(vs.map((v) => v.metrics.door_to_doc_min!)), rate: pct(vs.filter(met).length, vs.length) };
  });
  const docs = [...new Set(visits.map((v) => v.physician))].sort().map((d) => {
    const vs = withWait.filter((v) => v.physician === d);
    return { d, n: vs.length, med: median(vs.map((v) => v.metrics.door_to_doc_min!)), late: vs.filter((v) => !met(v)).length };
  });

  return (
    <>
      <section className="kpis">
        <Kpi label="제때 진료한 비율" value={pct(withWait.filter(met).length, withWait.length)} unit="%" foot={`${withWait.length}건 기준`} />
        <Kpi label="늦게 진료한 건" value={delayed.length} unit="건" foot="등급별 목표 시간을 넘김" tone={delayed.length ? "warn" : undefined} />
        <Kpi label="3일 안에 다시 온 환자" value={bounce.length} unit="건" foot="집에 간 뒤 더 위급해져 다시 옴" tone={bounce.length ? "danger" : undefined} />
        <Kpi label="분류 후 의사를 만나기까지" value={d2d ?? 0} unit="분" foot="보통(중간값), 전체 등급" />
      </section>
      <div className="grid-2">
        <section className="card">
          <div className="card-head"><h2>KTAS 등급별 진료 목표 달성</h2><span className="muted">목표 시간 + 5분 이내를 준수로 집계</span></div>
          <ul className="rate-list">
            {byKtas.map((r) => (
              <li key={r.k}>
                <span className={`ktas-tag ktas-${r.k}`}>KTAS {r.k}</span>
                <div className="rate-bar"><span style={{ width: `${r.rate}%` }} className={r.rate < 90 ? "is-low" : ""} /></div>
                <b className="num">{r.n ? `${r.rate}%` : "-"}</b>
                <span className="muted small">목표 {r.target ? `${r.target}분` : "즉시"} · 중앙 {r.med ?? "-"}분 · {r.n}건</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="card">
          <div className="card-head"><h2>담당의별 진료 대기</h2><span className="muted">목표 초과 건이 있으면 빨간색</span></div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>담당의</th><th className="num">진료한 환자</th><th className="num">보통 대기</th><th className="num">늦은 건</th></tr></thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.d} className="no-click">
                    <td className="mono">{d.d}</td>
                    <td className="num">{d.n}</td>
                    <td className="num">{d.med ?? "-"}분</td>
                    <td className={`num ${d.late ? "text-danger strong" : ""}`}>{d.late}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}

// ── 병상관리팀 ─────────────────────────────────────────────────────
function BedBoard({ summary, visits }: Props) {
  const admitted = visits.filter((v) => v.metrics.boarding_min != null);
  const boarding = admitted.map((v) => v.metrics.boarding_min!);
  const over6 = admitted.filter((v) => v.metrics.boarding_min! >= 360).length;
  const over24 = visits.filter((v) => (v.metrics.los_min ?? 0) >= 1440).length;
  const buckets = [
    { label: "2시간 미만", test: (m: number) => m < 120 },
    { label: "2~6시간", test: (m: number) => m >= 120 && m < 360 },
    { label: "6~12시간", test: (m: number) => m >= 360 && m < 720 },
    { label: "12시간 이상", test: (m: number) => m >= 720 },
  ].map((b) => ({ ...b, n: boarding.filter(b.test).length }));
  const maxB = Math.max(...buckets.map((b) => b.n), 1);
  const byType = ["일반병동 입원", "중환자실 입원"].map((t) => {
    const vs = admitted.filter((v) => v.disposition === t);
    return { t, n: vs.length, med: median(vs.map((v) => v.metrics.boarding_min!)) };
  });
  const scale = Math.max(150, ...summary.zones.map((z) => z.ratio));

  return (
    <>
      <section className="kpis">
        <Kpi label="입원이 정해진 환자" value={admitted.length} unit="건" foot={byType.map((b) => `${b.t.replace(" 입원", "")} ${b.n}`).join(" · ")} />
        <Kpi label="병실 배정까지 보통" value={duration(median(boarding))} foot="입원이 정해진 뒤 병실을 받기까지" small />
        <Kpi label="병실 배정 6시간 넘음" value={over6} unit="건" foot={`입원의 ${pct(over6, admitted.length)}%`} tone={over6 ? "warn" : undefined} />
        <Kpi label="응급실 24시간 넘게 머묾" value={over24} unit="건" foot="병원 평가에서 보는 항목" tone={over24 ? "danger" : undefined} />
      </section>
      <div className="grid-2">
        <section className="card">
          <div className="card-head"><h2>구역별 최대 재실 vs 병상</h2><span className="muted">한도 = 병상 수</span></div>
          <ul className="zone-list">
            {summary.zones.map((z) => (
              <li key={z.zone} className="zone">
                <div className="zone-top"><b>{z.zone}</b><span className={z.ratio > 100 ? "text-danger strong" : "muted"}>{z.ratio}%</span></div>
                <div className="bar" role="img" aria-label={`${z.zone} ${z.ratio}%`}>
                  <span className="bar-in" style={{ width: `${(Math.min(z.ratio, 100) / scale) * 100}%` }} />
                  {z.ratio > 100 && <span className="bar-over" style={{ width: `${((z.ratio - 100) / scale) * 100}%` }} />}
                  <span className="bar-limit" style={{ left: `${(100 / scale) * 100}%` }} />
                </div>
                <div className="zone-foot muted">병상 {z.beds} · 최대 {z.peak}명 ({clock(z.peak_at)}){z.over_minutes > 0 && <span className="text-danger"> · 초과 {duration(z.over_minutes)}</span>}</div>
              </li>
            ))}
          </ul>
        </section>
        <section className="card">
          <div className="card-head"><h2>입원 병상 대기 분포</h2><span className="muted">입원 결정→병상 배정</span></div>
          <ul className="los">
            {buckets.map((b, i) => (
              <li key={b.label} className={i >= 2 ? "is-danger" : ""}>
                <span>{b.label}</span>
                <div className="los-bar"><span style={{ width: `${(b.n / maxB) * 100}%` }} /></div>
                <b>{b.n}명</b>
              </li>
            ))}
          </ul>
          <h3 className="sub">입원 유형별 대기 중앙값</h3>
          <ul className="plain-rows">
            {byType.map((b) => (
              <li key={b.t}><span>{b.t}</span><b>{duration(b.med)}</b><span className="muted small">{b.n}건</span></li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}

// ── 공통 ─────────────────────────────────────────────────────────
function Kpi({ label, value, unit, foot, tone, small }: { label: string; value: number | string; unit?: string; foot: string; tone?: "warn" | "danger"; small?: boolean }) {
  return (
    <article className={`kpi ${tone ? `kpi-${tone}` : ""}`}>
      <span className={`kpi-icon ${tone ? `tone-${tone}` : ""}`} aria-hidden>
        {tone === "danger" ? <AlertOctagon /> : tone === "warn" ? <AlertTriangle /> : <Activity />}
      </span>
      <span className="kpi-label">{label}</span>
      <strong className={`kpi-value ${small ? "kpi-value-sm" : ""}`}>{value}{unit && <small>{unit}</small>}</strong>
      <span className="kpi-foot">{foot}</span>
    </article>
  );
}

function TeamSignals({ visits, reviews, dept, onOpen }: { visits: Visit[]; reviews: Record<string, Review>; dept: DeptCode; onOpen: (v: Visit) => void }) {
  return (
    <section className="card">
      <div className="card-head"><h2>{deptName(dept)} 담당 감사 신호</h2><span className="muted">{visits.length}건</span></div>
      {visits.length === 0 ? (
        <p className="muted">담당 감사 신호가 없습니다.</p>
      ) : (
        <ul className="signal-list">
          {visits.map((v) => {
            const r = reviews[v.visit_id];
            const label = !r ? "QI 판정 대기" : r.stage === "closed" ? `종결 · ${r.decision}` : STAGE_LABEL[r.stage];
            return (
              <li key={v.visit_id}>
                <button className="link" onClick={() => onOpen(v)}>{v.visit_id}</button>
                <span className="small">{v.flags[0]?.title}</span>
                <span className={`pill ${r ? `stage-${r.stage}` : "pill-muted"}`}>{label}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function RecentNotes({ user, visits, onOpen }: { user: User; visits: Visit[]; onOpen: (v: Visit) => void }) {
  const [notes, setNotes] = useState<TeamNote[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    api.notes().then(
      (r) => alive && setNotes(r.items),
      () => alive && setError("팀 메모를 불러오지 못했습니다."),
    );
    return () => { alive = false; };
  }, [user.dept]);
  const byId = new Map(visits.map((v) => [v.visit_id, v]));

  return (
    <section className="card">
      <div className="card-head"><h2>최근 팀 메모</h2><span className="muted">{user.dept_name} 전용</span></div>
      {error ? <p className="text-danger small">{error}</p> : notes === null ? (
        <p className="muted small" aria-busy="true">불러오는 중…</p>
      ) : notes.length === 0 ? (
        <p className="muted">등록된 팀 메모가 없습니다. 기록 상세 화면에서 작성할 수 있습니다.</p>
      ) : (
        <ul className="note-list">
          {notes.slice(0, 6).map((n) => (
            <li key={n.id}>
              <div className="note-meta">
                <button className="link" onClick={() => { const v = byId.get(n.visit_id); if (v) onOpen(v); }}>{n.visit_id}</button>
                <span className="muted small">{n.author} · {stamp(n.created_at)}</span>
              </div>
              <p>{n.body}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
