-- =============================================
-- Migration: Add full_name to user_profiles
-- Date: 2026-04-18
-- Priority: P0 — Name not visible in Sidebar after Signup
--
-- Root Cause: full_name was saved to auth.user_metadata during signup
-- but user_profiles had no full_name column. The API profile route
-- read user_profiles.full_name (column missing) → returned null.
--
-- Fix:
--   1. Add full_name column to user_profiles
--   2. Backfill existing users from auth.users.raw_user_meta_data
-- =============================================

-- 1. Add column (idempotent)
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS full_name TEXT;

-- 2. Backfill all existing users from Supabase Auth metadata
UPDATE public.user_profiles p
SET full_name = u.raw_user_meta_data->>'full_name'
FROM auth.users u
WHERE p.id = u.id
  AND p.full_name IS NULL
  AND u.raw_user_meta_data->>'full_name' IS NOT NULL
  AND u.raw_user_meta_data->>'full_name' != '';

-- 3. Verification
DO $$
DECLARE
  v_col_exists BOOLEAN;
  v_backfilled INTEGER;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_profiles'
      AND column_name = 'full_name'
  ) INTO v_col_exists;

  SELECT COUNT(*) FROM public.user_profiles
  WHERE full_name IS NOT NULL
  INTO v_backfilled;

  RAISE NOTICE '✅ full_name column exists: %. Users with name: %',
    v_col_exists, v_backfilled;
END $$;
