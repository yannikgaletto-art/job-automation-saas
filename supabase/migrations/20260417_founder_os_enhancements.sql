-- ============================================================
-- Founder OS Dashboard — Schema Enhancements
-- Date: 2026-04-17
--
-- Changes:
--   1. generation_logs: Add task_type column for per-feature AI cost tracking
--   2. waitlist_leads: Add plan_preference column for plan intent tracking
-- ============================================================

-- ── 1. generation_logs: task_type ─────────────────────────────────────────
-- Tracks which Pathly feature triggered the AI call.
-- Values: 'cover_letter', 'cv_optimize', 'coaching', 'company_research',
--         'job_extract', 'video_script', 'cover_letter_polish', etc.
ALTER TABLE generation_logs
    ADD COLUMN IF NOT EXISTS task_type TEXT;

ALTER TABLE generation_logs
    ADD COLUMN IF NOT EXISTS prompt_tokens INTEGER,
    ADD COLUMN IF NOT EXISTS completion_tokens INTEGER;

-- Index for admin filtering by task_type
CREATE INDEX IF NOT EXISTS idx_generation_logs_task_type
    ON generation_logs (task_type, created_at DESC);

-- ── 2. waitlist_leads: plan_preference ────────────────────────────────────
-- Captures which plan the user selected on the waitlist form.
-- Values: 'free', 'starter', 'durchstarter', null (not specified)
ALTER TABLE waitlist_leads
    ADD COLUMN IF NOT EXISTS plan_preference TEXT
    CHECK (plan_preference IN ('free', 'starter', 'durchstarter'));

COMMENT ON COLUMN waitlist_leads.plan_preference IS
    'Plan the user indicated interest in when joining the waitlist (free/starter/durchstarter)';

COMMENT ON COLUMN generation_logs.task_type IS
    'Pathly feature that triggered this AI call (cover_letter, cv_optimize, coaching, etc.)';
