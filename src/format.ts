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
  { code: "QI", name: "QI팀", role: "감사·최종 판정" },
  { code: "NURSING", name: "응급간호팀", role: "KTAS 분류" },
  { code: "EM", name: "응급의학과", role: "진료" },
  { code: "BED", name: "병상관리팀", role: "입원·병상" },
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
