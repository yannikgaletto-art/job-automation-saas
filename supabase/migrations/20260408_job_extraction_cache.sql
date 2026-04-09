-- =============================================================================
-- Migration: job_extraction_cache
-- Purpose: Persist LLM-extracted buzzwords + requirements across job deletes.
--          Keyed by (user_id, description_hash) so identical job descriptions
--          always produce identical cv_match inputs — even after delete + re-add.
-- =============================================================================

CREATE TABLE IF NOT EXISTS job_extraction_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    description_hash VARCHAR(32) NOT NULL,
    buzzwords TEXT[] NOT NULL DEFAULT '{}',
    requirements TEXT[] NOT NULL DEFAULT '{}',
    responsibilities TEXT[] NOT NULL DEFAULT '{}',
    benefits TEXT[] NOT NULL DEFAULT '{}',
    summary TEXT,
    seniority VARCHAR(20) DEFAULT 'unknown',
    location TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- One cached extraction per user per unique description text
    CONSTRAINT uq_extraction_cache_user_hash UNIQUE (user_id, description_hash)
);

-- RLS: user can only read their own cached extractions
ALTER TABLE job_extraction_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own extraction cache"
    ON job_extraction_cache FOR SELECT
    USING (auth.uid() = user_id);

-- Service-role key bypasses RLS for server-side writes (§8 pattern)
-- No INSERT/UPDATE/DELETE policies for anon — only service_role writes.

-- Index for fast lookup by user + hash (already covered by unique constraint)
-- No additional index needed.

COMMENT ON TABLE job_extraction_cache IS
    'Persistent cache for Mistral-extracted job fields (buzzwords, requirements). '
    'Survives job_queue row deletion, ensuring cv_match receives identical inputs '
    'for identical job descriptions. DSGVO: CASCADE on user delete. No PII stored.';
