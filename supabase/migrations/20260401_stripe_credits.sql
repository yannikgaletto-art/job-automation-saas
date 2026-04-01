-- =============================================
-- Stripe Credits System — Pathly V2.0
-- Version: 1.0
-- Date: 2026-04-01
-- =============================================

-- =============================================
-- 1. User Credits (Main table)
-- =============================================
CREATE TABLE IF NOT EXISTS user_credits (
    user_id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    plan_type TEXT NOT NULL DEFAULT 'free'
        CHECK (plan_type IN ('free', 'starter', 'durchstarter')),
    
    -- Base credits (reset monthly via Stripe webhook)
    credits_total DECIMAL(5,1) NOT NULL DEFAULT 6.0,
    credits_used DECIMAL(5,1) NOT NULL DEFAULT 0.0,
    
    -- Topup credits (NEVER expire, NEVER reset)
    topup_credits DECIMAL(5,1) NOT NULL DEFAULT 0.0,
    
    -- Coaching session quota (monthly)
    coaching_sessions_total INT NOT NULL DEFAULT 0,
    coaching_sessions_used INT NOT NULL DEFAULT 0,
    
    -- Job search quota (monthly)
    job_searches_total INT NOT NULL DEFAULT 0,
    job_searches_used INT NOT NULL DEFAULT 0,
    
    -- Stripe identifiers
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    
    -- Billing period — ALWAYS from Stripe webhook, never computed
    billing_period_start TIMESTAMPTZ,
    billing_period_end TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: Users can ONLY READ their own credits
-- All writes go through SECURITY DEFINER RPCs
ALTER TABLE user_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_credits" ON user_credits
    FOR SELECT USING (auth.uid() = user_id);

-- =============================================
-- 2. Credit Events (Audit Trail — DSGVO Art. 15 compliant)
-- =============================================
CREATE TABLE IF NOT EXISTS credit_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
    job_id UUID,
    event_type TEXT NOT NULL
        CHECK (event_type IN (
            'cv_match', 'cover_letter', 'cv_optimize', 'video_script',
            'coaching_session', 'job_search',
            'topup', 'plan_upgrade', 'plan_downgrade',
            'monthly_reset', 'refund', 'admin_adjustment'
        )),
    credits_amount DECIMAL(3,1) NOT NULL,
    credits_before DECIMAL(5,1) NOT NULL,
    credits_after DECIMAL(5,1) NOT NULL,
    -- Structured fields only (no free-form JSONB — DSGVO compliance)
    stripe_event_id TEXT,
    refund_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE credit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_credit_events" ON credit_events
    FOR SELECT USING (auth.uid() = user_id);

-- =============================================
-- 3. Processed Stripe Events (Webhook Idempotency)
-- =============================================
CREATE TABLE IF NOT EXISTS processed_stripe_events (
    stripe_event_id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    processed_at TIMESTAMPTZ DEFAULT NOW()
);

-- No RLS needed — only accessed server-side via service role

-- =============================================
-- 4. Atomic Debit Function (SECURITY DEFINER)
-- =============================================
-- Uses FOR UPDATE row lock to prevent race conditions.
-- Deducts from base credits first, then topup credits.
CREATE OR REPLACE FUNCTION debit_credits(
    p_user_id UUID,
    p_amount DECIMAL(3,1),
    p_event_type TEXT,
    p_job_id UUID DEFAULT NULL
) RETURNS TABLE(success BOOLEAN, remaining DECIMAL(5,1))
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_used DECIMAL(5,1);
    v_total DECIMAL(5,1);
    v_topup DECIMAL(5,1);
    v_available DECIMAL(5,1);
    v_base_remaining DECIMAL(5,1);
BEGIN
    -- Lock the row to prevent concurrent updates
    SELECT credits_used, credits_total, topup_credits
    INTO v_used, v_total, v_topup
    FROM user_credits WHERE user_id = p_user_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 0.0::DECIMAL(5,1);
        RETURN;
    END IF;

    v_available := (v_total - v_used) + v_topup;

    -- Check if enough credits available
    IF p_amount > v_available THEN
        RETURN QUERY SELECT false, v_available;
        RETURN;
    END IF;

    v_base_remaining := v_total - v_used;

    -- Deduct from base credits first, then topup
    IF p_amount <= v_base_remaining THEN
        UPDATE user_credits
        SET credits_used = credits_used + p_amount,
            updated_at = NOW()
        WHERE user_id = p_user_id;
    ELSE
        -- Exhaust base credits, remainder from topup
        UPDATE user_credits
        SET credits_used = credits_total,
            topup_credits = topup_credits - (p_amount - v_base_remaining),
            updated_at = NOW()
        WHERE user_id = p_user_id;
    END IF;

    -- Audit log
    INSERT INTO credit_events (user_id, job_id, event_type, credits_amount, credits_before, credits_after)
    VALUES (p_user_id, p_job_id, p_event_type, p_amount, v_available, v_available - p_amount);

    RETURN QUERY SELECT true, (v_available - p_amount)::DECIMAL(5,1);
END; $$;

-- =============================================
-- 5. Refund Function (SECURITY DEFINER)
-- =============================================
CREATE OR REPLACE FUNCTION refund_credits(
    p_user_id UUID,
    p_amount DECIMAL(3,1),
    p_event_type TEXT,
    p_reason TEXT DEFAULT NULL,
    p_job_id UUID DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_used DECIMAL(5,1);
    v_total DECIMAL(5,1);
    v_topup DECIMAL(5,1);
    v_available DECIMAL(5,1);
BEGIN
    SELECT credits_used, credits_total, topup_credits
    INTO v_used, v_total, v_topup
    FROM user_credits WHERE user_id = p_user_id FOR UPDATE;

    IF NOT FOUND THEN RETURN; END IF;

    v_available := (v_total - v_used) + v_topup;

    -- Refund to base credits first (reduce credits_used)
    IF v_used >= p_amount THEN
        UPDATE user_credits
        SET credits_used = credits_used - p_amount,
            updated_at = NOW()
        WHERE user_id = p_user_id;
    ELSE
        -- credits_used can't go below 0, add rest to topup
        UPDATE user_credits
        SET credits_used = 0,
            topup_credits = topup_credits + (p_amount - v_used),
            updated_at = NOW()
        WHERE user_id = p_user_id;
    END IF;

    -- Audit log
    INSERT INTO credit_events (user_id, job_id, event_type, credits_amount, credits_before, credits_after, refund_reason)
    VALUES (p_user_id, p_job_id, 'refund', p_amount, v_available, v_available + p_amount, p_reason);
END; $$;

-- =============================================
-- 6. Auto-create credits for new users
-- =============================================
CREATE OR REPLACE FUNCTION create_user_credits()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    INSERT INTO user_credits (user_id, plan_type, credits_total)
    VALUES (NEW.id, 'free', 6.0)
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END; $$;

-- Drop if exists to avoid duplicate trigger
DROP TRIGGER IF EXISTS on_user_created_credits ON auth.users;
CREATE TRIGGER on_user_created_credits
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION create_user_credits();

-- =============================================
-- 7. Indexes
-- =============================================
CREATE INDEX IF NOT EXISTS idx_credit_events_user_created
    ON credit_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_credit_events_stripe_event
    ON credit_events (stripe_event_id)
    WHERE stripe_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_credits_stripe_customer
    ON user_credits (stripe_customer_id)
    WHERE stripe_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_credits_stripe_subscription
    ON user_credits (stripe_subscription_id)
    WHERE stripe_subscription_id IS NOT NULL;
