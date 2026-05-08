/**
 * Seeds source-backed public signals for the Initiativ Preview.
 *
 * Default target is the isolated Preview/Dev Supabase env file.
 * Run:
 *   ENV_FILE=.env.local.dev-backup-20260507-184855 npx tsx scripts/seed-initiativ-preview-triggers.ts
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import {
    buildPreviewTriggerRows,
    validatePreviewTriggers,
} from '../lib/initiativ/preview-triggers';

const PREVIEW_SUPABASE_REF = 'lteuokkwuvkjqyxxihbk';
const envFile = process.env.ENV_FILE || '.env.local.dev-backup-20260507-184855';

dotenv.config({ path: path.resolve(process.cwd(), envFile) });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
    console.error(`Missing Supabase env vars in ${envFile}`);
    process.exit(1);
}

if (!supabaseUrl.includes(PREVIEW_SUPABASE_REF) && process.env.INITIATIV_PREVIEW_SEED_ALLOW !== '1') {
    console.error(
        `ABORT: target Supabase is not the Initiativ Preview project (${PREVIEW_SUPABASE_REF}).\n`
        + 'Set INITIATIV_PREVIEW_SEED_ALLOW=1 only if you intentionally seed another non-production DB.',
    );
    process.exit(2);
}

const validationErrors = validatePreviewTriggers();
if (validationErrors.length > 0) {
    console.error('Preview trigger validation failed:');
    for (const error of validationErrors) console.error(`- ${error}`);
    process.exit(3);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
    const rows = buildPreviewTriggerRows();

    console.log(`Seeding ${rows.length} source-backed Initiativ Preview triggers.`);
    console.log(`Target: ${new URL(supabaseUrl!).host}`);

    const { data, error } = await supabase
        .from('initiativ_triggers')
        .upsert(rows, { onConflict: 'source_url,trigger_type,company_name' })
        .select('id, company_name, source_name, trigger_date')
        .order('trigger_date', { ascending: false });

    if (error) {
        console.error('Seed failed:', error.message);
        process.exit(4);
    }

    console.log('Seed complete:');
    for (const row of data ?? []) {
        console.log(`- ${row.company_name} (${row.source_name}, ${row.trigger_date})`);
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(5);
});
