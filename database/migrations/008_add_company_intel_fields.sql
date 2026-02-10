-- Migration: Add Company Intel Enrichment Fields
-- Version: 008
-- Date: 2026-02-10
-- Purpose: Support DSGVO-safe company intelligence enrichment
--
-- This migration adds fields to support the Company Intel Enrichment skill
-- which enriches cover letters with public company data (NO personal data).
--
-- DSGVO Compliance:
-- ✅ Only stores public company information (fair use)
-- ❌ Does NOT store employee names, emails, or LinkedIn profiles
-- ✅ Legal basis: Art. 6(1)(f) DSGVO - Legitimate Interest

-- ============================================================================
-- 1. ADD ENRICHMENT FIELDS TO job_queue
-- ============================================================================

-- Add enrichment status tracking
ALTER TABLE job_queue
  ADD COLUMN enrichment_status TEXT 
    CHECK (enrichment_status IN (
      'pending',           -- Not yet enriched
      'in_progress',       -- Currently being enriched
      'complete',          -- Successfully enriched
      'skipped_no_data',   -- No public data found (stealth startup)
      'skipped_no_api_key',-- Perplexity API key missing
      'failed'             -- Error during enrichment
    )) 
    DEFAULT 'pending';

-- Link to company_research table
ALTER TABLE job_queue
  ADD COLUMN company_research_id UUID 
    REFERENCES company_research(id) 
    ON DELETE SET NULL;

-- Track when enrichment was attempted
ALTER TABLE job_queue
  ADD COLUMN enrichment_attempted_at TIMESTAMPTZ;

ALTER TABLE job_queue
  ADD COLUMN enrichment_completed_at TIMESTAMPTZ;

-- Optional: Store fallback reason if enrichment failed
ALTER TABLE job_queue
  ADD COLUMN enrichment_fallback_reason TEXT;

COMMENT ON COLUMN job_queue.enrichment_status IS 
'Tracks the status of company intelligence enrichment. Enrichment adds public company data (news, culture, projects) to improve cover letter personalization.';

COMMENT ON COLUMN job_queue.company_research_id IS 
'Reference to enriched company intelligence data. NULL if enrichment failed or was skipped.';

-- ============================================================================
-- 2. ENHANCE company_research TABLE
-- ============================================================================

-- Add confidence score for enriched data
ALTER TABLE company_research
  ADD COLUMN confidence_score DECIMAL(3,2) 
    CHECK (confidence_score >= 0.0 AND confidence_score <= 1.0)
    DEFAULT 0.0;

-- Add structured fields for common intel types
ALTER TABLE company_research
  ADD COLUMN recent_news TEXT[];  -- Array of news headlines

ALTER TABLE company_research
  ADD COLUMN company_values TEXT[];  -- Core values

ALTER TABLE company_research
  ADD COLUMN tech_stack TEXT[];  -- Technologies used (if tech company)

ALTER TABLE company_research
  ADD COLUMN funding_stage TEXT;  -- e.g., "Series B", "Public"

ALTER TABLE company_research
  ADD COLUMN employee_count INTEGER;  -- From public sources

-- Add data freshness tracking
ALTER TABLE company_research
  ADD COLUMN data_source TEXT;  -- e.g., "perplexity", "manual"

ALTER TABLE company_research
  ADD COLUMN last_verified_at TIMESTAMPTZ DEFAULT NOW();

COMMENT ON COLUMN company_research.confidence_score IS 
'Quality score for enriched data. 1.0 = multiple sources, recent data. 0.0 = no data found.';

COMMENT ON COLUMN company_research.recent_news IS 
'Array of recent news headlines (last 3 months). Max 3 entries. Used for cover letter personalization.';

-- ============================================================================
-- 3. ADD INDEXES FOR PERFORMANCE
-- ============================================================================

-- Index for finding pending enrichment jobs
CREATE INDEX idx_job_queue_enrichment_pending 
  ON job_queue(enrichment_status, created_at DESC) 
  WHERE enrichment_status = 'pending';

