-- Waitlist plan intents: Variant B pricing visibility
-- Date: 2026-05-10
--
-- Allows the settings waitlist to persist the visible Free, Quarterly and Custom
-- plan intents directly once this migration is applied. The app still writes a
-- metadata copy to waitlist_leads.utm_source so production remains readable
-- before/while migrations roll out.

ALTER TABLE waitlist_leads
    DROP CONSTRAINT IF EXISTS waitlist_leads_plan_preference_check;

ALTER TABLE waitlist_leads
    ADD CONSTRAINT waitlist_leads_plan_preference_check
    CHECK (
        plan_preference IS NULL
        OR plan_preference IN ('free', 'starter', 'durchstarter', 'quarterly', 'custom')
    );

COMMENT ON COLUMN waitlist_leads.plan_preference IS
    'Plan the user indicated interest in when joining the waitlist (free/starter/durchstarter/quarterly/custom)';
