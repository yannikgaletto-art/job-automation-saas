/**
 * Run the referral notification migration.
 * Usage: npx tsx scripts/migrate-referral-notifications.ts
 */

import { createClient } from '@supabase/supabase-js';

const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

async function run() {
    console.log('🔄 Adding referral notification columns...');

    // Supabase JS client can't run DDL directly, so we use the management API
    // For now, try to read the column — if it errors, the migration is needed
    const { data, error } = await admin
        .from('referrals')
        .select('referrer_notified')
        .limit(1);

    if (error && error.message.includes('referrer_notified')) {
        console.log('❌ Columns do not exist yet. Please run this SQL in the Supabase Dashboard SQL Editor:');
        console.log('');
        console.log(`ALTER TABLE referrals 
    ADD COLUMN IF NOT EXISTS referrer_notified BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS referred_notified BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_referrals_referrer_unnotified 
    ON referrals (referrer_id) WHERE referrer_notified = FALSE;

CREATE INDEX IF NOT EXISTS idx_referrals_referred_unnotified 
    ON referrals (referred_user_id) WHERE referred_notified = FALSE;`);
        console.log('');
        console.log('Then re-run this script to verify.');
    } else {
        console.log('✅ referrer_notified column exists — migration already applied!');
        console.log('Sample data:', data);
    }
}

run().catch(console.error);