-- Index for company research cache lookups
CREATE INDEX idx_company_research_cache 
  ON company_research(company_slug, created_at DESC) 
  WHERE created_at > NOW() - INTERVAL '7 days';

-- Index for confidence score filtering
CREATE INDEX idx_company_research_confidence 
  ON company_research(confidence_score) 
  WHERE confidence_score > 0.7;

-- ============================================================================
-- 4. ADD ANALYTICS VIEW
-- ============================================================================

-- View for monitoring enrichment performance
CREATE OR REPLACE VIEW enrichment_stats AS
SELECT 
  COUNT(*) as total_jobs,
  COUNT(*) FILTER (WHERE enrichment_status = 'complete') as enriched_count,
  COUNT(*) FILTER (WHERE enrichment_status = 'skipped_no_data') as no_data_count,
  COUNT(*) FILTER (WHERE enrichment_status = 'failed') as failed_count,
  
  -- Success rate
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE enrichment_status = 'complete') / 
    NULLIF(COUNT(*), 0), 
    2
  ) as success_rate_percent,
  
  -- Average confidence score for successful enrichments
  ROUND(
    AVG(cr.confidence_score) FILTER (WHERE jq.enrichment_status = 'complete'),
    2
  ) as avg_confidence_score,
  
  -- Cache hit rate (jobs linked to same company within 7 days)
  ROUND(
    100.0 * COUNT(DISTINCT jq.company_research_id) / 
    NULLIF(COUNT(*) FILTER (WHERE enrichment_status = 'complete'), 0),
    2
  ) as unique_companies_percent,
  
  -- Time period
  DATE_TRUNC('day', MIN(jq.created_at)) as period_start,
  DATE_TRUNC('day', MAX(jq.created_at)) as period_end
FROM job_queue jq
LEFT JOIN company_research cr ON jq.company_research_id = cr.id
WHERE jq.created_at > NOW() - INTERVAL '30 days';

COMMENT ON VIEW enrichment_stats IS 
'Analytics view for monitoring company intel enrichment performance over the last 30 days.';

-- ============================================================================
-- 5. ADD RLS POLICIES
-- ============================================================================

-- Users can only see their own job enrichment status
CREATE POLICY "Users view own job enrichment" 
  ON job_queue 
  FOR SELECT 
  USING (auth.uid() = user_id);

-- Company research is read-only for all authenticated users (shared cache)
CREATE POLICY "Authenticated users read company research" 
  ON company_research 
  FOR SELECT 
  USING (auth.role() = 'authenticated');

-- Only system (service role) can write to company_research
CREATE POLICY "Only system writes company research" 
  ON company_research 
  FOR INSERT 
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================================
-- 6. ADD HELPER FUNCTIONS
-- ============================================================================

