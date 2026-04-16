-- =============================================
-- Beta Credit Refill — Pathly V2.0
-- Date: 2026-04-16
--
-- Purpose: When a free user exhausts credits and clicks "Upgrade",
-- we track the purchase intent (PostHog) and refill their credits
-- as a one-time Beta gift. No money flows — just validation data.
--
-- Mechanics:
--   - Resets credits_used to 0 (refill, NOT new credits)
--   - Max 1 refill per user lifetime (beta_refill_claimed flag)
--   - Audit trail in credit_events (event_type: 'beta_refill')
--   - Cost cap: 15 credits × ~$0.06/credit = $0.90 worst case per user
-- =============================================

-- ─── 1. Add beta_refill_claimed flag ──────────────────────────────────
ALTER TABLE user_credits
    ADD COLUMN IF NOT EXISTS beta_refill_claimed BOOLEAN DEFAULT false;

-- ─── 2. Extend credit_events CHECK constraint ─────────────────────────
-- Must drop and recreate since PG doesn't support ALTER CHECK
ALTER TABLE credit_events DROP CONSTRAINT IF EXISTS credit_events_event_type_check;
ALTER TABLE credit_events ADD CONSTRAINT credit_events_event_type_check
    CHECK (event_type IN (
        'cv_match', 'cover_letter', 'cv_optimize', 'video_script',
        'coaching_session', 'job_search',
        'topup', 'plan_upgrade', 'plan_downgrade',
        'monthly_reset', 'refund', 'admin_adjustment',
        'feedback_bonus', 'beta_refill'
    ));

-- ─── 3. Atomic RPC: beta_refill_credits ───────────────────────────────
-- Pattern: identical to grant_feedback_credits (proven, FOR UPDATE lock)
-- Difference: resets credits_used to 0 instead of adding topup.
CREATE OR REPLACE FUNCTION beta_refill_credits(
    p_user_id UUID,
    p_intent_plan TEXT DEFAULT 'starter'
) RETURNS TABLE(success BOOLEAN, refilled_amount DECIMAL(5,1), new_balance DECIMAL(5,1))
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_used DECIMAL(5,1);
    v_total DECIMAL(5,1);
    v_topup DECIMAL(5,1);
    v_available DECIMAL(5,1);
    v_claimed BOOLEAN;
BEGIN
    -- Lock row to prevent double-click race condition
    SELECT credits_used, credits_total, topup_credits, beta_refill_claimed
    INTO v_used, v_total, v_topup, v_claimed
    FROM user_credits WHERE user_id = p_user_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 0.0::DECIMAL(5,1), 0.0::DECIMAL(5,1);
        RETURN;
    END IF;

    -- Already claimed → reject (idempotent)
    IF v_claimed THEN
        v_available := (v_total - v_used) + v_topup;
        RETURN QUERY SELECT false, 0.0::DECIMAL(5,1), v_available;
        RETURN;
    END IF;

    v_available := (v_total - v_used) + v_topup;

    -- Atomically: set flag + reset credits_used to 0
    UPDATE user_credits
    SET credits_used = 0,
        beta_refill_claimed = true,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    -- Audit trail (refund_reason carries the intent plan for PostHog correlation)
    INSERT INTO credit_events (
        user_id, event_type, credits_amount,
        credits_before, credits_after, refund_reason
    )
    VALUES (
        p_user_id, 'beta_refill', v_used,
        v_available, v_total + v_topup,
        'beta_refill:' || p_intent_plan
    );

    RETURN QUERY SELECT true, v_used, (v_total + v_topup)::DECIMAL(5,1);
END; $$;

-- Set search_path for security (SICHERHEITSARCHITEKTUR.md compliance)
ALTER FUNCTION public.beta_refill_credits(UUID, TEXT) SET search_path = public;

-- ─── 4. Verification ──────────────────────────────────────────────────
DO $$
BEGIN
    -- Verify column exists
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'user_credits' AND column_name = 'beta_refill_claimed'
    ) THEN
        RAISE NOTICE '✅ beta_refill_claimed column exists';
    ELSE
        RAISE EXCEPTION '❌ beta_refill_claimed column missing';
    END IF;

    -- Verify RPC exists
    IF EXISTS (
        SELECT 1 FROM pg_proc WHERE proname = 'beta_refill_credits'
    ) THEN
        RAISE NOTICE '✅ beta_refill_credits RPC exists';
    ELSE
        RAISE EXCEPTION '❌ beta_refill_credits RPC missing';
    END IF;
END $$;
