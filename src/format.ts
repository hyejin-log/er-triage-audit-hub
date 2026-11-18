// [개발 > 프론트엔드] 표시용 포맷 함수
export function duration(min: number | null | undefined): string {
  if (min == null) return "-";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m}분`;
  return m ? `${h}시간 ${m}분` : `${h}시간`;
}

export function clock(iso: string | null | undefined): string {
  if (!iso) return "-";
  const [date, time] = iso.split("T");
  const [, mm, dd] = date.split("-");
  return `${Number(mm)}/${Number(dd)} ${time}`;
}

export const STATUS_LABEL = { high: "확인 필요", medium: "주의 관찰", normal: "정상" } as const;

export function safeStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function saveStorage(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 사생활 보호 모드 등에서는 저장하지 않고 넘어갑니다. */
  }
}

// [설계 > 사용자 시나리오] 부서와 진행 단계 표시
export const DEPTS = [
  { code: "QI", name: "QI팀", role: "의료 질 향상 관리" },
  { code: "NURSING", name: "응급간호팀", role: "위급도 등급(KTAS)" },
  { code: "EM", name: "응급의학과", role: "응급 진료" },
  { code: "BED", name: "병상관리팀", role: "입원 병상 배정" },
] as const;

export function deptName(code: string | null | undefined): string {
  return DEPTS.find((d) => d.code === code)?.name ?? "-";
}

export const STAGE_LABEL = { requested: "소명 요청중", answered: "소명 제출", closed: "종결" } as const;

/** 서버 기록 시각(UTC ISO)을 브라우저 현지 시각 "M/D HH:MM" 으로 바꿉니다. */
export function stamp(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function median(values: number[]): number | null {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) / 2);
}

export function pct(n: number, d: number): number {
  return d ? Math.round((n / d) * 100) : 0;
}

/** 받침에 맞춰 '로/으로'를 붙입니다. (ㄹ 받침과 받침 없음 → 로) */
export function withRo(word: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  if (code < 0 || code > 11171) return `${word}로`;
  const jong = code % 28;
  return `${word}${jong === 0 || jong === 8 ? "로" : "으로"}`;
}

// [기획 > 사용자 이해] 용어 설명 (화면의 <Term> 툴팁과 첫 화면 용어 목록에서 사용)
export const GLOSSARY = {
  KTAS: {
    term: "KTAS",
    short: "응급실 환자 위급도 등급(1~5)",
    desc: "응급실에 온 환자를 얼마나 위급한지에 따라 1~5등급으로 나누는 우리나라 기준입니다. 1등급이 가장 위급하고, 등급이 높을수록(숫자가 작을수록) 먼저 진료합니다.",
  },
  QI: {
    term: "QI팀",
    short: "의료 질 향상 관리팀",
    desc: "Quality Improvement팀. 진료가 병원 기준대로 이뤄졌는지 기록을 살펴보고, 문제가 있으면 담당 부서에 경위를 물어 고쳐 나가는 부서입니다.",
  },
  SIGNAL: {
    term: "검토 대상",
    short: "다시 살펴볼 기록",
    desc: "점검 기준에 걸린 기록입니다. 예: 응급실에 하루 넘게 머문 환자, 이유 없이 등급을 낮춘 경우, 늦게 진료한 경우.",
  },
  EXPLAIN: {
    term: "소명",
    short: "담당 부서의 경위 설명",
    desc: "QI팀이 물어보면 해당 부서가 당시 상황, 그렇게 한 이유, 앞으로의 개선 방법을 적어 내는 것입니다.",
  },
  VITALS: {
    term: "활력징후",
    short: "혈압·맥박·호흡 같은 기본 수치",
    desc: "혈압, 맥박, 호흡 횟수, 체온, 산소 수치(산소포화도), 의식 상태처럼 몸 상태를 바로 보여 주는 기본 측정값입니다.",
  },
  UNDER: {
    term: "과소분류",
    short: "실제보다 덜 위급하게 분류",
    desc: "위급한 환자를 낮은 등급으로 분류하는 것입니다. 진료 순서가 늦어져 위험할 수 있습니다.",
  },
} as const;
export type GlossaryKey = keyof typeof GLOSSARY;

/** 받침에 맞춰 조사를 붙입니다. 예: josa("응급간호팀", "은", "는") → "응급간호팀은" */
export function josa(word: string, withFinal: string, withoutFinal: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  if (code < 0 || code > 11171) return `${word}${withoutFinal}`;
  return `${word}${code % 28 === 0 ? withoutFinal : withFinal}`;
}
