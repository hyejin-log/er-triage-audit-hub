// [설계 > 데이터] API 응답 타입 — backend/audit.py 와 같은 구조입니다.
export type Status = "high" | "medium" | "normal";
export type Decision = "적정 확인" | "재분류 확정" | "소명 요청";

export interface Flag {
  code: string;
  severity: "high" | "medium";
  title: string;
  basis: string;
  detail: string;
}

export interface Visit {
  visit_id: string;
  patient_ref: string;
  age: number;
  sex: "M" | "F";
  arrival_mode: string;
  chief_complaint: string;
  zone: string;
  ktas_initial: number;
  ktas_final: number;
  retriage_reason: string | null;
  triage_nurse: string;
  physician: string;
  vitals: { sbp: number; hr: number; rr: number; spo2: number; temp: number; gcs: number; pain: number };
  times: {
    arrival: string;
    triage: string;
    physician_seen: string;
    disposition_decision: string;
    bed_assigned: string | null;
    departure: string;
  };
  disposition: string;
  metrics: { los_min: number | null; door_to_doc_min: number | null; boarding_min: number | null; ktas_target_min: number | null };
  flags: Flag[];
  status: Status;
}

export interface Zone {
  zone: string;
  beds: number;
  peak: number;
  peak_at: string | null;
  ratio: number;
  over_beds: number;
  over_minutes: number;
  visits: number;
}

export interface Summary {
  period: string;
  hospital: string;
  total: number;
  high: number;
  medium: number;
  normal: number;
  median_los_min: number | null;
  ktas_mix: Record<string, number>;
  disposition: Record<string, number>;
  los_buckets: Record<string, number>;
  rule_counts: Record<string, number>;
  zones: Zone[];
}

export interface Rule {
  severity: "high" | "medium";
  title: string;
  basis: string;
}

export interface Rationale {
  source: "claude" | "rules";
  model?: string;
  summary: string;
  suggested_action: Decision;
  checklist: string[];
  note?: string;
}

export interface Review {
  visit_id: string;
  decision: Decision;
  note: string;
  reviewer: string;
  decided_at: string;
}
