-- =============================================
-- Beta Testing Credits — Pathly V2.0
-- Increases free plan defaults for beta testing
-- Date: 2026-04-03
-- =============================================

-- 1. Update trigger function: new users get beta credits
CREATE OR REPLACE FUNCTION create_user_credits()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    INSERT INTO user_credits (
        user_id, plan_type,
        credits_total, coaching_sessions_total, job_searches_total
    )
    VALUES (
        NEW.id, 'free',
        15.0,   -- Beta: 15 credits (was 6)
        5,      -- Beta: 5 coaching sessions (was 0)
        10      -- Beta: 10 job searches (was 0)
    )
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END; $$;

-- 2. Optionally: upgrade ALL existing free users to beta limits
-- (uncomment if you want existing testers to also get the new limits)
-- UPDATE user_credits
-- SET credits_total = 15.0,
--     coaching_sessions_total = 5,
--     job_searches_total = 10
-- WHERE plan_type = 'free'
--   AND credits_total = 6.0;