-- Function: Get fresh company research (cache check)
CREATE OR REPLACE FUNCTION get_fresh_company_research(
  p_company_slug TEXT
)
RETURNS TABLE (
  id UUID,
  company_name TEXT,
  data JSONB,
  confidence_score DECIMAL,
  recent_news TEXT[],
  age_hours INTEGER
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cr.id,
    cr.company_name,
    cr.data,
    cr.confidence_score,
    cr.recent_news,
    EXTRACT(EPOCH FROM (NOW() - cr.created_at)) / 3600 AS age_hours
  FROM company_research cr
  WHERE cr.company_slug = p_company_slug
    AND cr.created_at > NOW() - INTERVAL '7 days'
  ORDER BY cr.created_at DESC
  LIMIT 1;
END;
$$;

COMMENT ON FUNCTION get_fresh_company_research IS 
'Check if company research exists in cache (< 7 days old). Returns NULL if cache miss.';

-- Function: Mark enrichment complete
CREATE OR REPLACE FUNCTION mark_enrichment_complete(
  p_job_queue_id UUID,
  p_company_research_id UUID,
  p_confidence_score DECIMAL DEFAULT 1.0
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE job_queue
  SET 
    enrichment_status = 'complete',
    company_research_id = p_company_research_id,
    enrichment_completed_at = NOW()
  WHERE id = p_job_queue_id;
  
  -- Also log to scraping_logs for monitoring
  INSERT INTO scraping_logs (
    job_queue_id,
    scraper_used,
    source_type,
    status,
    completed_at,
    estimated_cost_cents
  ) VALUES (
    p_job_queue_id,
    'perplexity',
    'company_intel',
    'success',
    NOW(),
    2  -- €0.02 per Perplexity call
  );
END;
$$;

COMMENT ON FUNCTION mark_enrichment_complete IS 
'Mark a job as successfully enriched and link to company research data.';

-- Function: Mark enrichment failed
CREATE OR REPLACE FUNCTION mark_enrichment_failed(
  p_job_queue_id UUID,
  p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE job_queue
  SET 
    enrichment_status = 'failed',
    enrichment_fallback_reason = p_reason,
    enrichment_completed_at = NOW()
  WHERE id = p_job_queue_id;
  
  -- Log failure
  INSERT INTO scraping_logs (
    job_queue_id,
    scraper_used,
    source_type,
    status,
    error_message,
    completed_at
  ) VALUES (
    p_job_queue_id,
    'perplexity',
    'company_intel',
    'failed',
    p_reason,
    NOW()
  );
END;
$$;

COMMENT ON FUNCTION mark_enrichment_failed IS 
'Mark a job enrichment as failed with reason. System continues without enrichment (graceful degradation).';

-- ============================================================================
-- 7. ADD SAMPLE DATA (For Testing)
-- ============================================================================

-- Insert sample company research (Tesla) for testing
INSERT INTO company_research (
  company_slug,
  company_name,
  data,
  confidence_score,
  recent_news,
  company_values,
  tech_stack,
  funding_stage,
  employee_count,
  data_source
) VALUES (
  'tesla',
  'Tesla Inc.',
  '{
    "description": "Electric vehicle and clean energy company",
    "headquarters": "Austin, Texas",
    "founded": 2003
  }'::JSONB,
  0.95,
  ARRAY[
    'Tesla opens Gigafactory Berlin with 10,000 employees (Jan 2024)',
    'Model Y becomes best-selling car in Germany (Feb 2024)',
    'Tesla announces new battery technology with 500-mile range (Mar 2024)'
  ],
  ARRAY['Innovation', 'Sustainability', 'Acceleration of sustainable transport'],
  ARRAY['Python', 'C++', 'React', 'Kubernetes', 'TensorFlow'],
  'Public',
  140000,
  'manual_seed_data'
)
ON CONFLICT (company_slug) DO NOTHING;  -- Only insert if not exists

-- ============================================================================
-- 8. ADD MONITORING TRIGGERS
-- ============================================================================

-- Trigger: Auto-set enrichment_attempted_at
CREATE OR REPLACE FUNCTION set_enrichment_attempted_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.enrichment_status = 'in_progress' AND OLD.enrichment_status = 'pending' THEN
    NEW.enrichment_attempted_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_enrichment_attempted
  BEFORE UPDATE ON job_queue
  FOR EACH ROW
  EXECUTE FUNCTION set_enrichment_attempted_timestamp();

COMMENT ON TRIGGER trigger_enrichment_attempted ON job_queue IS 
'Automatically set enrichment_attempted_at when status changes to in_progress.';

-- ============================================================================
-- VALIDATION QUERIES (Run after migration)
-- ============================================================================

-- Check 1: Verify new columns exist
-- SELECT column_name, data_type 
-- FROM information_schema.columns 
-- WHERE table_name = 'job_queue' 
-- AND column_name LIKE '%enrichment%';

-- Check 2: View enrichment stats
-- SELECT * FROM enrichment_stats;

-- Check 3: Test cache lookup
-- SELECT * FROM get_fresh_company_research('tesla');

-- Check 4: Verify sample data
-- SELECT company_name, confidence_score, recent_news 
-- FROM company_research 
-- WHERE company_slug = 'tesla';
