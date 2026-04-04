-- Migration: Waitlist Leads with Double-Opt-In
-- Stores early-access signups from the marketing website.
-- DSGVO: IP stored as SHA-256 hash, DOI required for newsletter updates.
-- Date: 2026-04-03

CREATE TABLE IF NOT EXISTS waitlist_leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    source TEXT DEFAULT 'website',              -- 'website', 'extension', 'referral'
    locale TEXT DEFAULT 'de',                   -- de/en/es (from website URL)
    ip_hash TEXT,                               -- SHA-256 of IP (DSGVO: pseudonymized)
    utm_source TEXT,                            -- optional: campaign tracking

    -- Double-Opt-In (DSGVO Art. 7 — required for regular updates)
    confirmation_token UUID DEFAULT gen_random_uuid(),
    confirmed_at TIMESTAMPTZ,                   -- NULL = unconfirmed

    created_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT waitlist_leads_email_unique UNIQUE (email)
);

-- Index for admin queries
CREATE INDEX IF NOT EXISTS idx_waitlist_leads_created
    ON waitlist_leads(created_at DESC);

-- RLS: No client-side access. All operations use Service Role Key.
ALTER TABLE waitlist_leads ENABLE ROW LEVEL SECURITY;
-- No policies = invisible to all authenticated users via client SDK.
-- Only admin API routes (using SUPABASE_SERVICE_ROLE_KEY) can read/write.
