-- Migration 014: Add unique constraint to saved_job_searches
-- 
-- Problem: upsert with onConflict: 'user_id,query,location' silently INSERTs duplicates
-- because no UNIQUE constraint exists on these columns. This causes:
-- 1. Duplicate searches piling up
-- 2. enforceMaxSearches(10) deleting OLDER searches
-- 3. User loses their previous searches on navigation
--
-- Fix: First deduplicate existing rows (keep newest), then add unique constraint.

-- Step 1: Remove duplicate rows, keeping only the newest per (user_id, query, location)
DELETE FROM saved_job_searches
WHERE id NOT IN (
    SELECT DISTINCT ON (user_id, query, location) id
    FROM saved_job_searches
    ORDER BY user_id, query, location, fetched_at DESC
);

-- Step 2: Add the unique constraint
ALTER TABLE saved_job_searches
ADD CONSTRAINT uq_saved_searches_user_query_location 
UNIQUE (user_id, query, location);
