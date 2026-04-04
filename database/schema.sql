-- ============================================
-- PATHLY V2.0 DATABASE SCHEMA
-- Version: 4.1
-- Last Updated: 2026-03-20
-- DSGVO & NIS2 Compliant
--
-- ⚠️ AUTORITÄRE QUELLE FÜR LIVE-SCHEMA: supabase/migrations/
--    Diese Datei ist ein konsolidierter Snapshot für Referenz.
--    Bei Abweichungen gilt IMMER das, was in den Migrations steht.
-- ============================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_cron";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For fuzzy search

-- ============================================
-- 1. USER & CONSENT MANAGEMENT
-- ============================================

-- Consent History (DSGVO Art. 7)
CREATE TABLE IF NOT EXISTS consent_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  document_type TEXT NOT NULL CHECK (document_type IN (
    'privacy_policy', 'terms_of_service', 'ai_processing', 'cookies', 'coaching_ai'
  )),
  document_version TEXT NOT NULL, -- e.g. 'v1.2'

  consent_given BOOLEAN NOT NULL,
  ip_address INET,
  user_agent TEXT,

  consented_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, document_type, document_version)
);

CREATE INDEX IF NOT EXISTS idx_consent_history_user ON consent_history(user_id);

-- User Profiles (Extended)
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Encrypted PII (name, email, phone, address)
  pii_encrypted BYTEA NOT NULL,
  encryption_key_version INT DEFAULT 1,

  -- Non-sensitive metadata
  preferred_cv_template TEXT DEFAULT 'notion_modern',
  cv_original_file_path TEXT,
  onboarding_completed BOOLEAN DEFAULT FALSE,
  subscription_tier TEXT DEFAULT 'free' CHECK (subscription_tier IN ('free', 'starter', 'pro')),

  -- CV SSoT (added Migration 20260221164808)
  cv_structured_data JSONB,

  -- Focus Mode preference (added Migration 20260225010000)
  skip_focus_confirmation BOOLEAN DEFAULT false,

  -- Onboarding Goals (added Migration 20260320)
  onboarding_goals TEXT[] DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_user_profiles_updated_at ON user_profiles;
CREATE TRIGGER trigger_user_profiles_updated_at
BEFORE UPDATE ON user_profiles
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only access their own profile"
  ON user_profiles FOR ALL
  USING (auth.uid() = id);

-- User Settings (Onboarding & CV State — added Migration 20260228)
CREATE TABLE IF NOT EXISTS user_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,

  -- Onboarding
  onboarding_completed BOOLEAN DEFAULT false,
  onboarding_step INTEGER DEFAULT 0,
  onboarding_completed_at TIMESTAMPTZ,

  -- Mood Check-in
  last_mood_checkin_at TIMESTAMPTZ,

  -- Active CV tracking
  active_cv_id UUID,
  active_cv_name TEXT,
  active_cv_uploaded_at TIMESTAMPTZ,

  -- Settings Profile Fields (added Migration 20260305)
  linkedin_url TEXT,
  target_role TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_settings" ON user_settings FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- 2. DOCUMENT MANAGEMENT
-- ============================================

CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  document_type TEXT NOT NULL CHECK (document_type IN ('cv', 'cover_letter', 'reference')),

  -- PII data (Migration 012: changed from BYTEA to JSONB)
  pii_encrypted JSONB,

  -- Metadata (skills, experience, etc.)
  metadata JSONB,

  -- Writing Style Embedding (for cover letters)
  writing_style_embedding VECTOR(1536), -- OpenAI/Anthropic embeddings

  -- Storage URL (encrypted)
  file_url_encrypted TEXT NOT NULL,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_user ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(document_type);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only access their own documents"
  ON documents FOR ALL
  USING (auth.uid() = user_id);

-- ============================================
-- 3. JOB QUEUE & AUTOMATION
-- ============================================

