-- ============================================
-- Migration 007: Add Trigram Index for Double-Apply Prevention
-- Performance: Fast fuzzy matching in prevent_double_apply trigger
-- ============================================

-- Trigram Index für Fuzzy Search
CREATE INDEX idx_app_history_title_trgm 
  ON application_history 
  USING GIN (job_title gin_trgm_ops);

CREATE INDEX idx_app_history_company_slug 
  ON application_history(company_slug);

CREATE INDEX idx_app_history_double_check 
  ON application_history(user_id, company_slug, applied_at DESC)
  WHERE applied_at > NOW() - INTERVAL '90 days';

COMMENT ON INDEX idx_app_history_title_trgm IS 
'Trigram index for fast fuzzy matching in prevent_double_apply trigger';
