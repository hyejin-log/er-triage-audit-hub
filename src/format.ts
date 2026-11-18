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
  { code: "QI", name: "QI팀", role: "의료 질 점검·최종 판정" },
  { code: "NURSING", name: "응급간호팀", role: "위급도 분류(KTAS)" },
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

// [기획 > 사용자 이해] 처음 보는 사람을 위한 용어 풀이 — 화면 곳곳의 <Term> 과 첫 화면 용어 카드가 함께 씁니다.
export const GLOSSARY = {
  KTAS: {
    term: "KTAS",
    short: "응급환자 위급도 등급",
    desc: "한국형 응급환자 분류도구. 응급실에 온 환자를 1~5등급으로 나눠 진료 순서를 정해요. 숫자가 작을수록 위급해요(1 소생 · 2 긴급 · 3 응급 · 4 준응급 · 5 비응급).",
  },
  QI: {
    term: "QI팀",
    short: "의료 질 관리팀",
    desc: "Quality Improvement(의료 질 향상)팀. 진료가 병원 기준대로 이뤄졌는지 기록을 점검하고, 문제가 있으면 담당 부서에 설명을 요청해 개선하는 부서예요.",
  },
  SIGNAL: {
    term: "감사 신호",
    short: "다시 볼 필요가 있는 기록",
    desc: "자동 규칙이 찾아낸 확인 대상이에요. 예: 응급실에 24시간 넘게 머묾, 근거 없이 위급도를 낮춤, 활력징후에 비해 등급이 낮음, 진료가 목표 시간보다 늦음.",
  },
  EXPLAIN: {
    term: "소명",
    short: "담당 팀의 사정 설명",
    desc: "QI팀이 요청하면 그 건을 맡은 팀(응급간호팀·응급의학과·병상관리팀)이 당시 상황과 이유, 개선 계획을 적어 제출하는 것이에요.",
  },
} as const;
export type GlossaryKey = keyof typeof GLOSSARY;

/** 받침에 맞춰 조사를 붙입니다. 예: josa("응급간호팀", "은", "는") → "응급간호팀은" */
export function josa(word: string, withFinal: string, withoutFinal: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  if (code < 0 || code > 11171) return `${word}${withoutFinal}`;
  return `${word}${code % 28 === 0 ? withoutFinal : withFinal}`;
}
