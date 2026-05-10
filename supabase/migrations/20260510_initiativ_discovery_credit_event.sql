-- Initiativ Plan v3 — Phase 3a-P3 Perplexity Verifier
-- Adds 'initiativ_discovery' as a new credit_events.event_type so that
-- the discovery endpoint can debit 1 credit per Perplexity verification
-- batch via withCreditGate().
--
-- Pattern matches prior incremental updates:
--   20260405_feedback_credits.sql, 20260416_beta_refill.sql,
--   20260419_referral_system.sql.
--
-- After this migration deploys, lib/services/credit-types.ts must include
-- 'initiativ_discovery' in CreditEventType (kept in sync in the same PR).

ALTER TABLE credit_events DROP CONSTRAINT IF EXISTS credit_events_event_type_check;
ALTER TABLE credit_events ADD CONSTRAINT credit_events_event_type_check
    CHECK (event_type IN (
        'cv_match', 'cover_letter', 'cv_optimize', 'video_script',
        'coaching_session', 'job_search',
        'topup', 'plan_upgrade', 'plan_downgrade',
        'monthly_reset', 'refund', 'admin_adjustment',
        'feedback_bonus', 'beta_refill', 'referral_bonus',
        'initiativ_discovery'
    ));
