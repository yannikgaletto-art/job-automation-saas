# Phase 1: Database Setup (15 minutes)

## Prerequisites
- Supabase project running
- PostgreSQL access (via SQL Editor or psql)
- Migration 008 already committed to repo

---

## Step 1.1: Run Migration

### Option A: Via SQL Editor (Recommended)

1. Open Supabase Dashboard
2. Navigate to SQL Editor
3. Click "New Query"
4. Copy entire contents of `database/migrations/008_add_company_intel_fields.sql`
5. Paste and click "Run"

### Option B: Via psql

```bash
# Get your connection string from Supabase Dashboard
psql "postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT].supabase.co:5432/postgres"

# Run migration
\i database/migrations/008_add_company_intel_fields.sql

# Verify tables
\d job_queue
\d company_research
```

---

## Step 1.2: Verify New Columns

```sql
-- Check job_queue new columns
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'job_queue' 
AND column_name LIKE '%enrichment%';
```

**Expected Output:**
```
           column_name            | data_type
----------------------------------+-----------
enrichment_status                 | text
company_research_id               | uuid
enrichment_attempted_at           | timestamptz
enrichment_completed_at           | timestamptz
enrichment_fallback_reason        | text
```

---

## Step 1.3: Verify Indexes

```sql
-- Check that new indexes exist
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename IN ('job_queue', 'company_research')
AND (indexname LIKE '%enrichment%' OR indexname LIKE '%cache%');
```

**Expected Output:**
```
idx_job_queue_enrichment_pending
idx_company_research_cache
idx_company_research_confidence
```

---

## Step 1.4: Test Helper Functions

```sql
-- Test cache lookup function
SELECT * FROM get_fresh_company_research('tesla');

-- Should return Tesla sample data (seeded in migration)
-- Or NULL if you haven't seeded data yet
```

---

## Step 1.5: Verify Sample Data

```sql
-- Check that Tesla seed data was inserted
SELECT 
  company_name,
  confidence_score,
  array_length(recent_news, 1) as news_count,
  array_length(company_values, 1) as values_count
FROM company_research
WHERE company_slug = 'tesla';
```

**Expected Output:**
```
company_name | confidence_score | news_count | values_count
-------------+------------------+------------+-------------
Tesla Inc.   | 0.95             | 3          | 3
```

---

## Step 1.6: Test Enrichment Stats View

```sql
-- This view aggregates enrichment performance
SELECT * FROM enrichment_stats;
```

**Expected Output (empty database):**
```
total_jobs              | 0
enriched_count          | 0
no_data_count           | 0
failed_count            | 0
success_rate_percent    | NULL
avg_confidence_score    | NULL
```

---

## Troubleshooting

### Error: "relation company_research does not exist"

**Cause:** Migration didn't run completely

**Fix:**
```sql
-- Check if table exists
SELECT tablename FROM pg_tables WHERE tablename = 'company_research';

-- If not found, re-run migration
```

### Error: "column enrichment_status does not exist"

**Cause:** Migration ran partially

**Fix:**
```sql
-- Rollback and re-run
ALTER TABLE job_queue DROP COLUMN IF EXISTS enrichment_status CASCADE;
-- Then re-run full migration
```

### Error: "function get_fresh_company_research does not exist"

**Cause:** Helper functions didn't install

**Fix:**
```sql
-- List functions
SELECT proname FROM pg_proc WHERE proname LIKE '%company%';

-- If missing, check migration Part 6 (Helper Functions) ran
```

---

## Success Criteria

✅ All checks pass:
- [ ] `job_queue` has 5 new enrichment columns
- [ ] `company_research` has 8 new fields
- [ ] 3 new indexes exist
- [ ] `get_fresh_company_research()` function works
- [ ] `enrichment_stats` view returns data
- [ ] Tesla sample data is present

**Next:** [Phase 2 - Supabase Client Helpers](./02_SUPABASE_HELPERS.md)
