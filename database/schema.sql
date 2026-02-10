-- ============================================
-- PATHLY V2.0 DATABASE SCHEMA
-- Version: 3.0
-- Last Updated: 2026-02-07
-- DSGVO & NIS2 Compliant
-- ============================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_cron";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For fuzzy search

-- ============================================
-- 1. USER & CONSENT MANAGEMENT
-- ============================================

-- Consent History (DSGVO Art. 7)
CREATE TABLE consent_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  document_type TEXT NOT NULL CHECK (document_type IN (
    'privacy_policy', 'terms_of_service', 'ai_processing', 'cookies'
  )),
  document_version TEXT NOT NULL, -- e.g. 'v1.2'
  
  consent_given BOOLEAN NOT NULL,
  ip_address INET,
  user_agent TEXT,
  
  consented_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, document_type, document_version)
);

CREATE INDEX idx_consent_history_user ON consent_history(user_id);

-- User Profiles (Extended)
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Encrypted PII (name, email, phone, address)
  pii_encrypted BYTEA NOT NULL,
  encryption_key_version INT DEFAULT 1,
  
  -- Non-sensitive metadata
  preferred_cv_template TEXT DEFAULT 'notion_modern',
  onboarding_completed BOOLEAN DEFAULT FALSE,
  subscription_tier TEXT DEFAULT 'free' CHECK (subscription_tier IN ('free', 'starter', 'pro')),
  
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

CREATE TRIGGER trigger_user_profiles_updated_at
BEFORE UPDATE ON user_profiles
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Row Level Security
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only access their own profile"
  ON user_profiles FOR ALL
  USING (auth.uid() = id);

-- ============================================
-- 2. DOCUMENT MANAGEMENT
-- ============================================

CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  document_type TEXT NOT NULL CHECK (document_type IN ('cv', 'cover_letter', 'reference')),
  
  -- Encrypted PII
  pii_encrypted BYTEA NOT NULL,
  
  -- Metadata (skills, experience, etc.)
  metadata JSONB,
  
  -- Writing Style Embedding (for cover letters)
  writing_style_embedding VECTOR(1536), -- OpenAI/Anthropic embeddings
  
  -- Storage URL (encrypted)
  file_url_encrypted TEXT NOT NULL,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_documents_user ON documents(user_id);
CREATE INDEX idx_documents_type ON documents(document_type);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only access their own documents"
  ON documents FOR ALL
  USING (auth.uid() = user_id);

-- ============================================
-- 3. JOB QUEUE & AUTOMATION
-- ============================================

-- Auto Search Configs
CREATE TABLE auto_search_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  keywords TEXT NOT NULL,
  location TEXT,
  salary_min INT,
  salary_max INT,
  
  -- Intelligence Layer
  blacklist_keywords TEXT[], -- ["Senior", "Consultancy", "Unpaid"]
  blacklist_companies TEXT[], -- ["Amazon", "Meta"]
  
  -- Smart Limits
  max_applications_per_day INT DEFAULT 10,
  daily_count INT DEFAULT 0,
  last_reset_at TIMESTAMPTZ DEFAULT NOW(),
  
  status TEXT CHECK (status IN ('active', 'paused')) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_auto_search_configs_user ON auto_search_configs(user_id);

ALTER TABLE auto_search_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only access their own configs"
  ON auto_search_configs FOR ALL
  USING (auth.uid() = user_id);

-- Search Trigger Queue (Decoupled from Cron)
CREATE TABLE search_trigger_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id UUID REFERENCES auto_search_configs(id) ON DELETE CASCADE,
  
  status TEXT CHECK (status IN ('pending', 'processing', 'completed', 'failed')) DEFAULT 'pending',
  
  scheduled_for TIMESTAMPTZ, -- Jitter: 08:00-10:00
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_search_trigger_queue_status ON search_trigger_queue(status);
CREATE INDEX idx_search_trigger_queue_scheduled ON search_trigger_queue(scheduled_for) 
  WHERE status = 'pending';

-- Job Queue (Robust)
CREATE TABLE job_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  search_config_id UUID REFERENCES auto_search_configs(id),
  
  -- Job Details
  job_url TEXT NOT NULL,
  job_title TEXT,
  company TEXT,
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
  
  -- Processing Status
  status TEXT CHECK (status IN (
    'pending',
    'processing',
    'ready_for_review',   -- AI generated, waiting for user
    'ready_to_apply',     -- User approved
    'submitted',
    'failed',
    'skipped'
  )) DEFAULT 'pending',
  
  -- Human-in-the-Loop Enforcement
  manual_review_required BOOLEAN DEFAULT TRUE,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id),
  
  priority TEXT CHECK (priority IN ('auto', 'manual', 'high')) DEFAULT 'auto',
  
  -- Rejection Tracking
  rejection_reason TEXT,
  
  -- Generated Content
  optimized_cv_url TEXT,
  cover_letter TEXT,
  cover_letter_quality_score FLOAT,
  
  -- PII Reference (DSGVO compliant - no unencrypted PII!)
  user_profile_id UUID REFERENCES user_profiles(id) NOT NULL,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX idx_job_queue_status ON job_queue(status);
