-- ============================================================
-- FIX: credit_events + user_credits FK constraints blocking auth.deleteUser
-- Date: 2026-04-17
--
-- Root Cause (confirmed via diagnostic query):
--   credit_events_user_id_fkey  → NO ACTION  (should be CASCADE)
--   user_credits_user_id_fkey   → NO ACTION  (should be CASCADE)
--
-- Both tables reference auth.users(id) but were originally created
-- without an ON DELETE clause, so Postgres defaults to NO ACTION.
-- This blocks auth.admin.deleteUser() with "Database error deleting user".
--
-- Fix: Recreate both FKs as ON DELETE CASCADE.
-- RUN IN: Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. credit_events.user_id → CASCADE
ALTER TABLE public.credit_events
  DROP CONSTRAINT IF EXISTS credit_events_user_id_fkey;
ALTER TABLE public.credit_events
  ADD CONSTRAINT credit_events_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. user_credits.user_id → CASCADE
ALTER TABLE public.user_credits
  DROP CONSTRAINT IF EXISTS user_credits_user_id_fkey;
ALTER TABLE public.user_credits
  ADD CONSTRAINT user_credits_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- ── Verification ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_ce TEXT;
  v_uc TEXT;
BEGIN
  SELECT rc.delete_rule INTO v_ce
  FROM information_schema.table_constraints tc
  JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
  WHERE tc.constraint_name = 'credit_events_user_id_fkey';

  SELECT rc.delete_rule INTO v_uc
  FROM information_schema.table_constraints tc
  JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
  WHERE tc.constraint_name = 'user_credits_user_id_fkey';

  IF v_ce = 'CASCADE' AND v_uc = 'CASCADE' THEN
    RAISE NOTICE '✅ Both FK constraints are now CASCADE — auth.deleteUser() is unblocked.';
  ELSE
    RAISE EXCEPTION '❌ Fix failed. credit_events=%, user_credits=%. Expected CASCADE for both.', v_ce, v_uc;
  END IF;
END $$;
