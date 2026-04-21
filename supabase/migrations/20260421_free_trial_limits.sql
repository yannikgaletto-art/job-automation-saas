-- =============================================
-- Free Trial Limits — 2026-04-21
-- 
-- Cost-controlled trial reduction:
--   Free: 15 → 5 credits, 3 coaching (unchanged), 15 → 3 searches
--
-- Rationale: Cap cohort cost at €60 for 35 testers.
-- Only affects NEW users. Existing users keep their current quotas.
--
-- ⚠️ SYNC: Must match PLAN_CONFIG in lib/services/credit-types.ts
-- =============================================

-- ─── 1. Update the auto-create trigger for new signups ─────────────────
CREATE OR REPLACE FUNCTION create_user_credits()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO user_credits (
        user_id, plan_type,
        credits_total, coaching_sessions_total, job_searches_total
    )
    VALUES (NEW.id, 'free', 5.0, 3, 3)
    ON CONFLICT (user_id) DO NOTHING;

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- CRITICAL: Never block user creation. Log and continue.
    RAISE WARNING '[create_user_credits] Trigger failed for user %: % (SQLSTATE: %)',
        NEW.id, SQLERRM, SQLSTATE;
    RETURN NEW;
END;
$$;

-- Ensure trigger exists (idempotent)
DROP TRIGGER IF EXISTS on_user_created_credits ON auth.users;
CREATE TRIGGER on_user_created_credits
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION create_user_credits();

-- ─── 2. Update DEFAULT values for new rows ─────────────────────────────
ALTER TABLE user_credits
    ALTER COLUMN credits_total SET DEFAULT 5.0,
    ALTER COLUMN coaching_sessions_total SET DEFAULT 3,
    ALTER COLUMN job_searches_total SET DEFAULT 3;

-- ─── 3. DO NOT downgrade existing users ────────────────────────────────
-- Existing free-plan users keep their 15 credits / 15 searches.
-- This migration only affects NEW signups.

-- ─── 4. Verification ──────────────────────────────────────────────────
DO $$
DECLARE
    v_trigger_exists BOOLEAN;
    v_func_search_path TEXT;
BEGIN
    SELECT EXISTS(
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'on_user_created_credits'
    ) INTO v_trigger_exists;

    SELECT proconfig::TEXT FROM pg_proc
    WHERE proname = 'create_user_credits'
    INTO v_func_search_path;

    RAISE NOTICE '✅ Free Trial Limits applied. Trigger exists: %. Function config: %',
        v_trigger_exists, COALESCE(v_func_search_path, 'default');
END $$;
