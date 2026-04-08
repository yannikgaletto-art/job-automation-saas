-- =============================================
-- Security Advisor Fixes — Pathly V2.0
-- Date: 2026-04-08
-- Fixes:
--   1. Function Search Path Mutable (17 warnings)
--      → All SECURITY DEFINER functions now have fixed search_path = public
--      → Prevents search_path hijacking attacks
--   2. processed_stripe_events: Enable RLS (1 warning from noreply email)
--      → No user policies added intentionally (service_role bypass handles writes)
--      → Deny-all for anon/authenticated — only service_role can access
-- =============================================

-- =============================================
-- 1. Fix: Function Search Path Mutable
--    Standard: ALTER FUNCTION ... SET search_path = public
--    All SECURITY DEFINER functions in the codebase
-- =============================================

-- Core trigger & utility functions
ALTER FUNCTION public.update_updated_at() SET search_path = public;
ALTER FUNCTION public.prevent_double_apply() SET search_path = public;
ALTER FUNCTION public.slugify(text) SET search_path = public;
ALTER FUNCTION public.reset_daily_counts() SET search_path = public;
ALTER FUNCTION public.cleanup_expired_research() SET search_path = public;
ALTER FUNCTION public.get_weekly_application_count(uuid) SET search_path = public;

-- Credit system functions
ALTER FUNCTION public.debit_credits(uuid, numeric, text, uuid) SET search_path = public;
ALTER FUNCTION public.refund_credits(uuid, numeric, text, text, uuid) SET search_path = public;
ALTER FUNCTION public.create_user_credits() SET search_path = public;
ALTER FUNCTION public.grant_feedback_credits(uuid, text) SET search_path = public;

-- Quota increment RPCs
ALTER FUNCTION public.increment_coaching_usage(uuid) SET search_path = public;
ALTER FUNCTION public.increment_job_search_usage(uuid) SET search_path = public;

-- DSGVO retention/cleanup functions
ALTER FUNCTION public.anonymize_expired_coaching() SET search_path = public;
ALTER FUNCTION public.cleanup_serpapi_raw() SET search_path = public;
ALTER FUNCTION public.cleanup_firecrawl_markdown() SET search_path = public;

-- Quote search function (3 params: search_query text, result_category text, max_results int)
ALTER FUNCTION public.search_quotes(text, text, integer) SET search_path = public;

-- Selector trust function (if exists)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'update_selector_trust'
    ) THEN
        EXECUTE 'ALTER FUNCTION public.update_selector_trust() SET search_path = public';
    END IF;
END$$;

-- =============================================
-- 2. Fix: processed_stripe_events — Enable RLS
--    No user-facing policies added (intentional).
--    Service role bypasses RLS by design.
--    Default: deny-all for anon/authenticated users.
-- =============================================
ALTER TABLE public.processed_stripe_events ENABLE ROW LEVEL SECURITY;
-- Explicit comment for future devs:
-- No SELECT/INSERT/UPDATE/DELETE policies = deny-all for non-service-role.
-- This table is ONLY written to via service_role in api/stripe/webhook/route.ts.
