/**
 * Isolated test: load one job from the DB by ID and run filterByVerbatimJDPresence
 * against its actual stored description + buzzwords. This proves whether the filter
 * code itself works on the live data — independent of the request pipeline.
 *
 * Run: npx tsx scripts/test-filter-on-job.ts <jobId>
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { filterByVerbatimJDPresence } from '@/lib/services/ats-keyword-filter';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const jobId = process.argv[2];
if (!jobId) {
    console.error('Usage: npx tsx scripts/test-filter-on-job.ts <jobId>');
    process.exit(1);
}

async function main() {
    const { data: job, error } = await supabase
        .from('job_queue')
        .select('id, company_name, job_title, description, buzzwords, metadata')
        .eq('id', jobId)
        .single();

    if (error || !job) {
        console.error('Job not found:', error?.message);
        process.exit(1);
    }

    console.log(`\n🧪 Testing filter on: ${job.company_name} — ${job.job_title}\n`);
    console.log(`Description (${job.description?.length ?? 0} chars):`);
    console.log('─'.repeat(80));
    console.log((job.description || '').slice(0, 1500));
    console.log('─'.repeat(80));
    console.log(`(truncated to 1500 chars for display, full length used in filter)\n`);

    console.log('Metadata:');
    console.log(JSON.stringify(job.metadata, null, 2));
    console.log();

    const buzzwords: string[] = Array.isArray(job.buzzwords) ? job.buzzwords : [];
    console.log(`Stored buzzwords (${buzzwords.length}): ${buzzwords.join(', ')}\n`);

    const result = filterByVerbatimJDPresence(buzzwords, job.description ?? '');

    console.log(`\n✅ KEPT (${result.kept.length}): ${result.kept.join(', ')}`);
    console.log(`\n❌ REMOVED (${result.removed.length}): ${result.removed.join(', ')}\n`);

    // Also dump if specific terms appear in JD literally
    console.log('Verbatim presence check on suspected hallucinations:');
    const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
    const jdNorm = norm(job.description ?? '');
    for (const term of ['DSGVO', 'ISO 27001', 'PCI DSS', 'Cloud Computing', 'Cybersicherheit', 'GDPR']) {
        const found = jdNorm.includes(norm(term));
        console.log(`   ${term} verbatim in JD: ${found ? '✅ YES' : '❌ NO'}`);
    }
}

main().catch((e) => { console.error(e); process.exit(1); });
