-- ============================================
-- Migration 005: Add Scraping Logs Table
-- Performance Monitoring for Smart Fallback System
-- ============================================

CREATE TABLE scraping_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  job_queue_id UUID REFERENCES job_queue(id) ON DELETE CASCADE,
  
  scraper_used TEXT NOT NULL CHECK (scraper_used IN ('serpapi', 'scraperapi', 'firecrawl', 'playwright')),
  url TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('job_board', 'ats_system', 'company_page')),
  
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER GENERATED ALWAYS AS (
    EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000
  ) STORED,
  
  status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'rate_limited')),
  error_message TEXT,
  fallback_count INTEGER DEFAULT 0,
  
  estimated_cost_cents INTEGER,
  response_size_bytes INTEGER,
  fields_extracted JSONB,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_scraping_logs_user ON scraping_logs(user_id);
CREATE INDEX idx_scraping_logs_scraper ON scraping_logs(scraper_used);
CREATE INDEX idx_scraping_logs_created ON scraping_logs(created_at DESC);
CREATE INDEX idx_scraping_logs_status ON scraping_logs(status);

ALTER TABLE scraping_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own logs" 
  ON scraping_logs FOR SELECT 
  USING (auth.uid() = user_id);

CREATE VIEW scraper_performance AS
SELECT 
  scraper_used,
  source_type,
  COUNT(*) as total_requests,
  COUNT(*) FILTER (WHERE status = 'success') as successful,
  ROUND(AVG(duration_ms)) as avg_duration_ms,
  SUM(estimated_cost_cents) / 100.0 as total_cost_eur
FROM scraping_logs
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY scraper_used, source_type
ORDER BY total_requests DESC;
