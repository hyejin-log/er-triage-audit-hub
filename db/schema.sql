-- [개발 > DB구축] ER Triage Audit Hub 스키마 (Neon/Postgres)
-- 앱이 첫 연결 때 자동으로 실행합니다(backend/store.py 의 SCHEMA_SQL 과 같은 내용).
-- stage: requested(소명 요청중) → answered(소명 제출) → closed(종결)

CREATE TABLE IF NOT EXISTS reviews (
    visit_id    TEXT PRIMARY KEY,
    decision    TEXT NOT NULL CHECK (decision IN ('적정 확인', '재분류 확정', '소명 요청')),
    note        TEXT NOT NULL DEFAULT '',
    reviewer    TEXT NOT NULL,
    decided_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS stage TEXT NOT NULL DEFAULT 'closed';
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS assigned_dept TEXT;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS response TEXT;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS responder TEXT;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS review_log (
    id          BIGSERIAL PRIMARY KEY,
    visit_id    TEXT NOT NULL,
    decision    TEXT NOT NULL,
    note        TEXT NOT NULL DEFAULT '',
    reviewer    TEXT NOT NULL,
    logged_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE review_log ADD COLUMN IF NOT EXISTS action TEXT NOT NULL DEFAULT 'decision';
CREATE INDEX IF NOT EXISTS idx_review_log_visit ON review_log (visit_id, logged_at DESC);
-- 팀 내부 메모: 같은 부서만 읽고 씁니다(API에서 부서로 거릅니다).
CREATE TABLE IF NOT EXISTS team_notes (
    id          BIGSERIAL PRIMARY KEY,
    visit_id    TEXT NOT NULL,
    dept        TEXT NOT NULL,
    author      TEXT NOT NULL,
    body        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_team_notes_dept ON team_notes (dept, visit_id, created_at DESC);
