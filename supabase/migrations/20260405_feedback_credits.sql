-- =============================================
-- Feedback-for-Credits System — Pathly V2.0
-- Date: 2026-04-05
-- Purpose: Allow free users to earn 5 bonus credits by giving feedback
-- =============================================

-- ─── 1. Extend user_feedback with structured fields ────────────────────
-- Existing table has: id, user_id, feedback, name, locale, created_at
-- We add optional structured fields for the credit-grant flow.
ALTER TABLE user_feedback
    ADD COLUMN IF NOT EXISTS rating SMALLINT CHECK (rating BETWEEN 1 AND 5),
    ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'general';

-- ─── 2. Add feedback_credits_claimed flag to user_credits ──────────────
ALTER TABLE user_credits
    ADD COLUMN IF NOT EXISTS feedback_credits_claimed BOOLEAN DEFAULT false;

-- ─── 3. Extend credit_events CHECK constraint ─────────────────────────
-- Must drop and recreate since PG doesn't support ALTER CHECK
ALTER TABLE credit_events DROP CONSTRAINT IF EXISTS credit_events_event_type_check;
ALTER TABLE credit_events ADD CONSTRAINT credit_events_event_type_check
    CHECK (event_type IN (
        'cv_match', 'cover_letter', 'cv_optimize', 'video_script',
        'coaching_session', 'job_search',
        'topup', 'plan_upgrade', 'plan_downgrade',
        'monthly_reset', 'refund', 'admin_adjustment',
        'feedback_bonus'
    ));

-- ─── 4. Atomic RPC: grant_feedback_credits ─────────────────────────────
-- Uses FOR UPDATE lock + flag check in one transaction.
-- Prevents double-grant race condition.
CREATE OR REPLACE FUNCTION grant_feedback_credits(
    p_user_id UUID,
    p_amount DECIMAL(3,1) DEFAULT 5.0
) RETURNS TABLE(success BOOLEAN, new_balance DECIMAL(5,1))
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_used DECIMAL(5,1);
    v_total DECIMAL(5,1);
    v_topup DECIMAL(5,1);
    v_available DECIMAL(5,1);
    v_claimed BOOLEAN;
BEGIN
    -- Lock row and read current state
    SELECT credits_used, credits_total, topup_credits, feedback_credits_claimed
    INTO v_used, v_total, v_topup, v_claimed
    FROM user_credits WHERE user_id = p_user_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 0.0::DECIMAL(5,1);
        RETURN;
    END IF;

    -- Already claimed → reject
    IF v_claimed THEN
        v_available := (v_total - v_used) + v_topup;
        RETURN QUERY SELECT false, v_available;
        RETURN;
    END IF;

    v_available := (v_total - v_used) + v_topup;

    -- Atomically: set flag + add topup credits
    UPDATE user_credits
    SET topup_credits = topup_credits + p_amount,
        feedback_credits_claimed = true,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    -- Audit trail
    INSERT INTO credit_events (user_id, event_type, credits_amount, credits_before, credits_after)
    VALUES (p_user_id, 'feedback_bonus', p_amount, v_available, v_available + p_amount);

    RETURN QUERY SELECT true, (v_available + p_amount)::DECIMAL(5,1);
END; $$;