-- Auto Search Configs
CREATE TABLE IF NOT EXISTS auto_search_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  keywords TEXT NOT NULL,
  location TEXT,
  salary_min INT,
  salary_max INT,

  blacklist_keywords TEXT[],
  blacklist_companies TEXT[],

  max_applications_per_day INT DEFAULT 10,
  daily_count INT DEFAULT 0,
  last_reset_at TIMESTAMPTZ DEFAULT NOW(),

  status TEXT CHECK (status IN ('active', 'paused')) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auto_search_configs_user ON auto_search_configs(user_id);
ALTER TABLE auto_search_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only access their own configs"
  ON auto_search_configs FOR ALL
  USING (auth.uid() = user_id);

-- Search Trigger Queue
CREATE TABLE IF NOT EXISTS search_trigger_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id UUID REFERENCES auto_search_configs(id) ON DELETE CASCADE,

  status TEXT CHECK (status IN ('pending', 'processing', 'completed', 'failed')) DEFAULT 'pending',

  scheduled_for TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  error_message TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_search_trigger_queue_status ON search_trigger_queue(status);
CREATE INDEX IF NOT EXISTS idx_search_trigger_queue_scheduled ON search_trigger_queue(scheduled_for)
  WHERE status = 'pending';

-- Job Queue (Robust) — UPDATED with all migrations applied
CREATE TABLE IF NOT EXISTS job_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  search_config_id UUID REFERENCES auto_search_configs(id),

  -- Job Details (Migration 011: company → company_name)
  job_url TEXT NOT NULL,
  job_title TEXT,
  company_name TEXT,
  company_slug TEXT GENERATED ALWAYS AS (
    lower(regexp_replace(company_name, '[^a-zA-Z0-9]+', '-', 'g'))
  ) STORED,
  location TEXT,
  salary_range TEXT,
  description TEXT,
  requirements JSONB,

  -- Platform Detection
  platform TEXT CHECK (platform IN (
    'linkedin', 'indeed', 'stepstone', 'xing',
    'greenhouse', 'lever', 'workday', 'taleo',
    'company_website', 'unknown'
  )),

  -- Snapshot for Evidence
  snapshot_html TEXT,
  snapshot_at TIMESTAMPTZ,

  -- Processing Status (Migration 20260225020000: expanded statuses)
  status TEXT CHECK (status IN (
    'pending',
    'processing',
    'ready_for_review',
    'cv_matched',
    'cv_optimized',
    'ready_to_apply',
    'submitted',
    'rejected',
    'archived'
  )) DEFAULT 'pending',

  -- Human-in-the-Loop Enforcement
  manual_review_required BOOLEAN DEFAULT TRUE,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id),

  priority TEXT CHECK (priority IN ('auto', 'manual', 'high')) DEFAULT 'auto',
  rejection_reason TEXT,

  -- Generated Content
  optimized_cv_url TEXT,
  cover_letter TEXT,
  cover_letter_quality_score FLOAT,

  -- Metadata for extensions
  metadata JSONB DEFAULT '{}'::jsonb,

  -- PII Reference
  user_profile_id UUID REFERENCES user_profiles(id) NOT NULL,

  -- Search Pipeline (Migration 20260224)
  source TEXT DEFAULT 'manual',
  search_query TEXT,
  apply_link TEXT,
  serpapi_raw JSONB,
  firecrawl_markdown TEXT,

  -- Harvester (GPT-4o-mini) structured extraction (Migration 20260224)
  work_model TEXT,
  contract_type TEXT,
  experience_years_min INTEGER,
  experience_years_max INTEGER,
  experience_level_stated TEXT,
  hard_requirements TEXT[],
  soft_requirements TEXT[],
  tasks TEXT[],
  about_company_raw TEXT,
  mission_statement_raw TEXT,
  diversity_section_raw TEXT,
  sustainability_section_raw TEXT,
  leadership_signals_raw TEXT,
  tech_stack_mentioned TEXT[],
  ats_keywords TEXT[],
  application_deadline TEXT,

  -- Judge (Claude) scoring (Migration 20260224)
  match_score_overall INTEGER,
  score_breakdown JSONB,
  judge_reasoning TEXT,
  recommendation TEXT,
  red_flags TEXT[],
  green_flags TEXT[],
  knockout_reason TEXT,

  -- Buzzwords (Migration 013)
  buzzwords TEXT[],

  -- CV Optimization (Migration 20260221164808)
  cv_optimization_proposal JSONB,
  cv_optimization_user_decisions JSONB,

  -- Source URL dedup (Migration 20260228)
  source_url TEXT,
  active_cv_id UUID,

  -- Company Website (Migration 20260227020000)
  company_website TEXT,

  -- Enrichment tracking (used by admin cost-report)
  enrichment_status TEXT CHECK (enrichment_status IN ('pending', 'complete', 'skipped_no_data', 'failed')),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_job_queue_status ON job_queue(status);
