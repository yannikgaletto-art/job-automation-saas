-- ============================================
-- Add last_active_at to user_settings
-- DSGVO Art. 5(1)(e): Speicherbegrenzung — Daten-Retention
-- Date: 2026-04-15
-- ============================================
-- Avoids cross-schema access to auth.users (RISIKO #6 from QA Stresstest).
-- Used by pg_cron cleanup job to identify inactive users.

ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS
  last_active_at TIMESTAMPTZ DEFAULT now();

-- Backfill existing rows with created_at as initial value
UPDATE user_settings SET last_active_at = COALESCE(updated_at, now())
WHERE last_active_at IS NULL;

-- Index for efficient cleanup query
CREATE INDEX IF NOT EXISTS idx_user_settings_last_active
  ON user_settings(last_active_at);

-- ============================================
-- TRIGGER: Auto-update last_active_at on any row modification
-- CRITICAL: Without this, the pg_cron cleanup job would falsely
-- mark ALL users as inactive after 12 months → data loss!
-- ============================================
CREATE OR REPLACE FUNCTION update_last_active_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_active_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop if exists to make migration idempotent
DROP TRIGGER IF EXISTS trg_update_last_active_at ON user_settings;

CREATE TRIGGER trg_update_last_active_at
  BEFORE UPDATE ON user_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_last_active_at();
