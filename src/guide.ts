// [기획 > 사용자 이해] 업무 안내 문구 모음 (감사 기준 탭, 업무 안내 탭, 부서 홈에서 사용)
// 의료 예시는 참고용이며 실제 분류는 의료진이 증상과 활력징후를 종합해 판단합니다.
import type { DeptCode, Stage } from "./types";

export interface KtasLevel {
  level: number;
  name: string;
  plain: string;
  examples: string;
  target: string;
  zone: string;
}

export const KTAS_LEVELS: KtasLevel[] = [
  { level: 1, name: "소생", plain: "즉각적인 처치가 필요한 상태", examples: "심정지, 호흡 정지, 의식 없음", target: "즉시", zone: "소생구역" },
  { level: 2, name: "긴급", plain: "빠르게 악화될 수 있는 상태", examples: "심한 흉통, 심한 호흡곤란, 뇌졸중 의심, 다량 출혈", target: "10분 이내", zone: "소생·중증구역" },
  { level: 3, name: "응급", plain: "신속한 진료가 필요하나 잠시 대기 가능", examples: "중등도 호흡곤란, 심한 복통, 고열·탈수", target: "30분 이내", zone: "중증·경증구역" },
  { level: 4, name: "준응급", plain: "1~2시간 내 진료가 필요한 상태", examples: "봉합이 필요한 열상, 골절 의심, 경미한 복통", target: "60분 이내", zone: "경증구역" },
  { level: 5, name: "비응급", plain: "응급성이 낮아 외래 진료로 충분한 경우가 많음", examples: "감기 증상, 가벼운 찰과상, 처방 문의", target: "120분 이내", zone: "경증구역" },
];

/** 감사 규칙 설명 — 항목, 검토 이유, 소명 부서 */
export const RULE_PLAIN: Record<string, { plain: string; why: string; dept: DeptCode }> = {
  LOS_OVER_24H: { plain: "응급실 체류 24시간 초과", why: "입원 병상을 배정받지 못해 응급실에서 대기한 경우가 많고, 응급의료기관 평가 지표에 해당합니다.", dept: "BED" },
  DOWNGRADE_NO_REASON: { plain: "근거 기록 없는 하향 재분류", why: "근거 없이 등급을 낮추면 위급한 환자의 진료 순서가 늦어질 수 있습니다.", dept: "NURSING" },
  UNDERTRIAGE_VITALS: { plain: "활력징후 대비 낮은 등급(과소분류)", why: "혈압·산소포화도 등이 위험 범위인데 낮은 등급으로 분류되면 진료가 지연됩니다.", dept: "NURSING" },
  BOUNCE_BACK_72H: { plain: "귀가 후 72시간 내 상위 등급 재내원", why: "첫 방문 시 귀가 판단과 퇴실 안내가 적절했는지 확인합니다.", dept: "EM" },
  PHYSICIAN_DELAY: { plain: "등급별 진료 목표 시간 초과", why: "등급이 높을수록 목표 시간이 짧습니다. 혼잡 등 지연 사유를 확인합니다.", dept: "EM" },
  BOARDING_OVER_6H: { plain: "입원 결정 후 병상 배정 6시간 초과", why: "응급실 병상을 장시간 차지해 다른 환자의 진료가 밀립니다.", dept: "BED" },
  DOWNGRADE_WITH_REASON: { plain: "2단계 이상 하향 재분류", why: "근거가 있더라도 하향 폭이 크면 재확인합니다.", dept: "NURSING" },
};

/** 처리 절차 — 단계별 담당과 상태 변화 */
export const FLOW_STEPS: { no: number; actor: "SYSTEM" | DeptCode | "TEAM"; actorName: string; title: string; body: string; stage: string }[] = [
  { no: 1, actor: "SYSTEM", actorName: "시스템", title: "기록 점검", body: "감사 규칙 7개로 전체 내원 기록을 점검하고 검토 대상을 표시합니다.", stage: "QI 판정 대기" },
  { no: 2, actor: "QI", actorName: "QI팀", title: "판정", body: "문제가 없으면 적정 확인, 분류 오류면 재분류 확정으로 종결합니다. 경위 확인이 필요하면 소명을 요청합니다.", stage: "종결 또는 소명 요청" },
  { no: 3, actor: "SYSTEM", actorName: "시스템", title: "담당 부서 배정", body: "감사 항목에 따라 응급간호팀, 응급의학과, 병상관리팀 중 한 곳에 배정됩니다.", stage: "소명 요청중" },
  { no: 4, actor: "TEAM", actorName: "담당 부서", title: "소명 제출", body: "당시 상황, 사유, 개선 계획을 작성해 제출합니다.", stage: "소명 제출(QI 확인 대기)" },
  { no: 5, actor: "QI", actorName: "QI팀", title: "최종 판정", body: "소명 내용을 검토해 적정 확인 또는 재분류 확정으로 종결합니다.", stage: "종결" },
];

