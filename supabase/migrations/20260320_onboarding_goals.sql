-- ============================================
-- Onboarding V2: User Goals (Analytics)
-- ============================================
-- Stores user-selected goals from onboarding Step 1.
-- Used for analytics: which user segment uses which feature.
-- Empty array '{}' = user skipped the question (valid).
-- ============================================

ALTER TABLE user_profiles 
  ADD COLUMN IF NOT EXISTS onboarding_goals TEXT[] DEFAULT '{}';

-- GIN index for efficient ANY() queries
-- e.g. WHERE 'interview_prep' = ANY(onboarding_goals)
CREATE INDEX IF NOT EXISTS idx_user_profiles_onboarding_goals 
  ON user_profiles USING GIN(onboarding_goals);
