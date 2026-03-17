-- i18n: Add language columns to user_settings and coaching_sessions
-- Supports: 'de', 'en', 'es' (DACH primary market, default: 'de')
-- Protocol: directives/i18n_protocol.md

-- 1. user_settings.language — User's preferred UI language
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'de'
  CHECK (language IN ('de', 'en', 'es'));

-- 2. coaching_sessions.language — Frozen locale per coaching session
-- Locale is set at session start and remains constant for the entire session
ALTER TABLE coaching_sessions
  ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'de'
  CHECK (language IN ('de', 'en', 'es'));

-- No RLS changes needed:
-- user_settings: existing "own_settings" policy covers all columns
-- coaching_sessions: existing policy covers all columns
