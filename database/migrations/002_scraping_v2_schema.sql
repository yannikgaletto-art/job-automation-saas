-- ============================================
-- MIGRATION: Scraping V2 Schema
-- Version: 002
-- Date: 2026-02-12
-- Description: Add support for platform-intelligent scraping router
-- ============================================

-- ============================================
-- 1. EXTEND job_queue TABLE
-- ============================================

-- Add new columns for scraping metadata
ALTER TABLE job_queue
  -- Scraping metadata
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS scraping_method TEXT CHECK (scraping_method IN (
    'bright_data',      -- LinkedIn via Bright Data API
    'direct_api',       -- Greenhouse/Lever/Workday JSON APIs
    'patchright',       -- StepStone/Monster/Xing via Patchright
    'scraper_api',      -- Future: Indeed via ScraperAPI
    'firecrawl',        -- Future: Glassdoor via Firecrawl
    'unknown'           -- Fallback/manual
  )),
  ADD COLUMN IF NOT EXISTS scraping_duration_seconds FLOAT,
  ADD COLUMN IF NOT EXISTS scraped_at TIMESTAMPTZ,
  
  -- Enhanced descriptions
  ADD COLUMN IF NOT EXISTS description_markdown TEXT, -- Jina Reader output
  
  -- Additional job metadata
  ADD COLUMN IF NOT EXISTS apply_url TEXT,
  ADD COLUMN IF NOT EXISTS department TEXT,
  ADD COLUMN IF NOT EXISTS employment_type TEXT,
  ADD COLUMN IF NOT EXISTS seniority_level TEXT,
  ADD COLUMN IF NOT EXISTS posted_date TIMESTAMPTZ,
  
  -- Raw data for debugging
  ADD COLUMN IF NOT EXISTS raw_data JSONB;

-- Create indexes for scraping performance queries
CREATE INDEX IF NOT EXISTS idx_job_queue_scraping_method 
  ON job_queue(scraping_method);

CREATE INDEX IF NOT EXISTS idx_job_queue_scraped_at 
  ON job_queue(scraped_at DESC);

CREATE INDEX IF NOT EXISTS idx_job_queue_platform_method 
  ON job_queue(platform, scraping_method);

-- Add comment
COMMENT ON COLUMN job_queue.scraping_method IS 'Which scraper was used (bright_data, direct_api, patchright, etc.)';
COMMENT ON COLUMN job_queue.description_markdown IS 'Clean Markdown version of description (via Jina Reader)';
COMMENT ON COLUMN job_queue.scraping_duration_seconds IS 'Time taken to scrape this job (seconds)';

-- ============================================
-- 2. FAILED SCRAPES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS failed_scrapes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Job identification
  url TEXT NOT NULL,
  platform TEXT NOT NULL,
  
  -- Scraping context
  scraping_method TEXT, -- Which scraper attempted
  error TEXT NOT NULL,
  retry_count INT DEFAULT 0,
  
  -- User context
  pillar TEXT CHECK (pillar IN ('manual', 'automation')),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Performance metrics
  duration_seconds FLOAT,
  
  -- Debugging
  error_details JSONB, -- Stack trace, HTTP status, etc.
  
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for failure analysis
CREATE INDEX IF NOT EXISTS idx_failed_scrapes_platform 
  ON failed_scrapes(platform);

CREATE INDEX IF NOT EXISTS idx_failed_scrapes_method 
  ON failed_scrapes(scraping_method);

CREATE INDEX IF NOT EXISTS idx_failed_scrapes_timestamp 
  ON failed_scrapes(timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_failed_scrapes_pillar 
  ON failed_scrapes(pillar);

-- RLS: Users can only see their own failures
ALTER TABLE failed_scrapes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only access their own failed scrapes"
  ON failed_scrapes FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can see all failures (for monitoring)
CREATE POLICY "Admins can access all failed scrapes"
  ON failed_scrapes FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND subscription_tier = 'admin' -- You might want a separate admin flag
  ));

-- Comment
COMMENT ON TABLE failed_scrapes IS 'Log of all failed scraping attempts for debugging and monitoring';

