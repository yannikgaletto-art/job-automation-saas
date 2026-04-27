/**
 * Inspect a job's pinned CV snapshot to verify which CV was actually
 * matched against. Pass JOB_ID as the first argument.
 *
 * Usage:
 *   npx tsx scripts/_inspect-job-snapshot.ts e212ce29-d9b8-47ce-8270-ab78b574f4ca
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const JOB_ID = process.argv[2];
if (!JOB_ID) {
    console.error('Usage: npx tsx scripts/_inspect-job-snapshot.ts <JOB_ID>');
    process.exit(1);
}

(async () => {
    const { data: job, error } = await supabase
        .from('job_queue')
        .select('id, job_title, company_name, user_id, metadata')
        .eq('id', JOB_ID)
        .single();

    if (error || !job) {
        console.error('❌ Job not found:', error?.message);
        process.exit(1);
    }

    console.log('═══════════════════════════════════════════════════════════');
    console.log(`JOB:     ${job.job_title} @ ${job.company_name}`);
    console.log(`JOB_ID:  ${job.id}`);
    console.log(`USER_ID: ${job.user_id}`);
    console.log('═══════════════════════════════════════════════════════════');

    const meta = job.metadata as Record<string, unknown> | null;
    if (!meta) {
        console.log('⚠️  No metadata on this job.');
        process.exit(0);
    }

    const cvMatch = meta.cv_match as Record<string, unknown> | undefined;
    if (cvMatch) {
        console.log('\n📊 CV MATCH RESULT:');
        console.log(`   overallScore: ${cvMatch.overallScore}`);
        console.log(`   cv_document_id (input): ${cvMatch.cv_document_id ?? '(none — used master)'}`);
    }

    const snapshot = meta.cv_snapshot as Record<string, unknown> | undefined;
    if (!snapshot) {
        console.log('\n⚠️  No cv_snapshot pinned (legacy job or pre-Welle-B).');
        process.exit(0);
    }

    console.log('\n📌 CV SNAPSHOT (Welle B):');
    console.log(`   document_id:   ${snapshot.document_id ?? '(null)'}`);
    console.log(`   document_name: ${snapshot.document_name ?? '(null)'}`);
    console.log(`   pinned_at:     ${snapshot.pinned_at ?? '(null)'}`);

    const data = snapshot.data as Record<string, unknown> | undefined;
    if (!data) {
        console.log('   data:          (empty)');
        process.exit(0);
    }

    const personalInfo = data.personalInfo as Record<string, unknown> | undefined;
    const experience = data.experience as Array<Record<string, unknown>> | undefined;

    console.log('\n   📍 SNAPSHOT CONTENT (first signals — who is this CV?):');
    if (personalInfo) {
        console.log(`      personalInfo.name:       ${personalInfo.name ?? '(null)'}`);
        console.log(`      personalInfo.targetRole: ${personalInfo.targetRole ?? '(null)'}`);
        console.log(`      personalInfo.summary:    ${typeof personalInfo.summary === 'string' ? `"${personalInfo.summary.slice(0, 100)}…"` : '(null)'}`);
    }
    if (experience && experience.length > 0) {
        console.log(`      experience.length:       ${experience.length}`);
        experience.slice(0, 3).forEach((exp, i) => {
            console.log(`      experience[${i}].role:     ${exp.role ?? '(null)'}`);
            console.log(`      experience[${i}].company:  ${exp.company ?? '(null)'}`);
            const bullets = exp.descriptions as string[] | undefined;
            if (Array.isArray(bullets) && bullets.length > 0) {
                console.log(`      experience[${i}].bullet 0: "${bullets[0].slice(0, 80)}…"`);
            }
        });
    }

    // Cross-check: pull the document this snapshot points to and compare
    if (snapshot.document_id) {
        const { data: doc } = await supabase
            .from('documents')
            .select('id, metadata, created_at')
            .eq('id', snapshot.document_id)
            .maybeSingle();
        if (doc) {
            console.log('\n   📄 SOURCE DOCUMENT (per snapshot.document_id):');
            const docMeta = doc.metadata as Record<string, unknown>;
            console.log(`      original_name: ${docMeta?.original_name ?? '(null)'}`);
            console.log(`      created_at:    ${doc.created_at}`);
            const extracted = docMeta?.extracted_text as string | undefined;
            if (extracted) {
                console.log(`      text preview:  "${extracted.slice(0, 120)}…"`);
            }
        } else {
            console.log('\n   ⚠️ document_id points to non-existent document.');
        }
    }

    // Cross-check: also list ALL of the user's CVs for context
    const { data: allDocs } = await supabase
        .from('documents')
        .select('id, metadata, created_at')
        .eq('user_id', job.user_id)
        .eq('document_type', 'cv')
        .order('created_at', { ascending: false });

    console.log(`\n   📚 ALL USER CVs (${allDocs?.length ?? 0} total):`);
    allDocs?.forEach((d, i) => {
        const m = d.metadata as Record<string, unknown>;
        const flag = d.id === snapshot.document_id ? ' ← PINNED' : '';
        console.log(`      [${i}] ${m?.original_name ?? '(unnamed)'}  id=${d.id.slice(0, 8)}  ${d.created_at}${flag}`);
    });

    console.log('\n═══════════════════════════════════════════════════════════');
})();
