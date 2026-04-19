-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Referral Credit System (V3 — RPC-Free, QA-Hardened)
-- Created: 2026-04-19
-- Feature-Silo: §11 Referral
--
-- CTO Decision: NO PL/pgSQL function. Credit logic lives in application code
-- (lib/services/referral-service.ts). Supabase SQL Editor cannot deploy
-- dollar-quoted PL/pgSQL blocks. The UNIQUE(referred_user_id) constraint
-- is the atomic guard against double-claims.
--
-- Design:
--   - referral_code lives in user_profiles (stable, 1:1 with user)
--   - referrals table = claim log (1 row per successful invite)
--   - No RPC needed — application code handles all business logic
--
-- CFO Model: +5 topup for referrer, +3 topup for referred
-- Lifetime cap: 10 credited referrals per user
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 0. Cleanup: Remove artifacts from failed earlier runs ─────────────

DROP TABLE IF EXISTS referrals CASCADE;
DROP FUNCTION IF EXISTS grant_referral_credits(UUID, UUID, UUID);
DROP FUNCTION IF EXISTS grant_referral_credits(UUID, UUID);


-- ─── 1. Add referral_code to user_profiles ──────────────────────────────
-- One stable code per user. Generated lazily by referral-service.ts.

ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS idx_profiles_referral_code
    ON user_profiles (referral_code)
    WHERE referral_code IS NOT NULL;


-- ─── 2. Referrals Table (Claim Log) ────────────────────────────────────
-- One row per SUCCESSFUL claim. No pending state (Reduce Complexity).
-- UNIQUE(referred_user_id) = atomic double-claim guard at DB level.

CREATE TABLE IF NOT EXISTS referrals (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    referrer_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
    referred_user_id UUID REFERENCES auth.users ON DELETE SET NULL NOT NULL,
    credited_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (referred_user_id)
);

ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_referrals" ON referrals
    FOR SELECT USING (auth.uid() = referrer_id);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals (referrer_id);


-- ─── 3. Extend credit_events CHECK constraint ─────────────────────────

ALTER TABLE credit_events DROP CONSTRAINT IF EXISTS credit_events_event_type_check;
ALTER TABLE credit_events ADD CONSTRAINT credit_events_event_type_check
    CHECK (event_type IN (
        'cv_match', 'cover_letter', 'cv_optimize', 'video_script',
        'coaching_session', 'job_search',
        'topup', 'plan_upgrade', 'plan_downgrade',
        'monthly_reset', 'refund', 'admin_adjustment',
        'feedback_bonus', 'beta_refill', 'referral_bonus'
    ));
