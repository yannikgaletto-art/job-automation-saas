-- ============================================
-- Migration 004: Fix PII Leak in job_queue
-- DSGVO Compliance Fix
-- ============================================

-- Remove unencrypted PII from job_queue
ALTER TABLE job_queue 
  DROP COLUMN IF EXISTS form_data;

-- Add reference to user_profiles instead
ALTER TABLE job_queue 
  ADD COLUMN user_profile_id UUID REFERENCES user_profiles(id);

-- Update existing rows (if any)
UPDATE job_queue 
SET user_profile_id = user_id 
WHERE user_profile_id IS NULL;

-- Make it NOT NULL
ALTER TABLE job_queue 
  ALTER COLUMN user_profile_id SET NOT NULL;

COMMENT ON COLUMN job_queue.user_profile_id IS 
'Reference to user_profiles for PII data. Extension reads encrypted PII at runtime.';
