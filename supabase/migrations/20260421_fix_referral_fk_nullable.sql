-- ============================================================
-- FIX: referred_user_id ON DELETE SET NULL vs NOT NULL contradiction
-- Date: 2026-04-21
-- Priority: CRITICAL — blocks deletion of any referred user
--
-- Root Cause:
--   referrals.referred_user_id was defined as:
--     REFERENCES auth.users ON DELETE SET NULL NOT NULL
--
--   When deleting a referred user, Postgres tries to SET NULL
--   on referred_user_id — but NOT NULL rejects it → 
--   "Database error deleting user".
--
-- Fix: Allow NULL on referred_user_id so SET NULL can succeed.
--   The UNIQUE constraint still prevents double-claims (NULL is
--   excluded from UNIQUE checks in Postgres).
-- ============================================================

ALTER TABLE referrals ALTER COLUMN referred_user_id DROP NOT NULL;
