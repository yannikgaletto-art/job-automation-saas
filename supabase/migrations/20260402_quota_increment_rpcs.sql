-- Migration: Atomic quota increment RPCs
-- Prevents race conditions on concurrent coaching/search usage increments.
-- Both functions use FOR UPDATE row locking (same pattern as debit_credits).
-- Date: 2026-04-02

CREATE OR REPLACE FUNCTION increment_coaching_usage(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE user_credits
    SET
        coaching_sessions_used = coaching_sessions_used + 1,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    IF NOT FOUND THEN
        RAISE WARNING '[Credits] increment_coaching_usage: user_credits row not found for %', p_user_id;
    END IF;
END; $$;

CREATE OR REPLACE FUNCTION increment_job_search_usage(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE user_credits
    SET
        job_searches_used = job_searches_used + 1,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    IF NOT FOUND THEN
        RAISE WARNING '[Credits] increment_job_search_usage: user_credits row not found for %', p_user_id;
    END IF;
END; $$;