-- ============================================
-- 3. SCRAPING STATS TABLE (MONITORING)
-- ============================================

CREATE TABLE IF NOT EXISTS scraping_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Aggregation period
  date DATE NOT NULL,
  platform TEXT NOT NULL,
  scraping_method TEXT NOT NULL,
  
  -- Success metrics
  total_attempts INT DEFAULT 0,
  successful_scrapes INT DEFAULT 0,
  failed_scrapes INT DEFAULT 0,
  
  -- Performance metrics
  avg_duration_seconds FLOAT,
  p50_duration_seconds FLOAT, -- Median
  p95_duration_seconds FLOAT, -- 95th percentile
  p99_duration_seconds FLOAT, -- 99th percentile
  
  -- Cost tracking (estimated)
  total_cost_usd FLOAT DEFAULT 0.0,
  cost_per_job_usd FLOAT,
  
  -- Failure analysis
  timeout_count INT DEFAULT 0,
  anti_bot_block_count INT DEFAULT 0,
  parsing_error_count INT DEFAULT 0,
  other_error_count INT DEFAULT 0,
  
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(date, platform, scraping_method)
);

-- Indexes for analytics queries
CREATE INDEX IF NOT EXISTS idx_scraping_stats_date 
  ON scraping_stats(date DESC);

CREATE INDEX IF NOT EXISTS idx_scraping_stats_platform 
  ON scraping_stats(platform, date DESC);

CREATE INDEX IF NOT EXISTS idx_scraping_stats_method 
  ON scraping_stats(scraping_method, date DESC);

-- Comment
COMMENT ON TABLE scraping_stats IS 'Daily aggregated statistics for scraping performance and cost monitoring';

-- ============================================
-- 4. HELPER FUNCTIONS
-- ============================================

-- Calculate success rate for a platform
CREATE OR REPLACE FUNCTION get_platform_success_rate(
  p_platform TEXT,
  p_days INT DEFAULT 7
)
RETURNS FLOAT AS $$
DECLARE
  success_count INT;
  total_count INT;
BEGIN
  -- Count successful scrapes
  SELECT COUNT(*) INTO success_count
  FROM job_queue
  WHERE platform = p_platform
    AND scraped_at > NOW() - (p_days || ' days')::INTERVAL
    AND status != 'failed';
  
  -- Count total attempts (including failures)
  SELECT COUNT(*) INTO total_count
  FROM job_queue
  WHERE platform = p_platform
    AND scraped_at > NOW() - (p_days || ' days')::INTERVAL;
  
  -- Add failed attempts
  SELECT total_count + COUNT(*) INTO total_count
  FROM failed_scrapes
  WHERE platform = p_platform
    AND timestamp > NOW() - (p_days || ' days')::INTERVAL;
  
  -- Calculate success rate
  IF total_count > 0 THEN
    RETURN (success_count::FLOAT / total_count::FLOAT) * 100;
  ELSE
    RETURN NULL;
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_platform_success_rate IS 'Calculate success rate for a platform over N days';

-- Get average scraping duration by method
CREATE OR REPLACE FUNCTION get_avg_scraping_duration(
  p_scraping_method TEXT,
  p_days INT DEFAULT 7
)
RETURNS FLOAT AS $$
BEGIN
  RETURN (
    SELECT AVG(scraping_duration_seconds)
    FROM job_queue
    WHERE scraping_method = p_scraping_method
      AND scraped_at > NOW() - (p_days || ' days')::INTERVAL
      AND scraping_duration_seconds IS NOT NULL
  );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_avg_scraping_duration IS 'Calculate average scraping duration for a method over N days';

-- Aggregate daily stats (run daily via cron)
CREATE OR REPLACE FUNCTION aggregate_daily_scraping_stats()
RETURNS void AS $$
DECLARE
  yesterday DATE := CURRENT_DATE - 1;
