# Database Migrations

This directory contains SQL migration files for the Job Automation SaaS database schema.

## Migration Files

### 001_initial_schema.sql
**Status:** ✅ Applied (Baseline)

Initial database schema with:
- User management (consent, profiles)
- Document management (CVs, cover letters)
- Job queue & automation
- Company research cache
- Application history tracking
- Form selectors (learning system)
- Generation logs (AI audit)

### 002_scraping_v2_schema.sql
**Status:** 🆕 NEW - Needs to be applied

Scraping V2 schema with:
- Extended `job_queue` with scraping metadata
- New `failed_scrapes` table for error tracking
- New `scraping_stats` table for monitoring
- Helper functions for analytics
- Automated daily stats aggregation

---

## How to Apply Migrations

### Option 1: Supabase Dashboard (Recommended)

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Copy the contents of `002_scraping_v2_schema.sql`
4. Paste into SQL Editor
5. Click **Run**
6. Verify success message: "Migration 002 completed successfully!"

### Option 2: Supabase CLI

```bash
# Login to Supabase
supabase login

# Link your project
supabase link --project-ref YOUR_PROJECT_REF

# Apply migration
supabase db push --include-all

# Or manually run the file
supabase db execute -f database/migrations/002_scraping_v2_schema.sql
```

### Option 3: psql (Direct Database Connection)

```bash
# Connect to your Supabase database
psql "postgresql://postgres:[YOUR_PASSWORD]@[YOUR_PROJECT].supabase.co:5432/postgres"

# Run migration
\i database/migrations/002_scraping_v2_schema.sql

# Verify
SELECT * FROM schema_version;
```

---

## Verification

After applying migration 002, verify with these queries:

```sql
-- Check schema version
SELECT * FROM schema_version ORDER BY applied_at DESC;
-- Expected: version = '3.1-scraping-v2'

-- Check new columns in job_queue
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'job_queue'
  AND column_name IN (
    'scraping_method',
    'scraping_duration_seconds',
    'description_markdown',
    'scraped_at',
    'raw_data'
  );
-- Expected: 5 rows

-- Check new tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_name IN ('failed_scrapes', 'scraping_stats');
-- Expected: 2 rows

-- Check cron jobs
SELECT jobname, schedule, command
FROM cron.job
WHERE jobname IN ('aggregate-scraping-stats', 'cleanup-failed-scrapes');
-- Expected: 2 rows
```

---

## Rollback (If Needed)

If you need to rollback migration 002:

```sql
-- Drop new tables
DROP TABLE IF EXISTS scraping_stats CASCADE;
DROP TABLE IF EXISTS failed_scrapes CASCADE;

-- Remove new columns from job_queue
ALTER TABLE job_queue
  DROP COLUMN IF EXISTS source,
  DROP COLUMN IF EXISTS scraping_method,
  DROP COLUMN IF EXISTS scraping_duration_seconds,
  DROP COLUMN IF EXISTS scraped_at,
  DROP COLUMN IF EXISTS description_markdown,
  DROP COLUMN IF EXISTS apply_url,
  DROP COLUMN IF EXISTS department,
  DROP COLUMN IF EXISTS employment_type,
  DROP COLUMN IF EXISTS seniority_level,
  DROP COLUMN IF EXISTS posted_date,
  DROP COLUMN IF EXISTS raw_data;

-- Drop helper functions
DROP FUNCTION IF EXISTS get_platform_success_rate(TEXT, INT);
DROP FUNCTION IF EXISTS get_avg_scraping_duration(TEXT, INT);
DROP FUNCTION IF EXISTS aggregate_daily_scraping_stats();
DROP FUNCTION IF EXISTS cleanup_old_failed_scrapes();

-- Remove cron jobs
SELECT cron.unschedule('aggregate-scraping-stats');
SELECT cron.unschedule('cleanup-failed-scrapes');

-- Remove schema version entry
DELETE FROM schema_version WHERE version = '3.1-scraping-v2';
```

---

## New Tables Overview

### `failed_scrapes`
Logs all failed scraping attempts for debugging and monitoring.

**Columns:**
- `id`: UUID primary key
- `url`: Job URL that failed to scrape
- `platform`: Detected platform (linkedin, indeed, etc.)
- `scraping_method`: Which scraper attempted (bright_data, patchright, etc.)
- `error`: Error message
- `retry_count`: Number of retry attempts
- `pillar`: manual or automation
- `user_id`: User who triggered the scrape
- `duration_seconds`: Time taken before failure
- `error_details`: JSONB with stack trace, HTTP status, etc.
- `timestamp`: When the failure occurred

**Usage:**
```sql
-- Get failure rate by platform (last 7 days)
SELECT
  platform,
  COUNT(*) AS failures,
  AVG(duration_seconds) AS avg_duration
FROM failed_scrapes
WHERE timestamp > NOW() - INTERVAL '7 days'
GROUP BY platform
ORDER BY failures DESC;
```

### `scraping_stats`
Daily aggregated statistics for scraping performance and cost monitoring.

**Columns:**
- `id`: UUID primary key
- `date`: Aggregation date
- `platform`: Platform name
- `scraping_method`: Scraper used
- `total_attempts`: Total scraping attempts
- `successful_scrapes`: Number of successes
- `failed_scrapes`: Number of failures
- `avg_duration_seconds`: Average duration
- `p50_duration_seconds`: Median duration
- `p95_duration_seconds`: 95th percentile duration
- `p99_duration_seconds`: 99th percentile duration
- `total_cost_usd`: Estimated total cost
- `cost_per_job_usd`: Cost per successful job
- `timeout_count`: Number of timeout errors
- `anti_bot_block_count`: Number of anti-bot blocks
- `parsing_error_count`: Number of parsing errors
- `other_error_count`: Other errors

**Usage:**
```sql
-- Get success rate by platform (last 30 days)
SELECT
  platform,
  SUM(total_attempts) AS attempts,
  SUM(successful_scrapes) AS successes,
  ROUND(
    (SUM(successful_scrapes)::FLOAT / SUM(total_attempts)::FLOAT * 100),
    2
  ) AS success_rate_pct
FROM scraping_stats
WHERE date > CURRENT_DATE - 30
GROUP BY platform
ORDER BY success_rate_pct DESC;
```

---

## Helper Functions

### `get_platform_success_rate(platform, days)`
Calculate success rate for a platform over N days.

```sql
-- LinkedIn success rate (last 7 days)
SELECT get_platform_success_rate('linkedin', 7) AS linkedin_success_rate;
```

### `get_avg_scraping_duration(method, days)`
Calculate average scraping duration for a method over N days.

```sql
-- Average duration for Bright Data (last 7 days)
SELECT get_avg_scraping_duration('bright_data', 7) AS avg_bright_data_duration;
```

### `aggregate_daily_scraping_stats()`
Aggregate scraping stats for the previous day. Runs automatically via cron at 3 AM.

```sql
-- Manually trigger aggregation
SELECT aggregate_daily_scraping_stats();
```

### `cleanup_old_failed_scrapes()`
Delete failed scrapes older than 90 days. Runs automatically on 1st of each month at 4 AM.

```sql
-- Manually trigger cleanup
SELECT cleanup_old_failed_scrapes();
```

---

## Questions?

If you encounter issues:
1. Check Supabase logs in Dashboard → Database → Logs
2. Verify pg_cron extension is enabled: `CREATE EXTENSION IF NOT EXISTS pg_cron;`
3. Check for permission issues with RLS policies
4. Review error messages in the verification queries above
