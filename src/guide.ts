// [기획 > 사용자 이해] 처음 쓰는 사람을 위한 설명 모음 — 감사 기준 탭, 사용 안내 탭, 팀 홈 설명 카드가 함께 씁니다.
// 의료 내용은 이해를 돕는 일반적인 예시이며, 실제 분류는 의료진이 증상·활력징후를 종합해 판단합니다.
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
  { level: 1, name: "소생", plain: "지금 바로 처치하지 않으면 생명이 위험해요", examples: "심장·호흡이 멈춤, 의식이 없음", target: "즉시", zone: "소생구역" },
  { level: 2, name: "긴급", plain: "몇 분 안에 악화될 수 있어 아주 빨리 봐야 해요", examples: "심한 가슴 통증, 숨이 매우 참, 뇌졸중 의심, 많은 출혈", target: "10분 이내", zone: "소생·중증구역" },
  { level: 3, name: "응급", plain: "위험할 수 있어 서둘러 봐야 하지만 잠시 기다릴 수 있어요", examples: "숨참(중간 정도), 심한 복통, 고열과 탈수", target: "30분 이내", zone: "중증·경증구역" },
  { level: 4, name: "준응급", plain: "1~2시간 안에 진료하면 되는 상태예요", examples: "꿰매야 하는 상처, 골절 의심, 가벼운 복통", target: "60분 이내", zone: "경증구역" },
  { level: 5, name: "비응급", plain: "급하지 않아 외래 진료로도 충분한 경우가 많아요", examples: "감기 증상, 가벼운 찰과상, 약 처방 문의", target: "120분 이내", zone: "경증구역" },
];

/** 감사 규칙을 쉬운 말로 — 무엇이 문제인지, 누가 설명하는지 */
export const RULE_PLAIN: Record<string, { plain: string; why: string; dept: DeptCode }> = {
  LOS_OVER_24H: { plain: "응급실에 하루(24시간) 넘게 머문 환자", why: "입원 병실을 못 구해 응급실에서 기다린 경우가 많고, 응급실 평가 기준에 걸려요.", dept: "BED" },
  DOWNGRADE_NO_REASON: { plain: "처음보다 덜 위급하게 다시 분류했는데 이유를 안 적음", why: "근거 없이 등급을 낮추면 위급한 환자가 뒤로 밀릴 수 있어요.", dept: "NURSING" },
  UNDERTRIAGE_VITALS: { plain: "혈압·산소포화도 등이 위험한데 등급을 낮게 매김", why: "위급한 환자를 덜 위급하게 분류하면 진료가 늦어져요(과소분류).", dept: "NURSING" },
  BOUNCE_BACK_72H: { plain: "집에 보낸 환자가 3일 안에 더 위급해져 다시 옴", why: "첫 방문 때 판단이나 퇴원 설명이 충분했는지 돌아봐야 해요.", dept: "EM" },
  PHYSICIAN_DELAY: { plain: "등급별 목표 시간보다 늦게 의사를 만남", why: "위급할수록 목표 시간이 짧아요. 늦어진 이유(붐빔 등)를 확인해요.", dept: "EM" },
  BOARDING_OVER_6H: { plain: "입원이 결정됐는데 병실 배정까지 6시간 넘게 걸림", why: "응급실 자리를 오래 차지해 다른 환자 진료까지 밀려요.", dept: "BED" },
  DOWNGRADE_WITH_REASON: { plain: "이유는 적었지만 등급을 2단계 이상 크게 낮춤", why: "근거가 있어도 큰 폭의 하향은 한 번 더 확인해요.", dept: "NURSING" },
};

/** 진행 흐름 — 누가, 무엇을, 그 결과 상태가 어떻게 바뀌는지 */
export const FLOW_STEPS: { no: number; actor: "SYSTEM" | DeptCode | "TEAM"; actorName: string; title: string; body: string; stage: string }[] = [
  { no: 1, actor: "SYSTEM", actorName: "자동", title: "기록 자동 점검", body: "감사 규칙 7가지가 모든 내원 기록을 점검해 ‘다시 볼 기록’을 표시해요.", stage: "QI 판정 대기" },
  { no: 2, actor: "QI", actorName: "QI팀", title: "판정", body: "문제가 없으면 ‘적정 확인’, 분류가 틀렸으면 ‘재분류 확정’으로 바로 끝내요. 사정을 들어야 하면 ‘소명 요청’.", stage: "종결 또는 소명 요청" },
  { no: 3, actor: "SYSTEM", actorName: "자동", title: "담당 팀 배정", body: "소명 요청은 기록의 문제 종류에 맞는 팀(응급간호팀·응급의학과·병상관리팀)으로 자동으로 가요.", stage: "소명 요청중" },
  { no: 4, actor: "TEAM", actorName: "담당 팀", title: "소명 제출", body: "담당 팀이 당시 상황, 이유, 개선 계획을 적어 제출해요.", stage: "소명 제출 (QI 확인 대기)" },
  { no: 5, actor: "QI", actorName: "QI팀", title: "최종 확정", body: "QI팀이 소명을 읽고 ‘적정 확인’ 또는 ‘재분류 확정’으로 마무리해요.", stage: "종결" },
];

