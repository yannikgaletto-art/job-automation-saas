-- =============================================
-- Credit Plan Rebalance — 2026-04-15
-- 
-- CFO-approved tier upgrade:
--   Free:         10 → 15 credits, 5 → 3 coaching, 10 → 15 searches
--   Starter:      20 → 30 credits, 3 → 10 coaching, 20 → 30 searches
--   Durchstarter: 50 → 75 credits, 10 → 25 coaching, 50 → 75 searches
--
-- Rationale: 89-91% margin on paid plans gives massive headroom.
--            Higher limits = longer trial = higher conversion.
--            Coaching progression was buggy (Starter < Free).
-- =============================================

-- ─── 1. Update DEFAULT values for NEW users ────────────────────────────
ALTER TABLE user_credits
    ALTER COLUMN credits_total SET DEFAULT 15.0,
    ALTER COLUMN coaching_sessions_total SET DEFAULT 3,
    ALTER COLUMN job_searches_total SET DEFAULT 15;

-- ─── 2. Update the auto-create trigger for new signups ─────────────────
CREATE OR REPLACE FUNCTION create_user_credits()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    INSERT INTO user_credits (
        user_id, plan_type,
        credits_total, coaching_sessions_total, job_searches_total
    )
    VALUES (NEW.id, 'free', 15.0, 3, 15)
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END; $$;

-- ─── 3. Upgrade EXISTING Free users ───────────────────────────────────
-- Only Free plan users. Paid plan users are managed by Stripe webhooks.
-- Credits: add the difference (5 more credits)
-- Coaching: set to 3 (was 5 — intentional reduction, progression fix)
-- Searches: add 5 more searches
UPDATE user_credits
SET
    credits_total = 15.0,
    coaching_sessions_total = 3,
    job_searches_total = 15,
    updated_at = NOW()
WHERE plan_type = 'free'
  AND credits_total <= 10.0;

-- ─── 4. Upgrade EXISTING Starter users ────────────────────────────────
UPDATE user_credits
SET
    credits_total = 30.0,
    coaching_sessions_total = 10,
    job_searches_total = 30,
    updated_at = NOW()
WHERE plan_type = 'starter'
  AND credits_total <= 20.0;

-- ─── 5. Upgrade EXISTING Durchstarter users ───────────────────────────
UPDATE user_credits
SET
    credits_total = 75.0,
    coaching_sessions_total = 25,
    job_searches_total = 75,
    updated_at = NOW()
WHERE plan_type = 'durchstarter'
  AND credits_total <= 50.0;

-- ─── 6. Verification ──────────────────────────────────────────────────
DO $$
DECLARE
    v_free_count INT;
    v_starter_count INT;
    v_durch_count INT;
BEGIN
    SELECT COUNT(*) INTO v_free_count
    FROM user_credits WHERE plan_type = 'free' AND credits_total = 15.0;

    SELECT COUNT(*) INTO v_starter_count
    FROM user_credits WHERE plan_type = 'starter' AND credits_total = 30.0;

    SELECT COUNT(*) INTO v_durch_count
    FROM user_credits WHERE plan_type = 'durchstarter' AND credits_total = 75.0;

    RAISE NOTICE '✅ Credit Rebalance complete: % free, % starter, % durchstarter users updated',
        v_free_count, v_starter_count, v_durch_count;
END $$;
