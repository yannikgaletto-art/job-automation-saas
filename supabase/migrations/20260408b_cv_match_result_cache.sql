-- =============================================================================
-- Migration: cv_match_result_cache
-- Purpose: Persist CV Match analysis results across job deletes.
--          Keyed by (user_id, input_hash) where input_hash = SHA-256 of
--          (cvText + description + requirements + buzzwords).
--          Ensures: delete job + re-add + match = identical cards, scores, keywords.
--
-- Separate from job_extraction_cache (Reduce Complexity):
--   - job_extraction_cache: Mistral extraction (job-only, keyed by description_hash)
--   - cv_match_result_cache: Haiku analysis (job+CV, keyed by input_hash)
--
-- DSGVO: CASCADE on user delete. No PII stored (result contains skill names only).
-- =============================================================================

CREATE TABLE IF NOT EXISTS cv_match_result_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    input_hash VARCHAR(32) NOT NULL,
    result JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- One cached analysis per user per unique (CV + job) combination
    CONSTRAINT uq_cv_match_cache_user_hash UNIQUE (user_id, input_hash)
);

-- RLS: user can only read their own cached results
ALTER TABLE cv_match_result_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own cv match results"
    ON cv_match_result_cache FOR SELECT
    USING (auth.uid() = user_id);

-- Service-role key bypasses RLS for server-side writes (§8 pattern)

COMMENT ON TABLE cv_match_result_cache IS
    'Persistent cache for Haiku CV Match analysis results. '
    'Survives job_queue row deletion. Keyed by input_hash (CV text + job description '
    '+ requirements + buzzwords). Multi-CV safe: different CVs produce different hashes. '
    'DSGVO: CASCADE on user delete. No PII stored.';
