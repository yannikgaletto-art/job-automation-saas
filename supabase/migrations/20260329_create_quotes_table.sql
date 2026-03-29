-- ============================================================================
-- Migration: quotes table for curated cover letter quotes
-- Created: 2026-03-29
-- Purpose: Replace AI-generated quotes (Claude Sonnet one-shot) with a
--          deterministic, CSV-seeded database of curated industry quotes.
-- Idempotent: YES — safe to run multiple times.
-- ============================================================================

-- 1. Table
CREATE TABLE IF NOT EXISTS public.quotes (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  category    TEXT NOT NULL,        -- e.g. "IT_Tech_Software_SaaS" (from CSV filename)
  theme       TEXT NOT NULL,        -- e.g. "Zukunftsgestaltung" (from CSV "Thema" column)
  person      TEXT NOT NULL,        -- e.g. "Peter Drucker"
  quote_en    TEXT NOT NULL,        -- Original English quote
  quote_de    TEXT,                 -- German translation (nullable — some CSVs may lack it)
  use_case    TEXT,                 -- Free-text usage hint from CSV (human curation only)
  source      TEXT,                 -- e.g. "TED Talk 2014", "Managing for Business Effectiveness"
  approved    BOOLEAN DEFAULT true, -- Gate for RLS; seeded quotes are pre-approved
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- 2. Indexes
-- FTS on theme (primary search vector — industry keywords)
CREATE INDEX IF NOT EXISTS quotes_theme_fts_idx
  ON public.quotes
  USING gin(to_tsvector('german', coalesce(theme, '')));

-- Category lookup (fallback search path)
CREATE INDEX IF NOT EXISTS quotes_category_idx
  ON public.quotes (category);

-- Dedup constraint: same person + same quote start = duplicate
CREATE UNIQUE INDEX IF NOT EXISTS quotes_dedup_idx
  ON public.quotes (lower(person), left(quote_en, 80));

-- 3. Row Level Security
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quotes_read_approved" ON public.quotes;
CREATE POLICY "quotes_read_approved"
  ON public.quotes FOR SELECT
  USING (approved = true);

-- 4. Search RPC function (correct FTS via websearch_to_tsquery)
-- SECURITY DEFINER: runs with table owner privileges to bypass RLS for the
-- internal query, but the WHERE clause enforces approved = true anyway.
CREATE OR REPLACE FUNCTION public.search_quotes(
  search_query TEXT,
  result_category TEXT DEFAULT NULL,
  max_results INT DEFAULT 5
)
RETURNS SETOF public.quotes
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT *
  FROM public.quotes
  WHERE approved = true
    AND (
      -- Primary: FTS on theme
      to_tsvector('german', coalesce(theme, '')) @@ websearch_to_tsquery('german', search_query)
      -- Secondary: category filter (when provided)
      OR (result_category IS NOT NULL AND category ILIKE '%' || result_category || '%')
    )
  ORDER BY
    -- Prioritize FTS matches over category-only matches
    CASE WHEN to_tsvector('german', coalesce(theme, '')) @@ websearch_to_tsquery('german', search_query)
         THEN 0 ELSE 1 END,
    ts_rank(
      to_tsvector('german', coalesce(theme, '')),
      websearch_to_tsquery('german', search_query)
    ) DESC
  LIMIT max_results;
$$;
