-- =============================================
-- HEALING MIGRATION — Fix Signup Trigger + Related Issues
-- Date: 2026-04-15
-- Priority: CRITICAL — Signup is broken without this
--
-- Run this STANDALONE in Supabase SQL Editor.
-- Do NOT batch with other migrations.
--
-- Fixes:
--   1. create_user_credits() — EXCEPTION handler so trigger NEVER blocks signup
--   2. cleanup_inactive_user_data() — company_research has no user_id column
--   3. cron.schedule() — pg_cron guard
--   4. grant_feedback_credits — wrong signature in search_path fix
--   5. Ensures trigger on auth.users exists
--
-- ⚠️ SYNC: Free-plan defaults (15 credits, 3 coaching, 15 searches)
--          must match PLAN_CONFIG in lib/services/credit-types.ts
-- =============================================


-- ─── 1. Bulletproof create_user_credits() ──────────────────────────────
-- Key change: EXCEPTION block ensures the trigger NEVER crashes.
-- If INSERT fails for ANY reason, we log a warning and let the user through.
-- Credits can be provisioned later via admin or first-feature-use fallback.

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
    VALUES (NEW.id, 'free', 15.0, 3, 15)
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


-- ─── 2. Fix cleanup_inactive_user_data() ───────────────────────────────
-- Bug: company_research has NO user_id column.
-- Fix: Delete via job_queue join (company_research.job_id → job_queue.id).

CREATE OR REPLACE FUNCTION cleanup_inactive_user_data()
RETURNS void AS $$
DECLARE
  inactive_threshold INTERVAL := '12 months';
  r RECORD;
  deleted_count INTEGER := 0;
BEGIN
  FOR r IN
    SELECT user_id FROM user_settings
    WHERE last_active_at < now() - inactive_threshold
      AND last_active_at IS NOT NULL
  LOOP
    -- Delete in dependency order (leaf tables first)
    DELETE FROM generation_logs WHERE user_id = r.user_id;
    DELETE FROM validation_logs WHERE user_id = r.user_id;
    DELETE FROM coaching_sessions WHERE user_id = r.user_id;
    DELETE FROM job_certificates WHERE user_id = r.user_id;
    DELETE FROM video_scripts WHERE user_id = r.user_id;
    DELETE FROM video_approaches WHERE user_id = r.user_id;
    DELETE FROM script_block_templates WHERE user_id = r.user_id;
    DELETE FROM mood_checkins WHERE user_id = r.user_id;
    DELETE FROM daily_energy WHERE user_id = r.user_id;
    DELETE FROM daily_briefings WHERE user_id = r.user_id;
    DELETE FROM pomodoro_sessions WHERE user_id = r.user_id;
    DELETE FROM tasks WHERE user_id = r.user_id;
    DELETE FROM community_upvotes WHERE user_id = r.user_id;
    DELETE FROM community_comments WHERE user_id = r.user_id;
    DELETE FROM community_posts WHERE user_id = r.user_id;
    DELETE FROM volunteering_bookmarks WHERE user_id = r.user_id;
    DELETE FROM volunteering_votes WHERE user_id = r.user_id;
    DELETE FROM application_history WHERE user_id = r.user_id;

    -- company_research: no user_id column — delete via job_queue FK
    DELETE FROM company_research
    WHERE job_id IN (SELECT id FROM job_queue WHERE user_id = r.user_id);

    DELETE FROM saved_job_searches WHERE user_id = r.user_id;
    DELETE FROM job_queue WHERE user_id = r.user_id;
    DELETE FROM documents WHERE user_id = r.user_id;

    -- PRESERVED (intentionally):
    -- - user_settings (needed for last_active_at check itself)
    -- - consent_history (DSGVO Art. 7 audit trail)
    -- - credit_events (DSGVO Art. 15 audit trail)
    -- - user_credits (billing state)
    -- - user_profiles (minimal, needed for account)

    deleted_count := deleted_count + 1;
  END LOOP;

  IF deleted_count > 0 THEN
    RAISE NOTICE '[cleanup_inactive_user_data] Cleaned % inactive user(s)', deleted_count;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;


-- ─── 3. cron.schedule with pg_cron guard ───────────────────────────────
-- Prevents migration failure if pg_cron is not enabled.
-- Removes any previously broken schedule first.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        -- Remove old schedule if exists (idempotent)
        PERFORM cron.unschedule('cleanup-inactive-users-weekly');
        PERFORM cron.schedule(
            'cleanup-inactive-users-weekly',
            '0 4 * * 0',
            'SELECT cleanup_inactive_user_data()'
        );
        RAISE NOTICE '✅ pg_cron schedule created: cleanup-inactive-users-weekly';
    ELSE
        RAISE NOTICE '⚠️ pg_cron not available — skipping schedule. Enable in Supabase Dashboard → Database → Extensions.';
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '⚠️ cron.schedule failed (non-fatal): %', SQLERRM;
END $$;


-- ─── 4. Fix grant_feedback_credits search_path ─────────────────────────
-- Bug: 20260408_security_advisor_fixes.sql used (uuid, text) but the
-- actual signature is (uuid, numeric). numeric is the PG-internal type
-- for DECIMAL(3,1).

DO $$
BEGIN
    ALTER FUNCTION public.grant_feedback_credits(uuid, numeric)
        SET search_path = public;
    RAISE NOTICE '✅ grant_feedback_credits search_path fixed';
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '⚠️ grant_feedback_credits ALTER failed (non-fatal): %', SQLERRM;
END $$;


-- ─── 5. Column defaults catchup ────────────────────────────────────────
-- Ensures the table defaults match the trigger values.
-- Safe: ALTER COLUMN SET DEFAULT is idempotent.

ALTER TABLE user_credits
    ALTER COLUMN credits_total SET DEFAULT 15.0,
    ALTER COLUMN coaching_sessions_total SET DEFAULT 3,
    ALTER COLUMN job_searches_total SET DEFAULT 15;


-- ─── 6. Catchup: Existing users with zero quotas ──────────────────────
-- Users created between migrations may have 0 coaching/search quotas.
-- Only update FREE users who still have old defaults.

UPDATE user_credits
SET
    credits_total = 15.0,
    coaching_sessions_total = CASE WHEN coaching_sessions_total = 0 THEN 3 ELSE coaching_sessions_total END,
    job_searches_total = CASE WHEN job_searches_total = 0 THEN 15 ELSE job_searches_total END,
    updated_at = NOW()
WHERE plan_type = 'free'
  AND (credits_total < 15.0 OR coaching_sessions_total = 0 OR job_searches_total = 0);


-- ─── 7. Verification ──────────────────────────────────────────────────

DO $$
DECLARE
    v_trigger_exists BOOLEAN;
    v_func_search_path TEXT;
BEGIN
    -- Check trigger exists
    SELECT EXISTS(
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'on_user_created_credits'
    ) INTO v_trigger_exists;

    -- Check function search_path
    SELECT proconfig::TEXT FROM pg_proc
    WHERE proname = 'create_user_credits'
    INTO v_func_search_path;

    RAISE NOTICE '✅ Healing complete. Trigger exists: %. Function config: %',
        v_trigger_exists, COALESCE(v_func_search_path, 'default');
END $$;
