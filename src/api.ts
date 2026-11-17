// [개발 > 프론트엔드] API 클라이언트 — 오류는 사용자가 읽을 수 있는 문장으로 바꿔서 던집니다.
import type { Decision, Rationale, Review, Rule, Summary, Visit } from "./types";

export class ApiError extends Error {}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
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
    throw new ApiError(detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  summary: () => request<Summary>("/api/summary"),
  visits: () => request<{ count: number; items: Visit[] }>("/api/visits"),
  rules: () => request<Record<string, Rule>>("/api/rules"),
  aiReview: (id: string) => request<Rationale>(`/api/visits/${encodeURIComponent(id)}/ai-review`, { method: "POST" }),
  reviews: () => request<{ store: string; items: Record<string, Review> }>("/api/reviews"),
  saveReview: (body: { visit_id: string; decision: Decision; note: string; reviewer: string }) =>
    request<Review>("/api/reviews", { method: "POST", body: JSON.stringify(body) }),
  deleteReview: (id: string) => request<void>(`/api/reviews/${encodeURIComponent(id)}`, { method: "DELETE" }),
};