CREATE INDEX IF NOT EXISTS idx_job_queue_user_pending ON job_queue(user_id, status)
  WHERE status = 'ready_to_apply';
CREATE INDEX IF NOT EXISTS idx_job_queue_url_hash ON job_queue USING hash(job_url);
CREATE INDEX IF NOT EXISTS idx_job_queue_search_query ON job_queue (user_id, search_query)
  WHERE source = 'search';
CREATE INDEX IF NOT EXISTS idx_job_queue_match_score ON job_queue (user_id, match_score_overall DESC NULLS LAST)
  WHERE source = 'search';
CREATE UNIQUE INDEX IF NOT EXISTS idx_jobqueue_user_url ON job_queue (user_id, source_url)
  WHERE source_url IS NOT NULL;

ALTER TABLE job_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only access their own jobs"
  ON job_queue FOR ALL
  USING (auth.uid() = user_id);

-- User Values (Soft-filter preferences — Migration 20260224)
CREATE TABLE IF NOT EXISTS user_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,

  preferred_job_titles TEXT[],
  preferred_locations TEXT[],
  experience_level TEXT,
  company_values TEXT[],
  preferred_org_type TEXT[],
  diversity_important BOOLEAN DEFAULT false,
  sustainability_important BOOLEAN DEFAULT false,
  leadership_style_pref INTEGER,
  innovation_level_pref INTEGER,
  purpose_keywords TEXT[],
  no_go_org_types TEXT[],
  max_commute_minutes INTEGER,
  min_remote_days INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_values ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own values" ON user_values
  FOR ALL USING (auth.uid() = user_id);

-- Saved Job Searches (Migration 20260228)
CREATE TABLE IF NOT EXISTS saved_job_searches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  location TEXT,
  filters JSONB DEFAULT '{}',
  results JSONB DEFAULT '[]',
  result_count INTEGER DEFAULT 0,
  search_mode TEXT DEFAULT 'keyword',
  fetched_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_saved_searches_user_query_location UNIQUE (user_id, query, location)
);

ALTER TABLE saved_job_searches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_searches" ON saved_job_searches FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- 4. COMPANY RESEARCH (PERPLEXITY CACHE)
-- ============================================

CREATE TABLE IF NOT EXISTS company_research (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES job_queue(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,

  intel_data JSONB,
  suggested_quotes JSONB[],
  recent_news JSONB[],
  linkedin_activity JSONB[],

  perplexity_citations JSONB[],

  researched_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days',

  UNIQUE(company_name)
);

CREATE INDEX IF NOT EXISTS idx_company_research_expires ON company_research(expires_at);

-- ============================================
-- 5. APPLICATION HISTORY (MANUAL TRACKING)
-- ============================================

CREATE TABLE IF NOT EXISTS application_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  company_name TEXT NOT NULL,
  job_url TEXT NOT NULL,
  job_title TEXT,

  url_hash TEXT GENERATED ALWAYS AS (md5(job_url)) STORED,
  company_slug TEXT,

  application_method TEXT CHECK (application_method IN ('manual', 'auto', 'extension')) DEFAULT 'manual',

  cv_url TEXT,
  cover_letter_url TEXT,

  applied_at TIMESTAMPTZ DEFAULT NOW(),
  submitted_at TIMESTAMPTZ,

  -- CRM fields (Strategy 3-Lite, 2026-04-03)
  status TEXT DEFAULT 'applied' CHECK (status IN ('applied', 'follow_up_sent', 'interviewing', 'offer_received', 'rejected', 'ghosted')),
  next_action_date DATE,
  notes TEXT,
  rejection_tags TEXT[] DEFAULT '{}',
  contact_name TEXT,
  learnings TEXT,

  UNIQUE(user_id, url_hash)
);

