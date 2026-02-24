-- ============================================
-- Job Search Pipeline Columns (JOB_SEARCH_SPEC.md)
-- Adds search/pipeline fields to existing job_queue table
-- ============================================

-- Source tracking
ALTER TABLE public.job_queue ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';
ALTER TABLE public.job_queue ADD COLUMN IF NOT EXISTS search_query TEXT;
ALTER TABLE public.job_queue ADD COLUMN IF NOT EXISTS apply_link TEXT;

-- SerpAPI raw data
ALTER TABLE public.job_queue ADD COLUMN IF NOT EXISTS serpapi_raw JSONB;

-- Firecrawl output
ALTER TABLE public.job_queue ADD COLUMN IF NOT EXISTS firecrawl_markdown TEXT;

-- Harvester (GPT-4o-mini) structured extraction
ALTER TABLE public.job_queue ADD COLUMN IF NOT EXISTS work_model TEXT;
ALTER TABLE public.job_queue ADD COLUMN IF NOT EXISTS contract_type TEXT;
ALTER TABLE public.job_queue ADD COLUMN IF NOT EXISTS experience_years_min INTEGER;
ALTER TABLE public.job_queue ADD COLUMN IF NOT EXISTS experience_years_max INTEGER;
ALTER TABLE public.job_queue ADD COLUMN IF NOT EXISTS experience_level_stated TEXT;
ALTER TABLE public.job_queue ADD COLUMN IF NOT EXISTS hard_requirements TEXT[];
ALTER TABLE public.job_queue ADD COLUMN IF NOT EXISTS soft_requirements TEXT[];
ALTER TABLE public.job_queue ADD COLUMN IF NOT EXISTS tasks TEXT[];
ALTER TABLE public.job_queue ADD COLUMN IF NOT EXISTS about_company_raw TEXT;
ALTER TABLE public.job_queue ADD COLUMN IF NOT EXISTS mission_statement_raw TEXT;
ALTER TABLE public.job_queue ADD COLUMN IF NOT EXISTS diversity_section_raw TEXT;
ALTER TABLE public.job_queue ADD COLUMN IF NOT EXISTS sustainability_section_raw TEXT;
ALTER TABLE public.job_queue ADD COLUMN IF NOT EXISTS leadership_signals_raw TEXT;
ALTER TABLE public.job_queue ADD COLUMN IF NOT EXISTS tech_stack_mentioned TEXT[];
ALTER TABLE public.job_queue ADD COLUMN IF NOT EXISTS ats_keywords TEXT[];
ALTER TABLE public.job_queue ADD COLUMN IF NOT EXISTS application_deadline TEXT;

-- Judge (Claude 3.5 Sonnet) scoring
ALTER TABLE public.job_queue ADD COLUMN IF NOT EXISTS match_score_overall INTEGER;
ALTER TABLE public.job_queue ADD COLUMN IF NOT EXISTS score_breakdown JSONB;
ALTER TABLE public.job_queue ADD COLUMN IF NOT EXISTS judge_reasoning TEXT;
ALTER TABLE public.job_queue ADD COLUMN IF NOT EXISTS recommendation TEXT;
ALTER TABLE public.job_queue ADD COLUMN IF NOT EXISTS red_flags TEXT[];
ALTER TABLE public.job_queue ADD COLUMN IF NOT EXISTS green_flags TEXT[];
ALTER TABLE public.job_queue ADD COLUMN IF NOT EXISTS knockout_reason TEXT;

-- ============================================
-- User Values table for soft-filter preferences
-- ============================================
CREATE TABLE IF NOT EXISTS public.user_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,

  -- Hard preferences
  preferred_job_titles TEXT[],
  preferred_locations TEXT[],

  -- Soft filter preferences
  experience_level TEXT,
  company_values TEXT[],
  preferred_org_type TEXT[],
  diversity_important BOOLEAN DEFAULT false,
  sustainability_important BOOLEAN DEFAULT false,
  leadership_style_pref INTEGER,
  innovation_level_pref INTEGER,
  purpose_keywords TEXT[],

  -- Knockout criteria
  no_go_org_types TEXT[],
  max_commute_minutes INTEGER,
  min_remote_days INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for user_values
ALTER TABLE public.user_values ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own values" ON public.user_values
  FOR ALL USING (auth.uid() = user_id);

-- Performance index for search results
CREATE INDEX IF NOT EXISTS idx_job_queue_search_query
  ON public.job_queue (user_id, search_query)
  WHERE source = 'search';

CREATE INDEX IF NOT EXISTS idx_job_queue_match_score
  ON public.job_queue (user_id, match_score_overall DESC NULLS LAST)
  WHERE source = 'search';
