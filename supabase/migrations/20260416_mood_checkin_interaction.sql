-- ============================================
-- Mood Check-in V2.3 — Server-Side Interaction Tracking
--
-- Adds last_checkin_interaction_at to user_profiles.
-- This timestamp is set on EVERY user interaction with 
-- the mood check-in dialog (submit, skip, dismiss).
-- 
-- The frontend uses this to determine if the user has
-- already interacted today — making the check immune
-- to new logins, incognito modes, or cache resets.
-- 
-- Guard logic (in priority order):
--   1. (Fast) localStorage key present → skip (same browser session)
--   2. (Safe) last_checkin_interaction_at is today (local TZ) → skip
--   3. (Safe) todayMood != null in mood_checkins → skip
--   4. show_checkin === false → skip (permanent disable)
--   5. All clear → show overlay
-- ============================================

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS last_checkin_interaction_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN user_profiles.last_checkin_interaction_at IS 
  'Last time the user interacted with the mood check-in dialog (any action: submit/skip/dismiss). Used to enforce once-per-day display across sessions and devices.';
