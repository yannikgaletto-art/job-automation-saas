import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const USER_ID = 'f1cea2b5-0a60-46b9-afc3-59fcb4a1d34c';

(async () => {
    const { data: jobs } = await supabase
        .from('job_queue')
        .select('id, job_title, company_name, status, created_at, metadata')
        .eq('user_id', USER_ID)
        .order('created_at', { ascending: false })
        .limit(10);

    jobs?.forEach(j => {
        const meta = j.metadata as any;
        const snap = meta?.cv_snapshot;
        const proposal = meta?.cv_proposal;
        const optimized = meta?.optimized_cv;
        console.log(`JOB ${j.id} | ${j.company_name} - ${j.job_title} | ${j.status}`);
        console.log(`   created: ${j.created_at}`);
        console.log(`   snapshot: ${snap?.document_name ?? 'none'} (id=${snap?.document_id?.slice(0, 8) ?? '?'} pinned=${snap?.pinned_at ?? '?'})`);
        console.log(`   proposal exists: ${!!proposal}, optimized exists: ${!!optimized}`);
        if (proposal?.translated?.personalInfo?.name) {
            console.log(`   proposal name: "${proposal.translated.personalInfo.name}"`);
            console.log(`   proposal stations: ${proposal.translated.experience?.length}`);
        }
    });
})();
