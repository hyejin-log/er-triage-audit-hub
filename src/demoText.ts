// [기획 > 시연] 데모용 예시 문구 — 메모·소명·팀 메모 칸을 버튼 한 번으로 채워 시연을 빠르게 합니다.
// 감사 신호(첫 번째 flag)와 고른 결정에 맞춰 문장을 고르고, 실제 내원 정보(내원번호·등급)를 넣습니다.
import type { Decision, DeptCode, Visit } from "./types";

const REQUEST: Record<string, string> = {
  DOWNGRADE_NO_REASON: "위급도를 낮춰 다시 분류(KTAS {ki}→{kf})했는데 근거 기록이 없습니다. 재평가 시점의 증상·활력징후와 낮춘 이유를 설명해 주세요.",
  DOWNGRADE_WITH_REASON: "근거는 있지만 KTAS {ki}→{kf}로 크게 낮췄습니다. 재평가 시각과 측정값을 보충해 설명해 주세요.",
  UNDERTRIAGE_VITALS: "활력징후가 위험 범위인데 KTAS {kf}로 낮게 분류되었습니다. 분류 당시 판단 근거를 설명해 주세요.",
  LOS_OVER_24H: "응급실 체류가 24시간을 넘었습니다. 병실 배정이 늦어진 이유와 당시 병동 상황을 설명해 주세요.",
  BOARDING_OVER_6H: "입원 결정 후 병실 배정까지 6시간 넘게 걸렸습니다. 지연 이유를 설명해 주세요.",
  PHYSICIAN_DELAY: "KTAS {kf} 진료 목표 시간보다 늦게 진료했습니다. 같은 시간대 환자 수 등 지연 이유를 설명해 주세요.",
  BOUNCE_BACK_72H: "귀가 후 72시간 안에 더 위급한 상태로 다시 왔습니다. 첫 방문 때 귀가 판단과 안내 내용을 설명해 주세요.",
};

const RESPONSE: Record<string, string> = {
  DOWNGRADE_NO_REASON: "재평가 때 통증이 줄고 활력징후가 안정되어 등급을 낮췄으나 근거 입력을 빠뜨렸습니다. 재분류할 때 근거 입력을 필수로 하도록 팀 교육을 하겠습니다.",
  DOWNGRADE_WITH_REASON: "재평가에서 증상이 크게 좋아져 등급을 낮췄습니다. 재평가 시각과 측정값을 기록에 보충했고, 큰 폭으로 낮출 때는 2인 확인을 하겠습니다.",
  UNDERTRIAGE_VITALS: "측정 오류 가능성을 보고 재측정할 예정이었으나 기록이 남지 않았습니다. 위험 활력징후가 나오면 바로 등급을 올리도록 분류 체크리스트를 보완하겠습니다.",
  LOS_OVER_24H: "당시 병동이 가득 차 입원 병실이 나지 않았습니다. 야간 병상 조정 회의를 추가하고 다른 병원 전원 기준을 앞당기겠습니다.",
  BOARDING_OVER_6H: "중환자실 병상이 부족해 배정이 늦었습니다. 병상 현황을 2시간마다 응급실과 공유하도록 바꾸겠습니다.",
  PHYSICIAN_DELAY: "같은 시간대에 위급한 환자 2명을 동시에 진료해 늦어졌습니다. 붐빌 때 추가 인력을 부르는 기준을 만들겠습니다.",
  BOUNCE_BACK_72H: "첫 방문 때 검사 결과가 정상이라 귀가했으나 악화 시 다시 오라는 안내가 부족했습니다. 귀가 안내문을 보완하겠습니다.",
};

const TEAM_NOTE: Record<DeptCode, string> = {
  QI: "다음 달 QI 위원회 보고 사례로 올릴 것. 비슷한 건이 반복되는지 함께 확인.",
  NURSING: "팀 회의 안건: 재분류할 때 근거 입력 교육 자료에 이 사례 추가.",
  EM: "다음 주 응급의학과 사례 회의에서 공유. 붐빌 때 진료 순서 조정 방법 논의.",
  BED: "병동 협의 때 병상 지연 사례로 보고. 야간 병상 현황 공유 방식 점검.",
};

function fill(template: string, v: Visit): string {
  return template.replace("{ki}", String(v.ktas_initial)).replace("{kf}", String(v.ktas_final));
}

/** QI팀 결정 메모 예시 */
export function demoDecisionNote(v: Visit, decision: Decision | null): string {
  const flag = v.flags[0];
  const code = flag?.code ?? "";
  const d = decision ?? (flag?.severity === "high" ? "소명 요청" : "적정 확인");
  if (d === "소명 요청") return fill(REQUEST[code] ?? "기록 확인이 필요합니다. 당시 상황과 이유를 설명해 주세요.", v);
  if (d === "재분류 확정") return `[${v.visit_id}] ${flag?.title ?? "감사 신호"} — 기준에 맞지 않아 재분류 확정. 담당 팀 교육과 재발 방지 계획 확인 예정.`;
  return `[${v.visit_id}] 기록 확인 결과 ${flag ? `${flag.title} 사유가 확인되어` : "문제가 없어"} 적정으로 판단. 추가 조치 없음.`;
}

/** 담당 팀 소명 예시 */
export function demoResponse(v: Visit): string {
  return RESPONSE[v.flags[0]?.code ?? ""] ?? "당시 상황을 확인했고, 같은 일이 반복되지 않도록 팀 내 절차를 보완하겠습니다.";
}

/** 팀 메모 예시 */
export function demoTeamNote(dept: DeptCode): string {
  return TEAM_NOTE[dept];
}
