/**
 * Diagnose-Skript: Zeigt für jeden Job des Users wann er importiert wurde
 * und welche Buzzwords im JD-Text NICHT verbatim vorkommen (also Halluzinationen sein
 * könnten oder Translations/Semantic-Matches die der Filter durchgelassen hat).
 *
 * Run: npx tsx scripts/debug-jobs-ats.ts info@yannik-galetto.site
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { filterByVerbatimJDPresence } from '@/lib/services/ats-keyword-filter';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing SUPABASE env vars in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const TARGET_EMAIL = process.argv[2] || 'info@yannik-galetto.site';

const ATS_FIX_TIMESTAMP = '2026-04-26T08:58:00.000Z'; // when extract-job-pipeline.ts was last edited

async function main() {
    console.log(`\n🔍 Looking up user: ${TARGET_EMAIL}\n`);

    const { data: authUsers, error: authErr } = await supabase.auth.admin.listUsers();
    if (authErr) {
        console.error('❌ Could not list auth users:', authErr.message);
        process.exit(1);
    }

    const user = authUsers.users.find((u) => u.email === TARGET_EMAIL);
    if (!user) {
        console.error(`❌ No auth user found for ${TARGET_EMAIL}`);
        process.exit(1);
    }
    console.log(`✅ Auth user id: ${user.id}\n`);

    const { data: jobs, error } = await supabase
        .from('job_queue')
        .select('id, company_name, job_title, description, buzzwords, source, created_at, metadata')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('❌ DB error:', error.message);
        process.exit(1);
    }

    if (!jobs || jobs.length === 0) {
        console.log('   No jobs in DB for this user.\n');
        return;
    }

    console.log(`Found ${jobs.length} jobs in DB:\n`);
    console.log(`Reference timestamp for ATS-Fix Phase 3: ${ATS_FIX_TIMESTAMP}\n`);
    console.log('═'.repeat(80));

    for (const job of jobs) {
        const isPreFix = job.created_at < ATS_FIX_TIMESTAMP;
        const ageMarker = isPreFix ? '🔴 PRE-FIX (alte Halluzinationen erwartet)' : '🟢 POST-FIX (Filter sollte gewirkt haben)';

        console.log(`\n📌 ${job.company_name} — ${job.job_title}`);
        console.log(`   id=${job.id}`);
        console.log(`   source=${job.source}, created=${job.created_at}`);
        console.log(`   ${ageMarker}`);
        console.log(`   description length: ${job.description?.length ?? 0} chars`);

        const buzzwords: string[] = Array.isArray(job.buzzwords) ? job.buzzwords : [];
        if (buzzwords.length === 0) {
            console.log(`   buzzwords: (none)`);
            continue;
        }

        // Run the verbatim filter against the stored description
        const result = filterByVerbatimJDPresence(buzzwords, job.description ?? '');

        console.log(`\n   📋 Buzzwords (${buzzwords.length} total):`);
        for (const kw of buzzwords) {
            const inJD = result.kept.includes(kw);
            const marker = inJD ? '✅' : '❌';
            console.log(`      ${marker} ${kw}`);
        }

        if (result.removed.length > 0) {
            console.log(`\n   ⚠️  ${result.removed.length} keyword(s) NOT verifiable in JD text:`);
            console.log(`      ${result.removed.join(', ')}`);
            if (isPreFix) {
                console.log(`      → Old job, pre-Fix. These are stored hallucinations from a prior import.`);
            } else {
                console.log(`      → 🚨 NEW JOB after fix — filter should have caught these. Check pipeline.`);
            }
        }
    }

    console.log('\n' + '═'.repeat(80));
    console.log('\nLegend: ✅ = keyword verifiable in JD, ❌ = NOT in JD (likely hallucination)');
    console.log('         🔴 PRE-FIX = imported before 2026-04-26 09:00 (old halluzinations expected)');
    console.log('         🟢 POST-FIX = imported after fix (these MUST be clean — if not, bug)\n');
}

main().catch((e) => {
    console.error('❌ Fatal:', e);
    process.exit(1);
});
