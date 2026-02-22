-- 1. Add canonical CV SSoT columns to user_profiles
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS cv_structured_data JSONB;

-- 2. Add optimization results to job_queue
ALTER TABLE job_queue
ADD COLUMN IF NOT EXISTS cv_optimization_proposal JSONB,
ADD COLUMN IF NOT EXISTS cv_optimization_user_decisions JSONB;
