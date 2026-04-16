-- ==========================================
-- Fix: Missing ON DELETE CASCADE constraints
-- ==========================================
-- When deleting a user in Supabase (auth.users), Postgres attempts to cascade
-- to user_profiles and other connected tables. However, if any table references
-- user_profiles (or auth.users) WITHOUT an ON DELETE CASCADE (or SET NULL) policy,
-- the entire deletion transaction fails and rolls back. This migration fixes the
-- orphaned foreign key constraints so that users can be safely deleted.

-- 1. job_queue: user_profile_id 
-- This blocked the cascading delete of user_profiles, which in turn blocked auth.users deletion.
ALTER TABLE job_queue DROP CONSTRAINT IF EXISTS job_queue_user_profile_id_fkey;
ALTER TABLE job_queue ADD CONSTRAINT job_queue_user_profile_id_fkey FOREIGN KEY (user_profile_id) REFERENCES user_profiles(id) ON DELETE CASCADE;

-- 2. job_queue: reviewed_by
-- This points to auth.users. When an admin user is deleted, we just want to unset their id here.
ALTER TABLE job_queue DROP CONSTRAINT IF EXISTS job_queue_reviewed_by_fkey;
ALTER TABLE job_queue ADD CONSTRAINT job_queue_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 3. job_queue: search_config_id
-- We should also ensure search_config_id can cascade properly if a search config is deleted.
ALTER TABLE job_queue DROP CONSTRAINT IF EXISTS job_queue_search_config_id_fkey;
ALTER TABLE job_queue ADD CONSTRAINT job_queue_search_config_id_fkey FOREIGN KEY (search_config_id) REFERENCES auto_search_configs(id) ON DELETE SET NULL;

-- 4. form_selectors: verified_by_user_id
-- Same as reviewed_by, unset if the verifying admin is deleted.
ALTER TABLE form_selectors DROP CONSTRAINT IF EXISTS form_selectors_verified_by_user_id_fkey;
ALTER TABLE form_selectors ADD CONSTRAINT form_selectors_verified_by_user_id_fkey FOREIGN KEY (verified_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 5. Extra check for user_profiles -> auth.users (just in case the original schema missed it on some environments)
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_id_fkey;
ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
