-- ============================================================================
-- Migration 008: Company Intel Enrichment Fields
-- Purpose: Support DSGVO-safe company intelligence enrichment
-- ============================================================================

-- Add enrichment tracking to job_queue
ALTER TABLE job_queue
  ADD COLUMN enrichment_status TEXT 
    CHECK (enrichment_status IN ('pending', 'complete', 'skipped_no_data', 'failed'))
    DEFAULT 'pending';

ALTER TABLE job_queue
  ADD COLUMN company_research_id UUID 
    REFERENCES company_research(id) ON DELETE SET NULL;

ALTER TABLE job_queue
  ADD COLUMN enrichment_completed_at TIMESTAMPTZ;

ALTER TABLE job_queue
  ADD COLUMN enrichment_fallback_reason TEXT;

COMMENT ON COLUMN job_queue.enrichment_status IS 
'Tracks company intelligence enrichment. Enrichment adds public company data (news, culture, projects) WITHOUT personal data (DSGVO-safe).';

-- Enhance company_research table
ALTER TABLE company_research
  ADD COLUMN confidence_score DECIMAL(3,2) 
    CHECK (confidence_score >= 0.0 AND confidence_score <= 1.0)
    DEFAULT 0.0;

ALTER TABLE company_research
  ADD COLUMN recent_news TEXT[];

ALTER TABLE company_research
  ADD COLUMN company_values TEXT[];

ALTER TABLE company_research
  ADD COLUMN tech_stack TEXT[];

ALTER TABLE company_research
  ADD COLUMN funding_stage TEXT;

ALTER TABLE company_research
  ADD COLUMN employee_count INTEGER;

ALTER TABLE company_research
  ADD COLUMN data_source TEXT DEFAULT 'perplexity';

COMMENT ON COLUMN company_research.confidence_score IS 
'Quality score: 1.0 = multiple sources, recent data. 0.0 = no data found.';

COMMENT ON COLUMN company_research.recent_news IS 
'Max 3 news headlines from last 3 months. Used for cover letter personalization WITHOUT scraping employee data.';

-- Index for 7-day cache lookups (60% hit rate expected)
CREATE INDEX idx_company_research_cache 
  ON company_research(company_slug, created_at DESC) 
  WHERE created_at > NOW() - INTERVAL '7 days';

-- Index for finding pending enrichment jobs
CREATE INDEX idx_job_queue_enrichment_pending 
  ON job_queue(enrichment_status, created_at DESC) 
  WHERE enrichment_status = 'pending';

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function: Check 7-day cache
CREATE OR REPLACE FUNCTION get_fresh_company_research(p_company_slug TEXT)
RETURNS TABLE (
  id UUID,
  company_name TEXT,
  data JSONB,
  confidence_score DECIMAL,
  recent_news TEXT[],
  company_values TEXT[],
  tech_stack TEXT[],
  age_hours INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cr.id,
    cr.company_name,
    cr.data,
    cr.confidence_score,
    cr.recent_news,
    cr.company_values,
    cr.tech_stack,
    EXTRACT(EPOCH FROM (NOW() - cr.created_at))::INTEGER / 3600 AS age_hours
  FROM company_research cr
  WHERE cr.company_slug = p_company_slug
    AND cr.created_at > NOW() - INTERVAL '7 days'
  ORDER BY cr.created_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_fresh_company_research IS 
'Check if company research exists in cache (< 7 days old). Returns NULL if cache miss.';

-- Function: Mark enrichment complete
CREATE OR REPLACE FUNCTION mark_enrichment_complete(
  p_job_queue_id UUID,
  p_company_research_id UUID
) RETURNS VOID AS $$
BEGIN
  UPDATE job_queue
  SET 
    enrichment_status = 'complete',
    company_research_id = p_company_research_id,
    enrichment_completed_at = NOW()
  WHERE id = p_job_queue_id;
  
  -- Log to scraping_logs
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
    2  -- €0.02 per call
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SAMPLE DATA (for testing)
-- ============================================================================

INSERT INTO company_research (
  company_slug, company_name, data, confidence_score, recent_news, company_values, tech_stack, funding_stage
) VALUES (
  'tesla', 'Tesla Inc.',
  '{"description": "Electric vehicle company"}'::JSONB,
  0.95,
  ARRAY[
    'Tesla opens Gigafactory Berlin with 10,000 employees (Jan 2024)',
    'Model Y becomes best-selling car in Germany (Feb 2024)'
  ],
  ARRAY['Innovation', 'Sustainability', 'Acceleration of sustainable transport'],
  ARRAY['Python', 'C++', 'React', 'Kubernetes'],
  'Public'
) ON CONFLICT (company_slug) DO NOTHING;

-- ============================================================================
-- VALIDATION
-- ============================================================================

-- Test cache function
SELECT * FROM get_fresh_company_research('tesla');
-- Should return Tesla data with age_hours ~0
