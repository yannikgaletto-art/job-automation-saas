/**
 * Clear job_extraction_cache for a specific user.
 * Use after Mistral-prompt or filter-logic changes so re-imports actually
 * trigger fresh extractions instead of replaying stale cached output.
 *
 * Usage:
 *   npx tsx scripts/clear-extraction-cache.ts <email>
 *   npx tsx scripts/clear-extraction-cache.ts info@yannik-galetto.site
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
    console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(url, key);

const email = process.argv[2];
if (!email) {
    console.error('❌ Usage: npx tsx scripts/clear-extraction-cache.ts <email>');
    process.exit(1);
}

async function main() {
    console.log(`🔍 Looking up user: ${email}`);

    const { data: users, error: userErr } = await supabase.auth.admin.listUsers();
    if (userErr) {
        console.error('❌ Failed to list users:', userErr.message);
        process.exit(1);
    }
    const user = users.users.find(u => u.email === email);
    if (!user) {
        console.error(`❌ No user found for "${email}"`);
        process.exit(1);
    }
    console.log(`✅ Auth user id: ${user.id}`);

    const { data: existing, error: selErr } = await supabase
        .from('job_extraction_cache')
        .select('id, description_hash, locale, created_at')
        .eq('user_id', user.id);

    if (selErr) {
        console.error('❌ Failed to read cache:', selErr.message);
        process.exit(1);
    }

    if (!existing || existing.length === 0) {
        console.log('ℹ️  No cache entries found — nothing to clear.');
        process.exit(0);
    }

    console.log(`Found ${existing.length} cache entries:`);
    for (const row of existing) {
        console.log(`  - hash=${row.description_hash.slice(0, 8)}… locale=${row.locale} created=${row.created_at}`);
    }

    const { error: delErr, count } = await supabase
        .from('job_extraction_cache')
        .delete({ count: 'exact' })
        .eq('user_id', user.id);

    if (delErr) {
        console.error('❌ Failed to delete cache:', delErr.message);
        process.exit(1);
    }

    console.log(`✅ Cleared ${count ?? existing.length} cache entries for ${email}.`);
    console.log('   Next import will trigger a fresh Mistral extraction.');
}

main().catch(err => {
    console.error('❌ Unhandled error:', err);
    process.exit(1);
});
