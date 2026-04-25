-- =============================================================================
-- Migration: job_extraction_cache + locale awareness
-- Purpose: ATS-Keyword extraction is now locale-aware (CV-Match consistency).
--          Without this, a user who switches DE↔EN would get cached DE-keywords
--          for a re-imported English job, breaking CV-Match.
--
-- Strategy:
--   1. Add `locale` column with default 'de' (existing rows = legacy DE-extraction).
--   2. Drop old (user_id, description_hash) unique constraint.
--   3. Replace with (user_id, description_hash, locale) — allows the same job
--      description to be cached separately per locale.
--
-- Production-safe: ALTER TABLE ADD COLUMN with DEFAULT is non-blocking in PG14+.
-- Source: ATS-Keyword Härtung Phase 1.2 + Locale-Awareness, 2026-04-25.
-- =============================================================================

-- 1. Add locale column (default 'de' for existing rows)
ALTER TABLE job_extraction_cache
    ADD COLUMN IF NOT EXISTS locale VARCHAR(2) NOT NULL DEFAULT 'de';

-- 2. Drop old unique constraint (idempotent)
ALTER TABLE job_extraction_cache
    DROP CONSTRAINT IF EXISTS uq_extraction_cache_user_hash;

-- 3. New unique constraint includes locale
ALTER TABLE job_extraction_cache
    ADD CONSTRAINT uq_extraction_cache_user_hash_locale
    UNIQUE (user_id, description_hash, locale);

COMMENT ON COLUMN job_extraction_cache.locale IS
    'User locale at extraction time (de/en/es). Cache hits require locale match — '
    'guarantees ATS-Keyword language consistency for CV-Match downstream.';
