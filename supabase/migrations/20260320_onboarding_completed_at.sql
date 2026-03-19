-- Migration: Add onboarding_completed_at to user_settings
-- Purpose: Cohort analysis — when did the user complete onboarding?
-- Directive: ONBOARDING-V2-STEP2

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

-- No default, no index — written once per user, never queried as filter.
