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
  { level: 1, name: "소생", plain: "바로 처치하지 않으면 생명이 위험한 상태", examples: "심장이나 숨이 멈춤, 의식이 없음", target: "즉시", zone: "소생구역" },
  { level: 2, name: "긴급", plain: "몇 분 안에 나빠질 수 있는 상태", examples: "심한 가슴 통증, 숨쉬기 매우 힘듦, 뇌졸중 의심, 많은 출혈", target: "10분 이내", zone: "소생·중증구역" },
  { level: 3, name: "응급", plain: "서둘러야 하지만 잠깐은 기다릴 수 있는 상태", examples: "숨이 조금 참, 심한 배 통증, 고열과 탈수", target: "30분 이내", zone: "중증·경증구역" },
  { level: 4, name: "준응급", plain: "1~2시간 안에 보면 되는 상태", examples: "꿰매야 하는 상처, 뼈가 부러진 것 같음, 가벼운 배 통증", target: "60분 이내", zone: "경증구역" },
  { level: 5, name: "비응급", plain: "급하지 않아 일반 외래로도 충분한 경우가 많음", examples: "감기 증상, 가볍게 긁힌 상처, 약 처방 문의", target: "120분 이내", zone: "경증구역" },
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
  { no: 1, actor: "SYSTEM", actorName: "시스템", title: "기록 자동 점검", body: "점검 기준 7가지로 모든 환자 기록을 살펴보고, 다시 볼 기록에 표시를 합니다.", stage: "QI 판정 대기" },
  { no: 2, actor: "QI", actorName: "QI팀", title: "판정", body: "문제가 없으면 ‘적정 확인’, 등급이 잘못됐으면 ‘재분류 확정’으로 끝냅니다. 사정을 들어야 하면 담당 부서에 경위(소명)를 묻습니다.", stage: "종결 또는 소명 요청" },
  { no: 3, actor: "SYSTEM", actorName: "시스템", title: "담당 부서로 전달", body: "문제 종류에 따라 응급간호팀, 응급의학과, 병상관리팀 중 맡은 부서로 넘어갑니다.", stage: "소명 요청중" },
  { no: 4, actor: "TEAM", actorName: "담당 부서", title: "부서 설명 제출", body: "그때 상황, 그렇게 한 이유, 앞으로 고칠 점을 적어 냅니다.", stage: "설명 제출(QI 확인 대기)" },
  { no: 5, actor: "QI", actorName: "QI팀", title: "최종 판정", body: "부서가 적어 낸 설명을 읽고 ‘적정 확인’ 또는 ‘재분류 확정’으로 끝냅니다.", stage: "종결" },
];