CREATE INDEX idx_job_queue_user_pending ON job_queue(user_id, status) 
  WHERE status = 'ready_to_apply';
CREATE INDEX idx_job_queue_url_hash ON job_queue USING hash(job_url);

ALTER TABLE job_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only access their own jobs"
  ON job_queue FOR ALL
  USING (auth.uid() = user_id);

-- ============================================
-- 4. COMPANY RESEARCH (PERPLEXITY CACHE)
-- ============================================

CREATE TABLE company_research (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES job_queue(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  
  -- Intel Data
  intel_data JSONB, -- Founded, values, vision, culture
  suggested_quotes JSONB[], -- Array of quote objects
  recent_news JSONB[],
  linkedin_activity JSONB[],
  
  -- Citations (for transparency)
  perplexity_citations JSONB[],
  
  -- Caching
  researched_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days',
  
  UNIQUE(company_name)
);

CREATE INDEX idx_company_research_expires ON company_research(expires_at);

-- Auto-cleanup expired research
CREATE OR REPLACE FUNCTION cleanup_expired_research()
RETURNS void AS $$
BEGIN
  DELETE FROM company_research WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

SELECT cron.schedule('cleanup-research', '0 2 * * *', 'SELECT cleanup_expired_research()');

-- ============================================
-- 5. APPLICATION HISTORY (MANUAL TRACKING)
-- ============================================

CREATE TABLE application_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  company_name TEXT NOT NULL,
  job_url TEXT NOT NULL,
  job_title TEXT,
  
  -- Detection Fields
  url_hash TEXT GENERATED ALWAYS AS (md5(job_url)) STORED,
  company_slug TEXT, -- Normalized: "tech-corp-gmbh"
  
  -- Method Tracking
  application_method TEXT CHECK (application_method IN ('manual', 'auto', 'extension')) DEFAULT 'manual',
  
  -- Document References
  cv_url TEXT,
  cover_letter_url TEXT,
  
  applied_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Prevent duplicates
  UNIQUE(user_id, url_hash)
);

-- Indexes
CREATE INDEX idx_application_history_user ON application_history(user_id);
CREATE INDEX idx_application_history_method ON application_history(application_method);
CREATE INDEX idx_application_history_week ON application_history(applied_at) 
  WHERE applied_at > NOW() - INTERVAL '7 days';
CREATE INDEX idx_application_history_company_slug ON application_history(company_slug);

ALTER TABLE application_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only access their own application history"
  ON application_history FOR ALL
  USING (auth.uid() = user_id);

-- Double-Apply Prevention Trigger
CREATE OR REPLACE FUNCTION prevent_double_apply()
RETURNS TRIGGER AS $$
BEGIN
  -- Check 1: Exact URL match (last 30 days)
  IF EXISTS (
    SELECT 1 FROM application_history
    WHERE user_id = NEW.user_id
    AND url_hash = md5(NEW.job_url)
    AND applied_at > NOW() - INTERVAL '30 days'
  ) THEN
    RAISE EXCEPTION 'Already applied to this job within 30 days';
  END IF;
  
  -- Check 2: Same company + similar title (last 90 days)
  IF NEW.company_slug IS NOT NULL AND NEW.job_title IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM application_history
      WHERE user_id = NEW.user_id
      AND company_slug = NEW.company_slug
      AND job_title % NEW.job_title -- Fuzzy match with pg_trgm
      AND applied_at > NOW() - INTERVAL '90 days'
    ) THEN
      RAISE EXCEPTION 'Similar job at same company within 90 days';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_prevent_double_apply
BEFORE INSERT ON application_history
FOR EACH ROW EXECUTE FUNCTION prevent_double_apply();

-- ============================================
-- 6. FORM SELECTORS (LEARNING SYSTEM)
-- ============================================

