# Cache Management Policy

**Version:** 1.0  
**Last Updated:** 2026-02-14

## Overview

To reduce API costs (Perplexity) and improve performance, company research data is cached for **7 days**. This document outlines the caching strategy, monitoring, and cleanup procedures.

## 1. Caching Strategy

- **TTL (Time To Live):** 7 days
- **Storage:** `company_research` table in Supabase
- **Key:** `company_name` (Unique)
- **Expiry:** `expires_at` column (set to `NOW() + INTERVAL '7 days'` on insert)

### Logic
1. **Read:** `enrichCompany(name)` checks if a record exists where `expires_at > NOW()`.
2. **Write:** Successful fetches from Perplexity are saved with a fresh 7-day TTL.
3. **Invalidation:** Passing `forceRefresh=true` to `enrichCompany` bypasses the cache.

## 2. Automatic Cleanup

We use `pg_cron` to automatically delete expired records.

### Schedule
- **Frequency:** Daily at 02:00 UTC
- **Command:** `SELECT cleanup_expired_research()`
- **Cron Expression:** `0 2 * * *`

### Verification
To verify the job is scheduled, run this SQL in Supabase:
```sql
SELECT * FROM cron.job;
```

## 3. Manual Cleanup

If `pg_cron` is disabled or failing, you can manually trigger cleanup via the Supabase SQL Editor:
```sql
SELECT cleanup_expired_research();
```

## 4. Monitoring

Cache hit rates and estimated savings are tracked in-memory and exposed via the Admin Cost Report API.

- **Endpoint:** `GET /api/admin/cost-report`
- **Stats:**
  - `hits`: Number of times cache was used
  - `misses`: Number of times API was called
  - `hitRate`: Percentage of requests served from cache
  - `estimatedSavings`: Amount saved (assuming €0.02 per API call)

> **Note:** Stats are in-memory and reset when the server restarts (e.g., on deployment).
