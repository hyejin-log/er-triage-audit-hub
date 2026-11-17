-- [개발 > DB구축] ER Triage Audit Hub 스키마 (Neon/Postgres)
-- 내원 데이터는 data/ed_visits.json(가상)을 읽고, DB에는 담당자 결정만 저장합니다.

CREATE TABLE IF NOT EXISTS reviews (
    visit_id    TEXT PRIMARY KEY,
    decision    TEXT NOT NULL CHECK (decision IN ('적정 확인', '재분류 확정', '소명 요청')),
    note        TEXT NOT NULL DEFAULT '',
    reviewer    TEXT NOT NULL,
    decided_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 감사 추적용: 결정이 바뀌어도 이력은 남깁니다.
CREATE TABLE IF NOT EXISTS review_log (
    id          BIGSERIAL PRIMARY KEY,
    visit_id    TEXT NOT NULL,
    decision    TEXT NOT NULL,
    note        TEXT NOT NULL DEFAULT '',
    reviewer    TEXT NOT NULL,
    logged_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_review_log_visit ON review_log (visit_id, logged_at DESC);