/** 부서별 업무 순서 — 탭 이름 기준 */
export const DEPT_GUIDE: Record<DeptCode, { role: string; does: string; steps: { tab: string; text: string }[] }> = {
  QI: {
    role: "의료 질 향상 관리팀",
    does: "응급실 진료가 기준대로 이뤄졌는지 기록을 살펴봅니다. 문제가 있으면 담당 부서에 경위를 묻고, 설명을 들은 뒤 최종 결론을 냅니다.",
    steps: [
      { tab: "확인 필요", text: "빨간색 카드부터 봅니다. ‘근거 요약’을 누르면 무엇이 문제인지 짧게 정리해 보여 줍니다." },
      { tab: "확인 필요", text: "문제 없음(적정 확인), 등급이 잘못됨(재분류 확정), 부서에 경위 질문(소명 요청) 중 하나를 고릅니다. 메모 칸에는 예시 문장이 미리 들어 있습니다." },
      { tab: "소명 현황", text: "어느 부서가 답을 기다리고 있는지 봅니다. 부서가 설명을 내면 ‘확인 필요’ 카드에 함께 나옵니다." },
      { tab: "확인 필요", text: "부서 설명을 읽고 최종 결론을 냅니다." },
      { tab: "전체 내원", text: "환자별 점검 결과를 보고, 보고서(PDF)나 엑셀로 내려받습니다." },
    ],
  },
  NURSING: {
    role: "환자 위급도 등급(KTAS) 담당",
    does: "응급실에 온 환자의 위급도 등급을 매깁니다. 이유 없이 등급을 낮췄거나 너무 낮게 매긴 기록에 대해 경위를 설명합니다.",
    steps: [
      { tab: "응급간호팀 홈", text: "등급을 낮출 때 이유를 적은 비율, 너무 낮게 매긴 사례, 간호사별 현황을 봅니다." },
      { tab: "응급간호팀 소명", text: "QI팀의 소명 요청이 들어오면 건수가 표시됩니다. 요청 내용과 해당 기록을 확인합니다." },
      { tab: "응급간호팀 소명", text: "그때 상황, 이유, 고칠 점을 적어 제출합니다. 예시 문장이 미리 들어 있습니다. 이후 QI팀이 결론을 냅니다." },
      { tab: "전체 내원", text: "기록 상세 화면의 팀 메모는 응급간호팀만 볼 수 있습니다." },
    ],
  },
  EM: {
    role: "응급 진료 담당",
    does: "환자를 진료하고 입원할지 집에 갈지 정합니다. 늦게 진료한 기록과, 집에 간 뒤 3일 안에 다시 온 환자에 대해 경위를 설명합니다.",
    steps: [
      { tab: "응급의학과 홈", text: "제때 진료한 비율, 의사별 대기 시간, 3일 안에 다시 온 환자를 봅니다." },
      { tab: "응급의학과 소명", text: "QI팀의 소명 요청이 들어오면 건수가 표시됩니다. 요청 내용과 시간 기록을 확인합니다." },
      { tab: "응급의학과 소명", text: "늦어진 이유(같은 시간에 본 환자 수 등)와 고칠 점을 적어 제출합니다. 예시 문장이 미리 들어 있습니다." },
      { tab: "전체 내원", text: "기록 상세 화면의 팀 메모는 응급의학과만 볼 수 있습니다." },
    ],
  },
  BED: {
    role: "입원 병상 배정 담당",
    does: "입원이 정해진 환자에게 병실을 배정합니다. 병실 배정이 늦었거나 응급실에 하루 넘게 머문 기록에 대해 경위를 설명합니다.",
    steps: [
      { tab: "병상관리팀 홈", text: "구역이 얼마나 붐볐는지, 입원이 정해진 뒤 병실을 받기까지 얼마나 걸렸는지 봅니다." },
      { tab: "병상관리팀 소명", text: "QI팀의 소명 요청이 들어오면 건수가 표시됩니다. 요청 내용과 대기 시간을 확인합니다." },
      { tab: "병상관리팀 소명", text: "그때 병실 상황과 고칠 점을 적어 제출합니다. 예시 문장이 미리 들어 있습니다." },
      { tab: "전체 내원", text: "기록 상세 화면의 팀 메모는 병상관리팀만 볼 수 있습니다." },
    ],
  },
};

/** 상태 표시 색 */
export const LEGEND: { tone: "bad" | "warn" | "ok" | "info"; label: string; text: string }[] = [
  { tone: "bad", label: "확인 필요", text: "꼭 다시 볼 기록" },
  { tone: "warn", label: "주의 관찰", text: "진료나 병실 배정이 늦은 기록" },
  { tone: "info", label: "설명 진행 중", text: "부서 답변이나 QI 확인을 기다리는 중" },
  { tone: "ok", label: "통과·종결", text: "문제가 없거나 결론이 난 기록" },
];

export const STAGE_PLAIN: Record<Stage | "none", string> = {
  none: "QI 판정 대기: 아직 아무도 결론을 내지 않음",
  requested: "소명 요청중: 담당 부서가 설명을 써야 함",
  answered: "소명 제출: QI팀이 읽고 결론을 내야 함",
  closed: "종결: 결론이 남",
};
