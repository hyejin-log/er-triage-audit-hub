// [개발 > 프론트엔드] 전체 내원 — 목록 + AI 감사 인스펙터 (Control Tower 레이아웃)
// 체크리스트는 감사 규칙 엔진의 실제 결과로만 채웁니다.
import { useMemo, useRef, useState } from "react";
import {
  AlertCircle, AlertTriangle, CheckCircle2, Cpu, FileSpreadsheet, FileText, History, MinusCircle, RefreshCw, XCircle,
} from "lucide-react";
import { api, ApiError, downloadExport } from "../api";
import type { Rationale, Review, Status, Visit } from "../types";
import { clock, deptName, duration, STAGE_LABEL } from "../format";
import { buildReportHtml, printReport } from "../report";

interface Props {
  visits: Visit[];
  reviews: Record<string, Review>;
  zones: string[];
  hospital: string;
  onOpen: (v: Visit) => void;
}

const KTAS_NAME = ["", "소생", "긴급", "응급", "준응급", "비응급"];

export default function VisitTable({ visits, reviews, zones, hospital, onOpen }: Props) {
  const [status, setStatus] = useState<"all" | Status>("all");
  const [zone, setZone] = useState("all");
  const [ktas, setKtas] = useState("all");
  const [q, setQ] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const inspectorRef = useRef<HTMLElement>(null);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return visits.filter(
      (v) =>
        (status === "all" || v.status === status) &&
        (zone === "all" || v.zone === zone) &&
        (ktas === "all" || String(v.ktas_final) === ktas) &&
        (!needle || v.visit_id.toLowerCase().includes(needle) || v.chief_complaint.includes(needle) || v.patient_ref.toLowerCase().includes(needle)),
    );
  }, [visits, status, zone, ktas, q]);

  // 처음에는 첫 번째 감사 신호 건을 보여 줍니다.
  const selected = rows.find((v) => v.visit_id === selectedId) ?? rows.find((v) => v.flags.length) ?? rows[0] ?? null;

  const pick = (v: Visit) => {
    setSelectedId(v.visit_id);
    if (window.matchMedia("(max-width: 1000px)").matches) inspectorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const exportXlsx = async () => {
    setExporting(true);
    setExportError(null);
    try {
      await downloadExport();
    } catch (e) {
      setExportError(e instanceof ApiError ? e.message : "엑셀을 만들지 못했습니다.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="stack">
      <div className="queue-head">
        <div>
          <h1 className="page-title">전체 내원</h1>
          <p className="muted">{rows.length}건 표시 · 행을 선택하면 오른쪽에 점검 결과가 표시됩니다.</p>
          {exportError && <p className="text-danger small" role="alert">{exportError}</p>}
        </div>
        <button className="btn" disabled={exporting} onClick={exportXlsx}>
          <FileSpreadsheet className="ico" />&nbsp;{exporting ? "만드는 중…" : "엑셀로 내보내기"}
        </button>
      </div>

      <div className="filters card">
        <label className="field">
          <span>상태</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as "all" | Status)}>
            <option value="all">전체</option>
            <option value="high">확인 필요</option>
            <option value="medium">주의 관찰</option>
            <option value="normal">정상</option>
          </select>
        </label>
        <label className="field">
          <span>KTAS</span>
          <select value={ktas} onChange={(e) => setKtas(e.target.value)}>
            <option value="all">전체 등급</option>
            {[1, 2, 3, 4, 5].map((k) => <option key={k} value={k}>KTAS {k} ({KTAS_NAME[k]})</option>)}
          </select>
        </label>
        <label className="field">
          <span>구역</span>
          <select value={zone} onChange={(e) => setZone(e.target.value)}>
            <option value="all">전체</option>
            {zones.map((z) => <option key={z} value={z}>{z}</option>)}
          </select>
        </label>
        <label className="field grow">
          <span>검색</span>
          <input value={q} maxLength={50} onChange={(e) => setQ(e.target.value)} placeholder="내원번호, 환자참조번호, 주호소" />
        </label>
      </div>

      {rows.length === 0 ? (
        <div className="empty card">
          <strong>조건에 맞는 내원이 없습니다</strong>
          <button className="btn btn-sm" onClick={() => { setStatus("all"); setZone("all"); setKtas("all"); setQ(""); }}>필터 초기화</button>
        </div>
      ) : (
        <div className="master-detail">
          <div className="table-wrap card master">
            <table className="table">
              <thead>
                <tr><th>내원번호 / 환자</th><th>KTAS 중증도</th><th>내원 시각</th><th>담당의 / 구역</th><th>감사 판정</th></tr>
              </thead>
              <tbody>
                {rows.map((v) => (
                  <tr
                    key={v.visit_id}
                    className={selected?.visit_id === v.visit_id ? "is-selected" : v.status === "high" ? "is-flagged" : ""}
                    onClick={() => pick(v)}
                    tabIndex={0}
                    aria-selected={selected?.visit_id === v.visit_id}
                    onKeyDown={(e) => e.key === "Enter" && pick(v)}
                  >
                    <td><b className="mono">{v.visit_id}</b><div className="muted small">{v.patient_ref} · {v.age}세 {v.sex === "M" ? "남" : "여"}</div></td>
                    <td>
                      <span className={`ktas-badge k${v.ktas_final}`}>KTAS {v.ktas_final} ({KTAS_NAME[v.ktas_final]})</span>
                      {v.ktas_initial !== v.ktas_final && <div className="small text-danger">최초 {v.ktas_initial} → 최종 {v.ktas_final}</div>}
                    </td>
                    <td className="mono">{clock(v.times.arrival)}</td>
                    <td>{v.physician}<div className="muted small">{v.zone}</div></td>
                    <td><Verdict visit={v} review={reviews[v.visit_id]} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <aside className="card inspector" ref={inspectorRef} aria-label="감사 검토">
            {selected && <Inspector key={selected.visit_id} visit={selected} review={reviews[selected.visit_id]} hospital={hospital} onOpen={onOpen} />}
          </aside>
        </div>
      )}
    </div>
  );
}

function Verdict({ visit, review }: { visit: Visit; review?: Review }) {
  if (review?.stage === "closed") return <span className="verdict ok"><CheckCircle2 className="ico" />종결 · {review.decision}</span>;
  if (review) return <span className="verdict info"><History className="ico" />{deptName(review.assigned_dept)} {STAGE_LABEL[review.stage]}</span>;
  if (visit.status === "high") return <span className="verdict bad"><AlertCircle className="ico" />확인 필요</span>;
  if (visit.status === "medium") return <span className="verdict warn"><AlertTriangle className="ico" />주의 관찰</span>;
  return <span className="verdict ok"><CheckCircle2 className="ico" />감사 통과</span>;
}

type Check = { label: string; state: "ok" | "warn" | "bad" | "na"; value: string };

function checklist(v: Visit): Check[] {
  const has = (code: string) => v.flags.some((f) => f.code === code);
  const m = v.metrics;
  const target = m.ktas_target_min ?? 0;
  return [
    {
      label: "중증도 분류 적정성",
      state: has("UNDERTRIAGE_VITALS") ? "bad" : "ok",
      value: has("UNDERTRIAGE_VITALS") ? "과소분류 의심" : "활력징후와 일치",
    },
    {
      label: "재분류 근거 기록",
      state: v.ktas_initial === v.ktas_final ? "na" : v.ktas_final > v.ktas_initial && !v.retriage_reason ? "bad" : "ok",
      value: v.ktas_initial === v.ktas_final ? "재분류 없음" : v.retriage_reason ? "기록됨" : v.ktas_final > v.ktas_initial ? "근거 없음" : "상향 재분류",
    },
    {
      label: "진료 목표 시간",
      state: has("PHYSICIAN_DELAY") ? "warn" : "ok",
      value: `${has("PHYSICIAN_DELAY") ? "초과" : "통과"} (${duration(m.door_to_doc_min)} / 목표 ${target ? `${target}분` : "즉시"})`,
    },
    {
      label: "응급실 체류 24시간",
      state: has("LOS_OVER_24H") ? "bad" : "ok",
      value: duration(m.los_min),
    },
    {
      label: "입원 병상 배정 대기",
      state: m.boarding_min == null ? "na" : has("BOARDING_OVER_6H") || m.boarding_min >= 360 ? "warn" : "ok",
      value: m.boarding_min == null ? "해당 없음" : duration(m.boarding_min),
    },
    {
      label: "72시간 내 재내원",
      state: has("BOUNCE_BACK_72H") ? "bad" : "ok",
      value: has("BOUNCE_BACK_72H") ? "등급 상향 재내원" : "없음",
    },
  ];
}

const CHECK_ICON = { ok: CheckCircle2, warn: AlertTriangle, bad: XCircle, na: MinusCircle };

function Inspector({ visit, review, hospital, onOpen }: { visit: Visit; review?: Review; hospital: string; onOpen: (v: Visit) => void }) {
  const [ai, setAi] = useState<Rationale | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const checks = checklist(visit);

  const runAi = async () => {
    setLoading(true);
    setError(null);
    try {
      setAi(await api.aiReview(visit.visit_id));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "AI 검증을 실행하지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="inspector-body">
      <div className="inspector-head">
        <h2><Cpu className="ico accent" /> 감사 검토</h2>
        <span className="id-chip mono">{visit.visit_id}</span>
      </div>

      <div className="inspector-patient">
        <span className="eyebrow-sm">선택한 내원</span>
        <b>{visit.age}세 {visit.sex === "M" ? "남" : "여"} · {visit.chief_complaint} — KTAS {visit.ktas_final}</b>
        <p className="small muted">
          {visit.arrival_mode} · {visit.zone} · {visit.disposition}
          {visit.flags.length ? ` · 감사 신호 ${visit.flags.length}건 (${visit.flags.map((f) => f.title).join(", ")})` : " · 감사 규칙에 걸린 항목 없음"}
        </p>
      </div>

      <div>
        <span className="eyebrow-sm">점검 항목</span>
        <ul className="checks">
          {checks.map((c) => {
            const Icon = CHECK_ICON[c.state];
            return (
              <li key={c.label} className={`check ${c.state}`}>
                <span><Icon className="ico" />{c.label}</span>
                <b>{c.value}</b>
              </li>
            );
          })}
        </ul>
      </div>

      <div>
        <span className="eyebrow-sm">근거 요약</span>
        {loading ? (
          <p className="muted small" aria-busy="true">불러오는 중…</p>
        ) : ai ? (
          <div className="ai-mini">
            <div className="ai-meta">
              <span className="pill pill-muted">{ai.source === "claude" ? "AI 요약" : "규칙 요약"}</span>
              <span className="small">권장 조치: <b>{ai.suggested_action}</b></span>
            </div>
            <p className="small">{ai.summary}</p>
          </div>
        ) : (
          <button className="btn btn-sm" onClick={runAi}>근거 요약</button>
        )}
        {error && <p className="text-danger small" role="alert">{error}</p>}
      </div>

      <div className="inspector-status small">
        <span className="muted">진행</span>
        <Verdict visit={visit} review={review} />
      </div>

      <div className="inspector-actions">
        <button
          className="btn btn-primary btn-block"
          onClick={() => {
            try {
              printReport(buildReportHtml(visit, review, checks, hospital));
            } catch {
              setError("보고서를 만들지 못했습니다. 브라우저 인쇄가 막혀 있는지 확인해 주세요.");
            }
          }}
        >
          <FileText className="ico" />&nbsp;상세 감사 보고서(PDF) 내보내기
        </button>
        <button className="btn btn-block" onClick={() => onOpen(visit)}>
          <History className="ico" />&nbsp;타임라인 · 팀 메모 열기
        </button>
        <button className="btn btn-block" onClick={runAi} disabled={loading}>
          <RefreshCw className="ico" />&nbsp;{ai ? "다시 요약" : "근거 요약"}
        </button>
      </div>
    </div>
  );
}