BEGIN
  -- Insert or update stats for yesterday
  INSERT INTO scraping_stats (
    date,
    platform,
    scraping_method,
    total_attempts,
    successful_scrapes,
    failed_scrapes,
    avg_duration_seconds,
    p50_duration_seconds,
    p95_duration_seconds,
    p99_duration_seconds
  )
  SELECT
    yesterday,
    platform,
    scraping_method,
    COUNT(*) AS total_attempts,
    COUNT(*) FILTER (WHERE status != 'failed') AS successful_scrapes,
    COUNT(*) FILTER (WHERE status = 'failed') AS failed_scrapes,
    AVG(scraping_duration_seconds) AS avg_duration_seconds,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY scraping_duration_seconds) AS p50,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY scraping_duration_seconds) AS p95,
    PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY scraping_duration_seconds) AS p99
  FROM job_queue
  WHERE DATE(scraped_at) = yesterday
    AND platform IS NOT NULL
    AND scraping_method IS NOT NULL
  GROUP BY platform, scraping_method
  ON CONFLICT (date, platform, scraping_method)
  DO UPDATE SET
    total_attempts = EXCLUDED.total_attempts,
    successful_scrapes = EXCLUDED.successful_scrapes,
    failed_scrapes = EXCLUDED.failed_scrapes,
    avg_duration_seconds = EXCLUDED.avg_duration_seconds,
    p50_duration_seconds = EXCLUDED.p50_duration_seconds,
    p95_duration_seconds = EXCLUDED.p95_duration_seconds,
    p99_duration_seconds = EXCLUDED.p99_duration_seconds,
    updated_at = NOW();
  
  -- Also aggregate from failed_scrapes table
  INSERT INTO scraping_stats (
    date,
    platform,
    scraping_method,
    total_attempts,
    failed_scrapes
  )
  SELECT
    yesterday,
    platform,
    scraping_method,
    COUNT(*) AS total_attempts,
    COUNT(*) AS failed_scrapes
  FROM failed_scrapes
  WHERE DATE(timestamp) = yesterday
    AND platform IS NOT NULL
    AND scraping_method IS NOT NULL
  GROUP BY platform, scraping_method
  ON CONFLICT (date, platform, scraping_method)
  DO UPDATE SET
    total_attempts = scraping_stats.total_attempts + EXCLUDED.total_attempts,
    failed_scrapes = scraping_stats.failed_scrapes + EXCLUDED.failed_scrapes,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION aggregate_daily_scraping_stats IS 'Aggregate scraping stats for previous day (run daily via cron)';

-- Schedule daily aggregation (3 AM)
SELECT cron.schedule(
  'aggregate-scraping-stats',
  '0 3 * * *',
  'SELECT aggregate_daily_scraping_stats()'
);

-- ============================================
-- 5. CLEANUP OLD FAILED SCRAPES (OPTIONAL)
-- ============================================

-- Auto-cleanup failed scrapes older than 90 days
CREATE OR REPLACE FUNCTION cleanup_old_failed_scrapes()
RETURNS void AS $$
BEGIN
  DELETE FROM failed_scrapes
  WHERE timestamp < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_old_failed_scrapes IS 'Delete failed scrapes older than 90 days';

-- Schedule monthly cleanup (1st of month, 4 AM)
SELECT cron.schedule(
  'cleanup-failed-scrapes',
  '0 4 1 * *',
  'SELECT cleanup_old_failed_scrapes()'
);

-- ============================================
-- 6. UPDATE SCHEMA VERSION
-- ============================================

INSERT INTO schema_version (version)
VALUES ('3.1-scraping-v2')
ON CONFLICT (version) DO NOTHING;

-- ============================================
-- 7. VERIFICATION QUERIES (FOR TESTING)
-- ============================================

-- Verify new columns exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'job_queue'
    AND column_name = 'scraping_method'
  ) THEN
    RAISE EXCEPTION 'Migration failed: scraping_method column not created';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_name = 'failed_scrapes'
  ) THEN
    RAISE EXCEPTION 'Migration failed: failed_scrapes table not created';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_name = 'scraping_stats'
  ) THEN
    RAISE EXCEPTION 'Migration failed: scraping_stats table not created';
  END IF;
  
  RAISE NOTICE 'Migration 002 completed successfully!';
END $$;
