import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const JOB_ID = process.argv[2];
if (!JOB_ID) {
    console.error('Usage: npx tsx scripts/_inspect-optimizer-proposal.ts <JOB_ID>');
    process.exit(1);
}

(async () => {
    const { data: job } = await supabase
        .from('job_queue')
        .select('id, job_title, cv_optimization_proposal, metadata')
        .eq('id', JOB_ID)
        .single();

    if (!job) {
        console.error('Job not found');
        process.exit(1);
    }

    console.log(`JOB: ${job.job_title}`);
    const proposal = job.cv_optimization_proposal as Record<string, unknown> | null;
    if (!proposal) {
        console.log('NO proposal yet');
        process.exit(0);
    }

    console.log('\nproposal keys:', Object.keys(proposal));
    const translated = proposal.translated as Record<string, unknown> | undefined;
    const original = proposal.original as Record<string, unknown> | undefined;
    const changes = proposal.changes as unknown[] | undefined;

    console.log('\nchanges count:', Array.isArray(changes) ? changes.length : '(none)');

    function showCv(label: string, cv: Record<string, unknown> | undefined) {
        console.log(`\n=== ${label} ===`);
        if (!cv) { console.log('(missing)'); return; }
        const pi = cv.personalInfo as Record<string, unknown> | undefined;
        console.log('personalInfo.name:', pi?.name ?? '(null)');
        console.log('personalInfo.email:', pi?.email ?? '(null)');
        console.log('personalInfo.phone:', pi?.phone ?? '(null)');
        console.log('personalInfo.location:', pi?.location ?? '(null)');
        console.log('personalInfo.linkedin:', pi?.linkedin ?? '(null)');
        console.log('personalInfo.targetRole:', pi?.targetRole ?? '(null)');
        console.log('personalInfo.summary:', pi?.summary ? `"${String(pi.summary).slice(0, 100)}…"` : '(null)');
        const experience = cv.experience as Array<Record<string, unknown>> | undefined;
        console.log('experience.length:', experience?.length ?? 0);
        const certifications = cv.certifications as Array<Record<string, unknown>> | undefined;
        console.log('certifications.length:', certifications?.length ?? 0);
        certifications?.forEach((c, i) => {
            console.log(`  cert[${i}]: name="${c.name}" issuer="${c.issuer ?? '(null)'}" date="${c.dateText ?? '(null)'}"`);
            if (c.description) console.log(`     description: "${String(c.description).slice(0, 150)}…"`);
        });
    }

    showCv('ORIGINAL (input to Optimizer)', original);
    showCv('TRANSLATED (Optimizer output)', translated);

    if (Array.isArray(changes)) {
        console.log('\n=== CHANGES (first 5) ===');
        changes.slice(0, 5).forEach((c: any, i) => {
            console.log(`[${i}] type=${c.type} target=${c.target?.section}/${c.target?.field} entityId=${c.target?.entityId}`);
            console.log(`    before: ${(c.before ?? '').slice(0, 80)}`);
            console.log(`    after:  ${(c.after ?? '').slice(0, 80)}`);
        });
    }
})();
