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
