-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Add notification flags to referrals table
-- Feature-Silo: §11 Referral Notifications
-- 
-- Adds boolean columns to track whether each party has seen their
-- referral bonus popup. Used by GET /api/referral/notifications.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE referrals 
    ADD COLUMN IF NOT EXISTS referrer_notified BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS referred_notified BOOLEAN DEFAULT FALSE;

-- Partial index: only scan for unread notifications (small result set)
CREATE INDEX IF NOT EXISTS idx_referrals_referrer_unnotified 
    ON referrals (referrer_id) WHERE referrer_notified = FALSE;

CREATE INDEX IF NOT EXISTS idx_referrals_referred_unnotified 
    ON referrals (referred_user_id) WHERE referred_notified = FALSE;