/** 부서별 업무 순서 — 탭 이름 기준 */
export const DEPT_GUIDE: Record<DeptCode, { role: string; does: string; steps: { tab: string; text: string }[] }> = {
  QI: {
    role: "의료 질 향상 관리팀",
    does: "응급실 진료 기록이 기준에 맞는지 검토하고, 문제가 있는 건은 담당 부서에 소명을 요청한 뒤 최종 판정합니다.",
    steps: [
      { tab: "확인 필요", text: "빨간색 카드부터 검토합니다. ‘근거 요약’을 누르면 감사 항목이 정리되어 표시됩니다." },
      { tab: "확인 필요", text: "적정 확인, 재분류 확정, 소명 요청 중 하나를 선택해 기록합니다. 소명 요청과 재분류 확정은 메모가 필요합니다." },
      { tab: "소명 현황", text: "부서별 답변 대기 건을 확인합니다. 소명이 제출되면 ‘확인 필요’ 카드에 함께 표시됩니다." },
      { tab: "확인 필요", text: "제출된 소명을 검토해 최종 판정합니다." },
      { tab: "전체 내원", text: "건별 체크리스트를 확인하고 보고서(PDF)나 엑셀로 내보냅니다." },
    ],
  },
  NURSING: {
    role: "중증도 분류(KTAS) 담당",
    does: "내원 환자의 KTAS 등급을 분류합니다. 근거 없는 하향 재분류와 과소분류 건에 대해 소명합니다.",
    steps: [
      { tab: "응급간호팀 홈", text: "재분류 근거 기록률, 과소분류 건수, 간호사별 현황을 확인합니다." },
      { tab: "응급간호팀 소명", text: "QI팀의 소명 요청이 들어오면 건수가 표시됩니다. 요청 내용과 해당 기록을 확인합니다." },
      { tab: "응급간호팀 소명", text: "당시 상황, 사유, 개선 계획을 작성해 제출합니다. 이후 QI팀이 최종 판정합니다." },
      { tab: "전체 내원", text: "기록 상세 화면의 팀 메모는 응급간호팀만 볼 수 있습니다." },
    ],
  },
  EM: {
    role: "응급 진료 담당",
    does: "환자를 진료하고 입원·귀가를 결정합니다. 진료 지연과 72시간 내 재내원 건에 대해 소명합니다.",
    steps: [
      { tab: "응급의학과 홈", text: "등급별 진료 목표 준수율, 의사별 대기 시간, 재내원 건을 확인합니다." },
      { tab: "응급의학과 소명", text: "QI팀의 소명 요청이 들어오면 건수가 표시됩니다. 요청 내용과 시간 기록을 확인합니다." },
      { tab: "응급의학과 소명", text: "지연 사유(동시 진료 환자 수 등)와 개선 계획을 작성해 제출합니다." },
      { tab: "전체 내원", text: "기록 상세 화면의 팀 메모는 응급의학과만 볼 수 있습니다." },
    ],
  },
  BED: {
    role: "입원 병상 배정 담당",
    does: "입원이 결정된 환자에게 병상을 배정합니다. 병상 배정 지연과 24시간 초과 체류 건에 대해 소명합니다.",
    steps: [
      { tab: "병상관리팀 홈", text: "구역별 혼잡도와 입원 결정 후 병상 배정까지의 대기 시간을 확인합니다." },
      { tab: "병상관리팀 소명", text: "QI팀의 소명 요청이 들어오면 건수가 표시됩니다. 요청 내용과 대기 시간을 확인합니다." },
      { tab: "병상관리팀 소명", text: "당시 병상 현황과 개선 계획을 작성해 제출합니다." },
      { tab: "전체 내원", text: "기록 상세 화면의 팀 메모는 병상관리팀만 볼 수 있습니다." },
    ],
  },
};

/** 상태 표시 색 */
export const LEGEND: { tone: "bad" | "warn" | "ok" | "info"; label: string; text: string }[] = [
  { tone: "bad", label: "확인 필요", text: "필수 검토 항목" },
  { tone: "warn", label: "주의 관찰", text: "진료·병상 지연 항목" },
  { tone: "info", label: "소명 진행 중", text: "부서 답변 또는 QI 확인 대기" },
  { tone: "ok", label: "통과·종결", text: "문제 없음 또는 판정 완료" },
];

export const STAGE_PLAIN: Record<Stage | "none", string> = {
  none: "QI 판정 대기: 판정 전",
  requested: "소명 요청중: 담당 부서 답변 대기",
  answered: "소명 제출: QI 확인 대기",
  closed: "종결: 판정 완료",
};