CREATE INDEX IF NOT EXISTS idx_application_history_user ON application_history(user_id);
CREATE INDEX IF NOT EXISTS idx_application_history_method ON application_history(application_method);
CREATE INDEX IF NOT EXISTS idx_application_history_applied_at ON application_history(applied_at);
CREATE INDEX IF NOT EXISTS idx_application_history_company_slug ON application_history(company_slug);
CREATE INDEX IF NOT EXISTS idx_application_history_next_action ON application_history(user_id, next_action_date) WHERE next_action_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_application_history_status ON application_history(user_id, status);

ALTER TABLE application_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only access their own application history"
  ON application_history FOR ALL
  USING (auth.uid() = user_id);

-- Double-Apply Prevention Trigger
CREATE OR REPLACE FUNCTION prevent_double_apply()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM application_history
    WHERE user_id = NEW.user_id
    AND url_hash = md5(NEW.job_url)
    AND applied_at > NOW() - INTERVAL '30 days'
  ) THEN
    RAISE EXCEPTION 'Already applied to this job within 30 days';
  END IF;

  IF NEW.company_slug IS NOT NULL AND NEW.job_title IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM application_history
      WHERE user_id = NEW.user_id
      AND company_slug = NEW.company_slug
      AND job_title % NEW.job_title
      AND applied_at > NOW() - INTERVAL '90 days'
    ) THEN
      RAISE EXCEPTION 'Similar job at same company within 90 days';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_prevent_double_apply ON application_history;
CREATE TRIGGER trigger_prevent_double_apply
BEFORE INSERT ON application_history
FOR EACH ROW EXECUTE FUNCTION prevent_double_apply();

-- ============================================
-- 6. FORM SELECTORS (LEARNING SYSTEM)
-- ============================================

CREATE TABLE IF NOT EXISTS form_selectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_name TEXT NOT NULL,
  company_domain TEXT,

  field_name TEXT NOT NULL,
  css_selector TEXT NOT NULL,

  trust_score FLOAT DEFAULT 0.9 CHECK (trust_score BETWEEN 0 AND 1),
  success_count INT DEFAULT 0,
  failure_count INT DEFAULT 0,

  last_verified_at TIMESTAMPTZ DEFAULT NOW(),
  verified_by_user_id UUID REFERENCES auth.users(id),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_form_selectors_platform ON form_selectors(platform_name);
CREATE INDEX IF NOT EXISTS idx_form_selectors_trust ON form_selectors(trust_score DESC);

-- ============================================
-- 7. GENERATION LOGS (AI AUDIT)
-- ============================================

