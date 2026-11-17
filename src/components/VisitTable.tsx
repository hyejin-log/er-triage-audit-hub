// [개발 > 프론트엔드] 전체 내원 목록 — 상태·구역 필터, 검색
import { useMemo, useState } from "react";
import { ApiError, downloadExport } from "../api";
import type { Review, Status, Visit } from "../types";
import { clock, deptName, duration, STAGE_LABEL, STATUS_LABEL } from "../format";

interface Props {
  visits: Visit[];
  reviews: Record<string, Review>;
  zones: string[];
  onOpen: (v: Visit) => void;
}

export default function VisitTable({ visits, reviews, zones, onOpen }: Props) {
  const [status, setStatus] = useState<"all" | Status>("all");
  const [zone, setZone] = useState("all");
  const [q, setQ] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return visits.filter(
      (v) =>
        (status === "all" || v.status === status) &&
        (zone === "all" || v.zone === zone) &&
        (!needle || v.visit_id.toLowerCase().includes(needle) || v.chief_complaint.includes(needle) || v.patient_ref.toLowerCase().includes(needle)),
    );
  }, [visits, status, zone, q]);

  return (
    <div className="stack">
      <div className="queue-head">
        <div>
          <h1 className="page-title">전체 내원</h1>
          <p className="muted">{rows.length}건 표시 · 행을 누르면 타임라인이 열립니다.</p>
          {exportError && <p className="text-danger small" role="alert">{exportError}</p>}
        </div>
        <button
          className="btn"
          disabled={exporting}
          onClick={async () => {
            setExporting(true);
            setExportError(null);
            try {
              await downloadExport();
            } catch (e) {
              setExportError(e instanceof ApiError ? e.message : "엑셀을 만들지 못했어요.");
            } finally {
              setExporting(false);
            }
          }}
        >
          {exporting ? "만드는 중…" : "엑셀로 내보내기"}
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
          <strong>조건에 맞는 내원이 없어요</strong>
          <button className="btn btn-sm" onClick={() => { setStatus("all"); setZone("all"); setQ(""); }}>필터 초기화</button>
        </div>
      ) : (
        <div className="table-wrap card">
          <table className="table">
            <thead>
              <tr>
                <th>내원번호</th><th>상태</th><th>내원</th><th>구역</th><th>KTAS</th><th>주호소</th>
                <th className="num">체류</th><th className="num">진료 대기</th><th>퇴실</th><th>진행</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => (
                <tr key={v.visit_id} onClick={() => onOpen(v)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onOpen(v)}>
                  <td className="mono">{v.visit_id}</td>
                  <td><span className={`dot dot-${v.status}`} />{STATUS_LABEL[v.status]}</td>
                  <td>{clock(v.times.arrival)}</td>
                  <td>{v.zone}</td>
                  <td>{v.ktas_initial === v.ktas_final ? v.ktas_final : <span className="text-danger">{v.ktas_initial}→{v.ktas_final}</span>}</td>
                  <td>{v.chief_complaint}</td>
                  <td className={`num ${v.metrics.los_min && v.metrics.los_min >= 1440 ? "text-danger strong" : ""}`}>{duration(v.metrics.los_min)}</td>
                  <td className="num">{duration(v.metrics.door_to_doc_min)}</td>
                  <td>{v.disposition}</td>
                  <td>
                    {(() => {
                      const r = reviews[v.visit_id];
                      if (!r) return v.flags.length ? <span className="muted">QI 판정 대기</span> : <span className="muted">-</span>;
                      if (r.stage === "closed") return <span className={`pill decision-${r.decision.replace(" ", "")}`}>{r.decision}</span>;
                      return <span className={`pill stage-${r.stage}`}>{deptName(r.assigned_dept)} · {STAGE_LABEL[r.stage]}</span>;
                    })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
