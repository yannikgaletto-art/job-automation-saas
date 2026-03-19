-- ============================================
-- Mood Check-in V2 — Progressive Reduction Columns
--
-- Adds skip-streak tracking and show/hide toggle
-- to user_profiles for the adaptive mood check-in.
--
-- Existing RLS on user_profiles covers both columns.
-- ============================================

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS checkin_skip_streak INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS show_checkin BOOLEAN DEFAULT true;
