// [개발 > 프론트엔드] API 클라이언트 — 오류는 사용자가 읽을 수 있는 문장으로 바꿔서 던집니다.
import type { Decision, DeptCode, Progress, Rationale, Review, Rule, Summary, TeamNote, User, Visit } from "./types";

export class ApiError extends Error {
  constructor(message: string, public status = 0) {
    super(message);
  }
}

// [개발 > 인증] 로그인 토큰 — App 이 Supabase 세션이 바뀔 때마다 갱신합니다.
let authToken: string | null = null;
export function setAuthToken(token: string | null) {
  authToken = token;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    throw new ApiError("서버에 연결하지 못했어요. API 서버가 켜져 있는지 확인해 주세요.");
  }
  if (!res.ok) {
    let detail = `요청이 실패했어요 (${res.status}).`;
    try {
      const body = await res.json();
      if (typeof body?.detail === "string") detail = body.detail;
      else if (Array.isArray(body?.detail)) detail = "입력값을 다시 확인해 주세요.";
    } catch {
      /* 본문이 JSON이 아니면 기본 문구를 씁니다. */
    }
    throw new ApiError(detail, res.status);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  summary: () => request<Summary>("/api/summary"),
  progress: () => request<Progress>("/api/progress"),
  health: () => request<{ ok: boolean; store?: string; db_ok?: boolean | null }>("/api/health"),
  visits: () => request<{ count: number; items: Visit[] }>("/api/visits"),
  rules: () => request<Record<string, Rule>>("/api/rules"),
  aiReview: (id: string) => request<Rationale>(`/api/visits/${encodeURIComponent(id)}/ai-review`, { method: "POST" }),
  reviews: () => request<{ store: string; items: Record<string, Review> }>("/api/reviews"),
  saveReview: (body: { visit_id: string; decision: Decision; note: string }) =>
    request<Review>("/api/reviews", { method: "POST", body: JSON.stringify(body) }),
  respond: (id: string, response: string) =>
    request<Review>(`/api/reviews/${encodeURIComponent(id)}/response`, { method: "POST", body: JSON.stringify({ response }) }),
  deleteReview: (id: string) => request<void>(`/api/reviews/${encodeURIComponent(id)}`, { method: "DELETE" }),
  // [개발 > 인증]
  demoLogin: (dept: DeptCode) => request<{ token: string; user: User }>("/api/demo-login", { method: "POST", body: JSON.stringify({ dept }) }),
  me: () => request<User>("/api/me"),
  resetDemo: () => request<{ deleted: number }>("/api/demo/reset", { method: "POST" }),
  seedDemo: () => request<{ closed: number; requested: number; answered: number; notes: number }>("/api/demo/seed", { method: "POST" }),
  // [개발 > 협업] 팀 메모
  notes: (visitId?: string) =>
    request<{ dept: DeptCode; items: TeamNote[] }>(`/api/notes${visitId ? `?visit_id=${encodeURIComponent(visitId)}` : ""}`),
  addNote: (visitId: string, body: string) =>
    request<TeamNote>("/api/notes", { method: "POST", body: JSON.stringify({ visit_id: visitId, body }) }),
  deleteNote: (id: number) => request<void>(`/api/notes/${id}`, { method: "DELETE" }),
};

// [개발 > 인증] 엑셀은 로그인 토큰이 필요해서 링크 대신 fetch 로 받아 저장합니다.
export async function downloadExport(): Promise<void> {
  let res: Response;
  try {
    res = await fetch("/api/export.xlsx", { headers: authToken ? { Authorization: `Bearer ${authToken}` } : {} });
  } catch {
    throw new ApiError("서버에 연결하지 못했어요.");
  }
  if (!res.ok) throw new ApiError(res.status === 401 ? "로그인해야 내려받을 수 있어요." : "엑셀을 만들지 못했어요.", res.status);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = "er-triage-audit.xlsx";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