CREATE TABLE IF NOT EXISTS generation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES job_queue(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  model_name TEXT NOT NULL,
  model_version TEXT,

  iteration INT NOT NULL,
  prompt_tokens INT,
  completion_tokens INT,

  naturalness_score FLOAT,
  style_match_score FLOAT,
  company_relevance_score FLOAT,
  individuality_score FLOAT,
  overall_score FLOAT,
  realism_score FLOAT,

  issues JSONB,
  suggestions JSONB,

  generated_text TEXT,  -- NULLABLE since 2026-03-19 (DSGVO Phase 1: historical data cleared, Phase 2: write-path closed)
  content_hash TEXT,             -- DSGVO Phase 2: SHA256 hash of generated text (audit without plaintext)
  quality_summary JSONB,         -- DSGVO Phase 3: PII audit flags (pii_flags, sanitized, source)

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_generation_logs_job ON generation_logs(job_id);
CREATE INDEX IF NOT EXISTS idx_generation_logs_created ON generation_logs(created_at DESC);

ALTER TABLE generation_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only access logs for their jobs"
  ON generation_logs FOR SELECT
  USING (auth.uid() = user_id);

-- Validation Logs (Migration 20260226010000)
CREATE TABLE IF NOT EXISTS validation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES job_queue(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  iteration INTEGER NOT NULL,
  is_valid BOOLEAN NOT NULL,
  errors TEXT[],
  warnings TEXT[],
  word_count INTEGER,
  paragraph_count INTEGER,
  company_mentions INTEGER,
  forbidden_phrase_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_validation_logs_job ON validation_logs(job_id);
CREATE INDEX IF NOT EXISTS idx_validation_logs_user ON validation_logs(user_id);
ALTER TABLE validation_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only access their own validation logs"
  ON validation_logs FOR ALL
  USING (auth.uid() = user_id);

-- ============================================
-- 8. JOB CERTIFICATES (Weiterbildung — Migration 20260301)
-- ============================================

CREATE TABLE IF NOT EXISTS job_certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES job_queue(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recommendations JSONB,
  summary_text TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_job_certificates_job_id ON job_certificates(job_id);
CREATE INDEX idx_job_certificates_user_id ON job_certificates(user_id);
ALTER TABLE job_certificates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see only own certificates"
  ON job_certificates FOR ALL
  USING (auth.uid() = user_id);

-- ============================================
-- 9. TASKS & POMODORO (Timeblocking — Migrations 20260225/20260226)
-- ============================================

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_queue_id UUID REFERENCES job_queue(id) ON DELETE SET NULL,

  title TEXT NOT NULL,
  estimated_minutes INTEGER DEFAULT 60,

  status TEXT DEFAULT 'inbox' CHECK (status IN (
    'inbox', 'scheduled', 'focus', 'in_progress', 'completed', 'carry_over'
  )),

  -- Source: manual, pulse, or coaching (Migration 20260304 + 20260307)
  source TEXT DEFAULT 'manual',
  CONSTRAINT tasks_source_check CHECK (source IN ('manual', 'pulse', 'coaching')),

  scheduled_start TIMESTAMPTZ,
  scheduled_end TIMESTAMPTZ,

  pomodoros_completed INTEGER DEFAULT 0,
  notes TEXT,
  completed_at TIMESTAMPTZ,

  progress_percent INTEGER CHECK (progress_percent IS NULL OR (progress_percent BETWEEN 0 AND 100)),
  progress_note TEXT,

  carry_over_to DATE,
  carry_over_count INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own tasks" ON tasks
  FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS pomodoro_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_min SMALLINT NOT NULL CHECK (duration_min IN (25, 50)),

  completed BOOLEAN NOT NULL DEFAULT FALSE,
  aborted_at_pct SMALLINT CHECK (aborted_at_pct IS NULL OR aborted_at_pct BETWEEN 0 AND 100),

  energy_level SMALLINT CHECK (energy_level IS NULL OR energy_level BETWEEN 1 AND 5),
  linked_job_id UUID REFERENCES job_queue(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE pomodoro_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "User owns sessions" ON pomodoro_sessions
  FOR ALL USING (auth.uid() = user_id);

-- Pomodoro Heatmap View
CREATE OR REPLACE VIEW pomodoro_heatmap AS
SELECT
  user_id,
  EXTRACT(ISODOW FROM started_at)::INT AS day_of_week,
  EXTRACT(HOUR FROM started_at)::INT AS hour_of_day,
  COUNT(*) AS session_count,
  COUNT(*) FILTER (WHERE completed) AS completed_count,
  ROUND(AVG(energy_level)) AS avg_energy
FROM pomodoro_sessions
GROUP BY user_id, day_of_week, hour_of_day;

-- ============================================
-- 10. MOOD & ENERGY (Migrations 20260227/20260228)
-- ============================================

CREATE TABLE IF NOT EXISTS mood_checkins (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  mood INTEGER CHECK (mood BETWEEN 1 AND 5) NOT NULL,
  context TEXT, -- 'morning' | 'midday' | 'evening'
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE mood_checkins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_checkins" ON mood_checkins FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS daily_energy (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  energy INTEGER CHECK (energy BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);

CREATE TABLE IF NOT EXISTS daily_briefings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);

ALTER TABLE daily_energy ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_briefings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_energy" ON daily_energy FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_briefings" ON daily_briefings FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- 11. COACHING SESSIONS (Migration 20260304)
-- ============================================

CREATE TABLE IF NOT EXISTS coaching_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES job_queue(id) ON DELETE CASCADE,

  session_status TEXT DEFAULT 'active' CHECK (session_status IN ('active', 'completed', 'abandoned')),

  conversation_history JSONB DEFAULT '[]'::jsonb,
  coaching_dossier JSONB,

  feedback_report TEXT,
  coaching_score INTEGER CHECK (coaching_score BETWEEN 1 AND 10),

  turn_count INTEGER DEFAULT 0,
  duration_seconds INTEGER,
  tokens_used INTEGER DEFAULT 0,
  cost_cents INTEGER DEFAULT 0,
  prompt_version TEXT DEFAULT 'v1',
  max_questions INTEGER DEFAULT 5 CHECK (max_questions BETWEEN 1 AND 5),
  interview_round TEXT DEFAULT 'kennenlernen' CHECK (interview_round IN ('kennenlernen', 'deep_dive', 'case_study')),

  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_coaching_sessions_user ON coaching_sessions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coaching_sessions_job ON coaching_sessions(job_id);
ALTER TABLE coaching_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own coaching sessions"
  ON coaching_sessions FOR ALL
  USING (auth.uid() = user_id);

-- ============================================
-- 12. COMMUNITY (Migration 20260303)
-- ============================================

CREATE TABLE IF NOT EXISTS community_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  skills TEXT[] DEFAULT '{}',
  learning_goals TEXT[] DEFAULT '{}',
  looking_for TEXT DEFAULT '',
  current_company TEXT DEFAULT '',
  linkedin_url TEXT DEFAULT '',
  onboarded_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE community_profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS community_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_slug TEXT NOT NULL CHECK (community_slug IN ('skill-share', 'career', 'entrepreneurship')),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_type TEXT NOT NULL DEFAULT 'discussion' CHECK (post_type IN ('ask', 'offer', 'discussion', 'template')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  upvote_count INT DEFAULT 0,
  comment_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector('german', coalesce(title, '') || ' ' || coalesce(content, ''))
  ) STORED
);

ALTER TABLE community_posts ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS community_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE community_comments ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS community_upvotes (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, post_id)
);

ALTER TABLE community_upvotes ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 13. VOLUNTEERING (Migration 20260304020000)
-- ============================================

CREATE TABLE IF NOT EXISTS volunteering_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  organization TEXT NOT NULL,
  category TEXT NOT NULL,
  city TEXT,
  url TEXT NOT NULL,
  source TEXT NOT NULL,
  commitment_type TEXT,
  skills_tags TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  scraped_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS volunteering_bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  opportunity_id UUID NOT NULL REFERENCES volunteering_opportunities(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'saved',
  hours_logged NUMERIC(5,1) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS volunteering_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_suggestion TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, category_suggestion)
);

ALTER TABLE volunteering_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE volunteering_bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE volunteering_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read volunteering_opportunities"
  ON volunteering_opportunities FOR SELECT USING (true);
CREATE POLICY "Users manage own volunteering_bookmarks"
  ON volunteering_bookmarks FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own volunteering_votes"
  ON volunteering_votes FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- 14. BILLING & CREDITS (Migration 20260401 + 20260403 Beta)
-- ============================================

CREATE TABLE IF NOT EXISTS user_credits (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_type TEXT NOT NULL DEFAULT 'free' CHECK (plan_type IN ('free', 'starter', 'durchstarter')),
  credits_total NUMERIC(10,2) NOT NULL DEFAULT 15.0,          -- Beta: was 6.0
  credits_used NUMERIC(10,2) NOT NULL DEFAULT 0,
  topup_credits NUMERIC(10,2) NOT NULL DEFAULT 0,
  coaching_sessions_total INTEGER NOT NULL DEFAULT 5,           -- Beta: was 0
  coaching_sessions_used INTEGER NOT NULL DEFAULT 0,
  job_searches_total INTEGER NOT NULL DEFAULT 10,               -- Beta: was 0
  job_searches_used INTEGER NOT NULL DEFAULT 0,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  billing_period_start TIMESTAMPTZ,
  billing_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_credits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own credits" ON user_credits FOR SELECT USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS credit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  job_id UUID REFERENCES job_queue(id) ON DELETE SET NULL,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE credit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own credit events" ON credit_events FOR SELECT USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS processed_stripe_events (
  event_id TEXT PRIMARY KEY,
  processed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create user_credits on signup
CREATE OR REPLACE FUNCTION create_user_credits()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    INSERT INTO user_credits (
        user_id, plan_type,
        credits_total, coaching_sessions_total, job_searches_total
    )
    VALUES (
        NEW.id, 'free',
        15.0,   -- Beta: 15 credits
        5,      -- Beta: 5 coaching sessions
        10      -- Beta: 10 job searches
    )
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END; $$;

CREATE TRIGGER trigger_create_user_credits
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION create_user_credits();

-- ============================================
-- 15. CRON JOBS
-- ============================================

CREATE OR REPLACE FUNCTION reset_daily_counts()
RETURNS void AS $$
BEGIN
  UPDATE auto_search_configs
  SET daily_count = 0, last_reset_at = NOW()
  WHERE DATE(last_reset_at) < CURRENT_DATE;
END;
$$ LANGUAGE plpgsql;

SELECT cron.schedule('reset-daily', '0 0 * * *', 'SELECT reset_daily_counts()');

CREATE OR REPLACE FUNCTION cleanup_expired_research()
RETURNS void AS $$
BEGIN
  DELETE FROM company_research WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

SELECT cron.schedule('cleanup-research', '0 2 * * *', 'SELECT cleanup_expired_research()');

-- DSGVO Retention Policies (Migration 20260319)
-- Job: anonymize-coaching-daily  → 03:00 UTC, 90d anonymize / 180d delete (completed/abandoned only)
-- Job: cleanup-serpapi-weekly    → 04:00 UTC Mo, 30d serpapi_raw NULL (terminal states only)
-- Job: cleanup-firecrawl-weekly  → 05:00 UTC Di, 14d firecrawl_markdown NULL (terminal states only)
-- Full definitions in: supabase/migrations/20260319_dsgvo_retention_policies.sql

-- ============================================
-- 15. UTILITY FUNCTIONS
-- ============================================

CREATE OR REPLACE FUNCTION slugify(text TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN lower(regexp_replace(text, '[^a-zA-Z0-9]+', '-', 'g'));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION get_weekly_application_count(p_user_id UUID)
RETURNS INT AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)
    FROM application_history
    WHERE user_id = p_user_id
    AND applied_at > NOW() - INTERVAL '7 days'
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- SCHEMA VERSION
-- ============================================

CREATE TABLE IF NOT EXISTS schema_version (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO schema_version (version) VALUES ('4.2') ON CONFLICT (version) DO NOTHING;
-- 4.2: Added user_credits, credit_events, processed_stripe_events (Billing + Beta Credits)

-- ============================================
-- WAITLIST LEADS (Marketing Website → Early Access)
-- ============================================

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

CREATE INDEX IF NOT EXISTS idx_waitlist_leads_created
    ON waitlist_leads(created_at DESC);

ALTER TABLE waitlist_leads ENABLE ROW LEVEL SECURITY;

INSERT INTO schema_version (version) VALUES ('4.3') ON CONFLICT (version) DO NOTHING;
-- 4.3: Added waitlist_leads (DOI, marketing website email capture)

