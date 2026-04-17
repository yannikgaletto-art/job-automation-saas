-- ============================================================
-- FIX: Blocking FK Constraints on auth.users
-- Date: 2026-04-17
-- Priority: CRITICAL — auth.admin.deleteUser() fails without this
--
-- Root Cause:
--   job_queue.reviewed_by and form_selectors.verified_by_user_id
--   reference auth.users WITHOUT an ON DELETE action.
--   When Supabase tries to delete the auth.users row, Postgres
--   rejects it with "Database error deleting user" (FK violation).
--
-- Fix: Set both to ON DELETE SET NULL (admin reference — just unset it).
--
-- ⚠️  RUN THIS MANUALLY in Supabase Dashboard → SQL Editor.
--     It is idempotent (DROP IF EXISTS + ADD CONSTRAINT).
-- ============================================================

-- 1. job_queue.reviewed_by → SET NULL on admin user deletion
ALTER TABLE job_queue
  DROP CONSTRAINT IF EXISTS job_queue_reviewed_by_fkey;
ALTER TABLE job_queue
  ADD CONSTRAINT job_queue_reviewed_by_fkey
  FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. form_selectors.verified_by_user_id → SET NULL on admin user deletion
ALTER TABLE form_selectors
  DROP CONSTRAINT IF EXISTS form_selectors_verified_by_user_id_fkey;
ALTER TABLE form_selectors
  ADD CONSTRAINT form_selectors_verified_by_user_id_fkey
  FOREIGN KEY (verified_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- ── Verification ────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_jq TEXT;
  v_fs TEXT;
BEGIN
  SELECT confdeltype::TEXT INTO v_jq
  FROM pg_constraint
  WHERE conname = 'job_queue_reviewed_by_fkey';

  SELECT confdeltype::TEXT INTO v_fs
  FROM pg_constraint
  WHERE conname = 'form_selectors_verified_by_user_id_fkey';

  -- confdeltype 'a' = no action, 'c' = cascade, 'n' = set null, 'd' = set default, 'r' = restrict
  IF v_jq = 'n' AND v_fs = 'n' THEN
    RAISE NOTICE '✅ Both FK constraints are SET NULL — auth.deleteUser() will work.';
  ELSE
    RAISE EXCEPTION '❌ FK fix failed. job_queue.reviewed_by=%, form_selectors.verified_by=%. Expected n (SET NULL).', v_jq, v_fs;
  END IF;
END $$;
