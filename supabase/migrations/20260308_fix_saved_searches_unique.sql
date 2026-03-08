-- Migration: Fix unique constraint on saved_job_searches
--
-- Problem: upsert with onConflict:'user_id,query,location' silently INSERTs duplicates
-- because the index was declared as a regular index, not a UNIQUE constraint.
-- enforceMaxSearches(10) then deletes older rows first → user loses their search results on navigation.
--
-- Fix: Deduplicate existing rows, then enforce the real UNIQUE constraint.

-- Step 1: Remove duplicate rows (keep newest per user+query+location combination)
DELETE FROM saved_job_searches
WHERE id NOT IN (
    SELECT DISTINCT ON (user_id, query, location) id
    FROM saved_job_searches
    ORDER BY user_id, query, location, fetched_at DESC
);

-- Step 2: Drop the non-unique index if it exists (was created without UNIQUE keyword)
DROP INDEX IF EXISTS idx_search_user_query;

-- Step 3: Add a proper UNIQUE constraint (enables Supabase upsert with onConflict)
ALTER TABLE saved_job_searches
    ADD CONSTRAINT IF NOT EXISTS uq_saved_searches_user_query_location
    UNIQUE (user_id, query, location);

-- Step 4: Add the search_mode column if not present (used by query route)
ALTER TABLE saved_job_searches
    ADD COLUMN IF NOT EXISTS search_mode TEXT DEFAULT 'keyword';