/** 팀별로 처음 할 일 — 탭 이름을 그대로 적어 따라 하기 쉽게 */
export const DEPT_GUIDE: Record<DeptCode, { role: string; does: string; steps: { tab: string; text: string }[] }> = {
  QI: {
    role: "의료 질 관리팀",
    does: "응급실 진료가 기준대로 이뤄졌는지 기록을 점검하고, 문제가 있으면 담당 팀에 설명을 요청해 최종 판정해요.",
    steps: [
      { tab: "확인 필요", text: "빨간 카드(꼭 확인할 기록)를 위에서부터 하나씩 봐요. ‘AI 근거 제안 받기’를 누르면 무엇이 문제인지 요약해 줘요." },
      { tab: "확인 필요", text: "결정을 골라 기록해요. 문제 없음 → 적정 확인, 분류가 틀림 → 재분류 확정, 사정을 들어야 함 → 소명 요청(메모 필수)." },
      { tab: "소명 현황", text: "요청한 건이 어느 팀에서 답을 기다리는지 봐요. 팀이 답하면 ‘확인 필요’ 카드에 소명이 붙어 다시 올라와요." },
      { tab: "확인 필요", text: "소명을 읽고 ‘적정 확인’ 또는 ‘재분류 확정’으로 최종 확정하면 종결돼요." },
      { tab: "전체 내원", text: "환자별 체크리스트를 보고, 보고서(PDF)나 엑셀로 내보내요." },
    ],
  },
  NURSING: {
    role: "환자 위급도 분류(KTAS) 담당",
    does: "응급실에 온 환자를 KTAS 1~5등급으로 분류해요. 등급을 근거 없이 낮췄거나 너무 낮게 매긴 기록에 대해 설명(소명)해요.",
    steps: [
      { tab: "응급간호팀 홈", text: "우리 팀 지표(등급을 낮춘 근거 기록률, 너무 낮게 매긴 건, 간호사별 현황)와 담당 기록을 확인해요." },
      { tab: "응급간호팀 소명", text: "QI팀이 설명을 요청하면 숫자가 올라가요. 카드에서 요청 내용과 당시 기록을 읽어요." },
      { tab: "응급간호팀 소명", text: "당시 상황, 이유, 개선 계획을 적어 ‘소명 제출하기’를 눌러요. 그다음은 QI팀이 확정해요." },
      { tab: "전체 내원", text: "기록을 열어 ‘팀 메모’에 우리 팀끼리만 볼 메모를 남길 수 있어요." },
    ],
  },
  EM: {
    role: "응급 진료 담당",
    does: "환자를 진료하고 입원·귀가를 결정해요. 목표 시간보다 늦게 진료했거나, 귀가 후 3일 안에 더 위급해져 다시 온 기록에 대해 설명(소명)해요.",
    steps: [
      { tab: "응급의학과 홈", text: "등급별 목표 시간 안에 진료한 비율, 의사별 대기, 재내원 건을 확인해요." },
      { tab: "응급의학과 소명", text: "QI팀이 설명을 요청하면 숫자가 올라가요. 카드에서 요청 내용과 시간 기록을 읽어요." },
      { tab: "응급의학과 소명", text: "늦어진 이유(동시 환자 수 등)와 개선 계획을 적어 제출해요. 그다음은 QI팀이 확정해요." },
      { tab: "전체 내원", text: "기록을 열어 ‘팀 메모’에 우리 팀끼리만 볼 메모를 남길 수 있어요." },
    ],
  },
  BED: {
    role: "입원 병상 배정 담당",
    does: "입원이 결정된 환자에게 병실을 배정해요. 병실 배정이 6시간 넘게 걸렸거나 응급실에 24시간 넘게 머문 기록에 대해 설명(소명)해요.",
    steps: [
      { tab: "병상관리팀 홈", text: "구역이 얼마나 붐볐는지, 입원 결정 후 병실까지 얼마나 기다렸는지 확인해요." },
      { tab: "병상관리팀 소명", text: "QI팀이 설명을 요청하면 숫자가 올라가요. 카드에서 요청 내용과 대기 시간을 읽어요." },
      { tab: "병상관리팀 소명", text: "당시 병실 상황과 개선 계획을 적어 제출해요. 그다음은 QI팀이 확정해요." },
      { tab: "전체 내원", text: "기록을 열어 ‘팀 메모’에 우리 팀끼리만 볼 메모를 남길 수 있어요." },
    ],
  },
};

/** 화면 색과 상태 이름 읽는 법 */
export const LEGEND: { tone: "bad" | "warn" | "ok" | "info"; label: string; text: string }[] = [
  { tone: "bad", label: "확인 필요 (빨강)", text: "꼭 다시 봐야 하는 기록이에요." },
  { tone: "warn", label: "주의 관찰 (주황)", text: "확인하면 좋은 기록이에요(진료·병실 지연)." },
  { tone: "info", label: "소명 진행 (하늘)", text: "담당 팀 답변을 기다리거나 QI 확인을 기다려요." },
  { tone: "ok", label: "감사 통과 / 종결 (초록)", text: "문제가 없거나 판정이 끝났어요." },
];

export const STAGE_PLAIN: Record<Stage | "none", string> = {
  none: "QI 판정 대기 — 아직 아무도 판정하지 않았어요",
  requested: "소명 요청중 — 담당 팀이 설명을 써야 해요",
  answered: "소명 제출 — QI팀이 읽고 확정해야 해요",
  closed: "종결 — 판정이 끝났어요",
};
