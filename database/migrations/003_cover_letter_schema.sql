-- ============================================
-- MIGRATION 003: COVER LETTER + COMPANY RESEARCH
-- ============================================
-- Purpose: Add tables for Agent 3 (Cover Letter + Company Intel)
-- Author: Pathly Team
-- Date: 2026-02-13
--
-- Dependencies: 002_scraping_v2_schema.sql
-- ============================================

-- 1. COMPANY RESEARCH CACHE
-- Stores Perplexity API results (7-day cache)
CREATE TABLE IF NOT EXISTS company_research (
    research_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name TEXT NOT NULL UNIQUE,
    
    -- Intel data (JSONB for flexible structure)
    intel_data JSONB NOT NULL,
    -- Example structure:
    -- {
    --   "mission": "Company mission...",
    --   "recent_news": ["News 1", "News 2"],
    --   "culture": ["Culture point 1", "Culture point 2"],
    --   "achievements": ["Award 1", "Recognition 2"]
    -- }
    
    -- Citations from Perplexity
    perplexity_citations JSONB DEFAULT '[]'::jsonb,
    
    -- Metadata
    researched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    api_provider TEXT DEFAULT 'perplexity',
    
    -- Housekeeping
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_company_research_name 
    ON company_research(company_name);

-- Index for cache expiration cleanup
CREATE INDEX IF NOT EXISTS idx_company_research_expires 
    ON company_research(expires_at);

-- Auto-update timestamp
CREATE OR REPLACE FUNCTION update_company_research_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_company_research
    BEFORE UPDATE ON company_research
    FOR EACH ROW
    EXECUTE FUNCTION update_company_research_timestamp();

-- Cleanup function for expired cache entries
CREATE OR REPLACE FUNCTION cleanup_expired_company_research()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM company_research
    WHERE expires_at < NOW();
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_expired_company_research() IS 
    'Deletes expired company research entries. Run via cron daily.';


-- 2. COVER LETTERS
-- Stores generated cover letters
CREATE TABLE IF NOT EXISTS cover_letters (
    cover_letter_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Relations
    job_id UUID NOT NULL REFERENCES job_queue(job_id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    
    -- Cover letter content
    cover_letter_markdown TEXT NOT NULL,
    word_count INTEGER NOT NULL,
    
    -- Generation metadata
    tone TEXT DEFAULT 'professional',
    model_used TEXT NOT NULL,
    company_intel_used BOOLEAN DEFAULT FALSE,
    generation_metadata JSONB DEFAULT '{}'::jsonb,
    -- Example metadata:
    -- {
    --   "input_tokens": 1500,
    --   "output_tokens": 350,
    --   "company_research_cached": true
    -- }
    
    -- Quality metrics (for future Quality Judge)
    quality_score DECIMAL(3,2),  -- 0.00 to 1.00
    quality_feedback TEXT,
    
    -- User feedback
    user_rating INTEGER CHECK (user_rating BETWEEN 1 AND 5),
    user_feedback TEXT,
    
    -- Status
    status TEXT DEFAULT 'generated' CHECK (status IN (
        'generated',
        'reviewed',
        'edited',
        'approved',
        'submitted'
    )),
    
    -- Housekeeping
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    submitted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cover_letters_job 
    ON cover_letters(job_id);

CREATE INDEX IF NOT EXISTS idx_cover_letters_user 
    ON cover_letters(user_id);

CREATE INDEX IF NOT EXISTS idx_cover_letters_status 
    ON cover_letters(status);

CREATE INDEX IF NOT EXISTS idx_cover_letters_generated 
    ON cover_letters(generated_at DESC);

-- Auto-update timestamp
CREATE OR REPLACE FUNCTION update_cover_letters_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    
    -- Auto-set reviewed_at when status changes to 'reviewed'
    IF NEW.status = 'reviewed' AND OLD.status != 'reviewed' THEN
        NEW.reviewed_at = NOW();
    END IF;
    
    -- Auto-set submitted_at when status changes to 'submitted'
    IF NEW.status = 'submitted' AND OLD.status != 'submitted' THEN
        NEW.submitted_at = NOW();
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_cover_letters
    BEFORE UPDATE ON cover_letters
    FOR EACH ROW
    EXECUTE FUNCTION update_cover_letters_timestamp();


-- 3. COVER LETTER VERSIONS (for iteration/editing)
-- Stores previous versions when user edits
CREATE TABLE IF NOT EXISTS cover_letter_versions (
    version_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cover_letter_id UUID NOT NULL REFERENCES cover_letters(cover_letter_id) ON DELETE CASCADE,
    
    version_number INTEGER NOT NULL,
    cover_letter_markdown TEXT NOT NULL,
    word_count INTEGER NOT NULL,
    
    -- What changed
    change_reason TEXT,  -- 'regeneration', 'user_edit', 'quality_improvement'
    changed_by TEXT,     -- 'user', 'system', 'quality_judge'
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_cover_letter_versions 
    ON cover_letter_versions(cover_letter_id, version_number DESC);

-- Helper function: Archive current version before update
CREATE OR REPLACE FUNCTION archive_cover_letter_version()
RETURNS TRIGGER AS $$
DECLARE
    next_version INTEGER;
BEGIN
    -- Only archive if content actually changed
    IF OLD.cover_letter_markdown != NEW.cover_letter_markdown THEN
        -- Get next version number
        SELECT COALESCE(MAX(version_number), 0) + 1 
        INTO next_version
        FROM cover_letter_versions
        WHERE cover_letter_id = OLD.cover_letter_id;
        
        -- Archive old version
        INSERT INTO cover_letter_versions (
            cover_letter_id,
            version_number,
            cover_letter_markdown,
            word_count,
            change_reason,
            changed_by
        ) VALUES (
            OLD.cover_letter_id,
            next_version,
            OLD.cover_letter_markdown,
            OLD.word_count,
            'content_updated',
            'system'
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_archive_cover_letter
    BEFORE UPDATE ON cover_letters
    FOR EACH ROW
    WHEN (OLD.cover_letter_markdown IS DISTINCT FROM NEW.cover_letter_markdown)
    EXECUTE FUNCTION archive_cover_letter_version();


-- 4. ANALYTICS VIEW
-- Summary stats for cover letter generation
CREATE OR REPLACE VIEW cover_letter_stats AS
SELECT
    COUNT(*) AS total_generated,
    COUNT(*) FILTER (WHERE status = 'submitted') AS total_submitted,
    AVG(word_count) AS avg_word_count,
    AVG(quality_score) AS avg_quality_score,
    AVG(user_rating) AS avg_user_rating,
    COUNT(*) FILTER (WHERE company_intel_used = TRUE) AS intel_usage_count,
    COUNT(DISTINCT user_id) AS unique_users,
    DATE_TRUNC('day', generated_at) AS date
FROM cover_letters
GROUP BY DATE_TRUNC('day', generated_at)
ORDER BY date DESC;

COMMENT ON VIEW cover_letter_stats IS 
    'Daily aggregated statistics for cover letter generation';


-- 5. RLS POLICIES
-- Enable RLS
ALTER TABLE company_research ENABLE ROW LEVEL SECURITY;
ALTER TABLE cover_letters ENABLE ROW LEVEL SECURITY;
ALTER TABLE cover_letter_versions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own cover letters
CREATE POLICY cover_letters_user_policy ON cover_letters
    FOR ALL
    USING (auth.uid() = user_id);

-- Policy: Service role can access all
CREATE POLICY cover_letters_service_policy ON cover_letters
    FOR ALL
    TO service_role
    USING (true);

-- Policy: Company research is public (read-only for users)
CREATE POLICY company_research_read_policy ON company_research
    FOR SELECT
    USING (true);

-- Policy: Only service can write company research
CREATE POLICY company_research_write_policy ON company_research
    FOR INSERT
    TO service_role
    WITH CHECK (true);

-- Policy: Users can see versions of their own cover letters
CREATE POLICY cover_letter_versions_user_policy ON cover_letter_versions
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM cover_letters
            WHERE cover_letters.cover_letter_id = cover_letter_versions.cover_letter_id
            AND cover_letters.user_id = auth.uid()
        )
    );


-- 6. CRON JOB (if pg_cron available)
-- Cleanup expired company research daily at 3 AM
-- SELECT cron.schedule(
--     'cleanup-expired-company-research',
--     '0 3 * * *',
--     $$SELECT cleanup_expired_company_research();$$
-- );


-- ============================================
-- ROLLBACK SCRIPT
-- ============================================
-- Run this to undo migration:
--
-- DROP TABLE IF EXISTS cover_letter_versions CASCADE;
-- DROP TABLE IF EXISTS cover_letters CASCADE;
-- DROP TABLE IF EXISTS company_research CASCADE;
-- DROP VIEW IF EXISTS cover_letter_stats;
-- DROP FUNCTION IF EXISTS cleanup_expired_company_research();
-- DROP FUNCTION IF EXISTS archive_cover_letter_version();
-- DROP FUNCTION IF EXISTS update_cover_letters_timestamp();
-- DROP FUNCTION IF EXISTS update_company_research_timestamp();

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
