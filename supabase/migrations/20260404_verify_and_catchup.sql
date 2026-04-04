-- ============================================================================
-- VERIFICATION & CATCH-UP Migration — 2026-04-04
-- Purpose: Ensure ALL migrations from the last 7 days are deployed.
-- Safe: All statements use IF NOT EXISTS / IF EXISTS guards.
-- Run this in Supabase SQL Editor to catch any missing tables/columns.
-- ============================================================================

-- ─── 1. Quotes Table (20260329) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.quotes (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  category    TEXT NOT NULL,
  theme       TEXT NOT NULL,
  person      TEXT NOT NULL,
  quote_en    TEXT NOT NULL,
  quote_de    TEXT,
  use_case    TEXT,
  source      TEXT,
  approved    BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS quotes_theme_fts_idx
  ON public.quotes USING gin(to_tsvector('german', coalesce(theme, '')));
CREATE INDEX IF NOT EXISTS quotes_category_idx ON public.quotes (category);
CREATE UNIQUE INDEX IF NOT EXISTS quotes_dedup_idx
  ON public.quotes (lower(person), left(quote_en, 80));

ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "quotes_read_approved" ON public.quotes;
CREATE POLICY "quotes_read_approved"
  ON public.quotes FOR SELECT USING (approved = true);

CREATE OR REPLACE FUNCTION public.search_quotes(
  search_query TEXT, result_category TEXT DEFAULT NULL, max_results INT DEFAULT 5
) RETURNS SETOF public.quotes LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT * FROM public.quotes
  WHERE approved = true AND (
    to_tsvector('german', coalesce(theme, '')) @@ websearch_to_tsquery('german', search_query)
    OR (result_category IS NOT NULL AND category ILIKE '%' || result_category || '%')
  )
  ORDER BY
    CASE WHEN to_tsvector('german', coalesce(theme, '')) @@ websearch_to_tsquery('german', search_query)
         THEN 0 ELSE 1 END,
    ts_rank(to_tsvector('german', coalesce(theme, '')), websearch_to_tsquery('german', search_query)) DESC
  LIMIT max_results;
$$;

-- ─── 2. User Feedback (20260330) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_feedback (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feedback    TEXT NOT NULL CHECK (char_length(feedback) >= 10 AND char_length(feedback) <= 5000),
  name        TEXT,
  locale      TEXT DEFAULT 'de' CHECK (locale IN ('de', 'en', 'es')),
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_feedback_created ON user_feedback (created_at DESC);
ALTER TABLE user_feedback ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_can_insert_own_feedback" ON user_feedback;
CREATE POLICY "users_can_insert_own_feedback"
  ON user_feedback FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ─── 3. Application History CRM Columns (20260403) ────────────────────
ALTER TABLE application_history
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'applied'
    CHECK (status IN ('applied', 'follow_up_sent', 'interviewing', 'offer_received', 'rejected', 'ghosted')),
  ADD COLUMN IF NOT EXISTS next_action_date DATE,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS rejection_tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS contact_name TEXT,
  ADD COLUMN IF NOT EXISTS learnings TEXT;

CREATE INDEX IF NOT EXISTS idx_application_history_next_action
  ON application_history (user_id, next_action_date) WHERE next_action_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_application_history_status
  ON application_history (user_id, status);

-- ─── 4. Waitlist Leads (20260403) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS waitlist_leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    source TEXT DEFAULT 'website',
    locale TEXT DEFAULT 'de',
    ip_hash TEXT,
    utm_source TEXT,
    confirmation_token UUID DEFAULT gen_random_uuid(),
    confirmed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT waitlist_leads_email_unique UNIQUE (email)
);
CREATE INDEX IF NOT EXISTS idx_waitlist_leads_created ON waitlist_leads(created_at DESC);
ALTER TABLE waitlist_leads ENABLE ROW LEVEL SECURITY;

-- ─── 5. Credits: Update to 10 (was 15) ────────────────────────────────
-- Update trigger function for NEW users
CREATE OR REPLACE FUNCTION create_user_credits()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    INSERT INTO user_credits (
        user_id, plan_type,
        credits_total, coaching_sessions_total, job_searches_total
    ) VALUES (
        NEW.id, 'free',
        10.0,   -- Production: 10 credits
        5,      -- 5 coaching sessions
        10      -- 10 job searches
    ) ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END; $$;

-- Update EXISTING free users: 15 → 10
UPDATE user_credits
SET credits_total = 10.0
WHERE plan_type = 'free' AND credits_total = 15.0;

-- ─── 6. Seed credits for ALL existing users who are missing rows ───────
INSERT INTO user_credits (user_id, plan_type, credits_total, coaching_sessions_total, job_searches_total)
SELECT id, 'free', 10.0, 5, 10
FROM auth.users
WHERE id NOT IN (SELECT user_id FROM user_credits)
ON CONFLICT (user_id) DO NOTHING;

-- ─── VERIFICATION QUERIES (run these to confirm) ──────────────────────
-- SELECT count(*) as total_rows FROM user_credits;
-- SELECT * FROM user_credits LIMIT 5;
-- SELECT count(*) as quotes_count FROM quotes;
-- SELECT count(*) as feedback_count FROM user_feedback;
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'application_history' AND column_name IN ('status', 'next_action_date', 'notes');
-- SELECT count(*) as waitlist_count FROM waitlist_leads;
