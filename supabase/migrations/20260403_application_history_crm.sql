-- Migration: Application History → Customer Journey CRM (Strategy 3-Lite)
-- Date: 2026-04-03
-- Scope: Additive columns only. No trigger changes. RLS auto-inherited.
-- Backward compat: submitted_at remains for confetti mechanism.

-- 1. New CRM columns
ALTER TABLE application_history
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'applied'
    CHECK (status IN ('applied', 'follow_up_sent', 'interviewing', 'offer_received', 'rejected', 'ghosted')),
  ADD COLUMN IF NOT EXISTS next_action_date DATE,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS rejection_tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS contact_name TEXT,
  ADD COLUMN IF NOT EXISTS learnings TEXT;

-- 2. Index for follow-up dashboard queries (overdue highlight)
CREATE INDEX IF NOT EXISTS idx_application_history_next_action
  ON application_history (user_id, next_action_date)
  WHERE next_action_date IS NOT NULL;

-- 3. Index for status filtering
CREATE INDEX IF NOT EXISTS idx_application_history_status
  ON application_history (user_id, status);