CREATE TABLE form_selectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_name TEXT NOT NULL, -- 'greenhouse', 'workday'
  company_domain TEXT, -- 'jobs.techcorp.com' (optional)
  
  field_name TEXT NOT NULL, -- 'email', 'first_name'
  css_selector TEXT NOT NULL, -- 'input[id="email"]'
  
  -- Confidence Scoring
  trust_score FLOAT DEFAULT 0.9 CHECK (trust_score BETWEEN 0 AND 1),
  success_count INT DEFAULT 0,
  failure_count INT DEFAULT 0,
  
  -- Crowdsourced Learning
  last_verified_at TIMESTAMPTZ DEFAULT NOW(),
  verified_by_user_id UUID REFERENCES auth.users(id),
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_form_selectors_platform ON form_selectors(platform_name);
CREATE INDEX idx_form_selectors_trust ON form_selectors(trust_score DESC);

-- Update Selector Trust
CREATE OR REPLACE FUNCTION update_selector_trust(selector_id UUID, success BOOLEAN)
RETURNS void AS $$
BEGIN
  IF success THEN
    UPDATE form_selectors
    SET success_count = success_count + 1,
        trust_score = LEAST(1.0, trust_score + 0.01),
        last_verified_at = NOW()
    WHERE id = selector_id;
  ELSE
    UPDATE form_selectors
    SET failure_count = failure_count + 1,
        trust_score = GREATEST(0.1, trust_score - 0.05)
    WHERE id = selector_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 7. GENERATION LOGS (AI AUDIT)
-- ============================================

CREATE TABLE generation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES job_queue(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  model_name TEXT NOT NULL, -- 'claude-sonnet-4.5'
  model_version TEXT,
  
  iteration INT NOT NULL,
  prompt_tokens INT,
  completion_tokens INT,
  
  -- Quality Scores (from Judge)
  naturalness_score FLOAT,
  style_match_score FLOAT,
  company_relevance_score FLOAT,
  individuality_score FLOAT,
  overall_score FLOAT,
  
  issues JSONB,
  suggestions JSONB,
  
  generated_text TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_generation_logs_job ON generation_logs(job_id);
CREATE INDEX idx_generation_logs_created ON generation_logs(created_at DESC);

ALTER TABLE generation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only access logs for their jobs"
  ON generation_logs FOR SELECT
  USING (auth.uid() = user_id);

-- ============================================
-- 8. CRON JOBS
-- ============================================

-- Reset daily application counts
CREATE OR REPLACE FUNCTION reset_daily_counts()
RETURNS void AS $$
BEGIN
  UPDATE auto_search_configs
  SET daily_count = 0,
      last_reset_at = NOW()
  WHERE DATE(last_reset_at) < CURRENT_DATE;
END;
$$ LANGUAGE plpgsql;

SELECT cron.schedule('reset-daily', '0 0 * * *', 'SELECT reset_daily_counts()');

-- ============================================
-- 9. SEED DATA (INITIAL FORM SELECTORS)
-- ============================================

-- Greenhouse
INSERT INTO form_selectors (platform_name, field_name, css_selector) VALUES
('greenhouse', 'first_name', 'input[id="first_name"]'),
('greenhouse', 'last_name', 'input[id="last_name"]'),
('greenhouse', 'email', 'input[id="email"]'),
('greenhouse', 'phone', 'input[id="phone"]'),
('greenhouse', 'resume', 'input[type="file"][name="resume"]'),
('greenhouse', 'cover_letter', 'textarea[id="cover_letter_text"]');

-- Lever
INSERT INTO form_selectors (platform_name, field_name, css_selector) VALUES
('lever', 'first_name', 'input[name="name"]'),
('lever', 'email', 'input[name="email"]'),
('lever', 'phone', 'input[name="phone"]'),
('lever', 'resume', 'input[type="file"][name="resume"]'),
('lever', 'cover_letter', 'textarea[name="cards[additional-information]"]');

-- Workday
INSERT INTO form_selectors (platform_name, field_name, css_selector) VALUES
('workday', 'first_name', 'input[data-automation-id="legalNameSection_firstName"]'),
('workday', 'last_name', 'input[data-automation-id="legalNameSection_lastName"]'),
('workday', 'email', 'input[data-automation-id="email"]'),
('workday', 'phone', 'input[data-automation-id="phone-device-landLine"]'),
('workday', 'resume', 'input[type="file"][data-automation-id="file-upload-input"]');

-- LinkedIn
INSERT INTO form_selectors (platform_name, field_name, css_selector) VALUES
('linkedin', 'phone', 'input[id*="phoneNumber"]'),
('linkedin', 'resume', 'input[type="file"][name="file"]');

-- ============================================
-- 10. UTILITY FUNCTIONS
-- ============================================

-- Slugify company name
CREATE OR REPLACE FUNCTION slugify(text TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN lower(regexp_replace(text, '[^a-zA-Z0-9]+', '-', 'g'));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Get weekly application count
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

CREATE TABLE schema_version (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO schema_version (version) VALUES ('3.0');
