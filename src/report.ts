// [개발 > 보고] 내원 1건 감사 보고서 — 숨은 iframe 에 인쇄용 HTML 을 만들고 인쇄 창을 엽니다.
// 브라우저 인쇄 창에서 'PDF로 저장'을 고르면 PDF 가 됩니다. 실제 감사 결과만 담습니다.
import type { Review, Visit } from "./types";
import { clock, deptName, duration, stamp, STAGE_LABEL } from "./format";

export interface ReportCheck {
  label: string;
  state: "ok" | "warn" | "bad" | "na";
  value: string;
}

const STATE_TEXT = { ok: "적합", warn: "주의", bad: "부적합", na: "해당 없음" } as const;

/** 사용자가 쓴 메모·소명이 HTML 로 해석되지 않게 이스케이프합니다. */
function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildReportHtml(visit: Visit, review: Review | undefined, checks: ReportCheck[], hospital: string): string {
  const t = visit.times;
  const v = visit.vitals;
  const rows = (pairs: [string, string][]) => pairs.map(([k, val]) => `<tr><th>${esc(k)}</th><td>${esc(val)}</td></tr>`).join("");
  const stage = review ? `${STAGE_LABEL[review.stage]}${review.stage === "closed" ? ` · ${review.decision}` : ""}` : visit.flags.length ? "QI 판정 대기" : "감사 통과";

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>감사 보고서 ${esc(visit.visit_id)}</title>
<style>
  @page { size: A4; margin: 16mm; }
  body { font-family: "Pretendard Variable", Pretendard, "Malgun Gothic", sans-serif; color: #0f172a; font-size: 12px; line-height: 1.55; margin: 0; }
  header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 14px; }
  h1 { font-size: 18px; margin: 0; } h2 { font-size: 13px; margin: 18px 0 6px; padding-left: 6px; border-left: 3px solid #0ea5e9; }
  .muted { color: #64748b; } .brand { color: #dc2626; font-weight: 800; }
  table { width: 100%; border-collapse: collapse; } th, td { border: 1px solid #e2e8f0; padding: 5px 8px; text-align: left; vertical-align: top; }
  th { background: #f8fafc; width: 28%; font-weight: 600; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .s-ok { color: #047857; } .s-warn { color: #b45309; } .s-bad { color: #be123c; font-weight: 700; } .s-na { color: #64748b; }
  .flag { border: 1px solid #fecdd3; background: #fff1f2; border-radius: 6px; padding: 6px 8px; margin-bottom: 6px; }
  footer { margin-top: 24px; font-size: 10px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 6px; }
</style></head><body>
<header>
  <div><div class="brand">MediGuard ER</div><h1>응급실 감사 보고서 · ${esc(visit.visit_id)}</h1></div>
  <div class="muted">${esc(hospital)}<br>출력 ${esc(stamp(new Date().toISOString()))}</div>
</header>

<div class="grid">
  <table>${rows([
    ["환자 참조번호", visit.patient_ref],
    ["나이 · 성별", `${visit.age}세 · ${visit.sex === "M" ? "남" : "여"}`],
    ["주호소", visit.chief_complaint],
    ["내원 경로", visit.arrival_mode],
    ["구역", visit.zone],
  ])}</table>
  <table>${rows([
    ["KTAS", visit.ktas_initial === visit.ktas_final ? `${visit.ktas_final}` : `${visit.ktas_initial} → ${visit.ktas_final}`],
    ["재분류 근거", visit.retriage_reason ?? (visit.ktas_initial !== visit.ktas_final ? "기록 없음" : "-")],
    ["분류 간호사 · 담당의", `${visit.triage_nurse} · ${visit.physician}`],
    ["퇴실", visit.disposition],
    ["진행 상태", stage],
  ])}</table>
</div>

<h2>활력징후</h2>
<table><tr><th>혈압</th><td>${v.sbp}</td><th>맥박</th><td>${v.hr}</td><th>호흡</th><td>${v.rr}</td></tr>
<tr><th>SpO₂</th><td>${v.spo2}%</td><th>체온</th><td>${v.temp}</td><th>GCS</th><td>${v.gcs}</td></tr></table>

<h2>시간 기록</h2>
<table>${rows([
  ["내원", clock(t.arrival)],
  ["KTAS 분류", clock(t.triage)],
  ["의사 진료 시작", `${clock(t.physician_seen)} (분류 후 ${duration(visit.metrics.door_to_doc_min)})`],
  ["퇴실·입원 결정", clock(t.disposition_decision)],
  ["입원 병상 배정", t.bed_assigned ? `${clock(t.bed_assigned)} (결정 후 ${duration(visit.metrics.boarding_min)})` : "해당 없음"],
  ["응급실 퇴실", `${clock(t.departure)} (총 체류 ${duration(visit.metrics.los_min)})`],
])}</table>

<h2>감사 검증 체크리스트</h2>
<table><tr><th>항목</th><th>결과</th><th>판정</th></tr>
${checks.map((c) => `<tr><td>${esc(c.label)}</td><td>${esc(c.value)}</td><td class="s-${c.state}">${STATE_TEXT[c.state]}</td></tr>`).join("")}
</table>

<h2>감사 신호</h2>
${visit.flags.length ? visit.flags.map((f) => `<div class="flag"><b>${esc(f.title)}</b> — ${esc(f.detail)}<div class="muted">${esc(f.basis)}</div></div>`).join("") : `<p class="muted">감사 규칙에 걸린 항목이 없습니다.</p>`}

<h2>QI 결정 · 부서 소명</h2>
${review ? `<table>${rows([
  ["QI 결정", `${review.decision} · ${review.reviewer} · ${stamp(review.decided_at)}`],
  ["QI 메모", review.note || "-"],
  ["소명 담당 부서", review.assigned_dept ? deptName(review.assigned_dept) : "-"],
  ["부서 소명", review.response ? `${review.response} (${review.responder ?? ""} · ${stamp(review.responded_at)})` : review.assigned_dept ? "답변 대기" : "-"],
])}</table>` : `<p class="muted">아직 QI 결정이 없습니다.</p>`}

<footer>가상 데이터로 만든 데모 보고서입니다. 실제 환자 정보는 포함되어 있지 않습니다. 팀 내부 메모는 보고서에 넣지 않습니다.</footer>
</body></html>`;
}

/** 숨은 iframe 으로 인쇄 창을 엽니다(팝업 차단 영향 없음). */
export function printReport(html: string): void {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  Object.assign(frame.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0" });
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (!doc || !win) {
    frame.remove();
    throw new Error("보고서 창을 만들지 못했어요.");
  }
  doc.open();
  doc.write(html);
  doc.close();
  const cleanup = () => setTimeout(() => frame.remove(), 1000);
  win.addEventListener("afterprint", cleanup);
  setTimeout(() => {
    win.focus();
    win.print();
    setTimeout(() => frame.isConnected && frame.remove(), 60000);
  }, 250);
}
