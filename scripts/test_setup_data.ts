import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
    console.log('Fetching a job ID...');
    const { data: jobs, error: err0 } = await supabase
        .from('job_queue')
        .select('id, company_name')
        .order('created_at', { ascending: false })
        .limit(1);

    if (err0 || !jobs || jobs.length === 0) {
        console.error('Failed to get a job:', err0);
        return;
    }

    const jobId = jobs[0].id;
    console.log(`Using jobId: ${jobId}`);

    console.log('--- Test Query 1: job_queue ---');
    const jobRes = await supabase
        .from('job_queue')
        .select('requirements, metadata, company_name, company_research_id')
        .eq('id', jobId)
        .single();

    if (jobRes.error) {
        console.error('❌ Query 1 error:', jobRes.error);
    } else {
        console.log('✅ Query 1 success, company_research_id:', jobRes.data.company_research_id);
    }

    const companyName = jobRes.data?.company_name;

    console.log('\n--- Test Query 2: company_research by name ---');
    if (companyName) {
        const researchRes = await supabase
            .from('company_research')
            .select('intel_data, suggested_quotes, recent_news, linkedin_activity, perplexity_citations')
            .eq('company_name', companyName)
            .gt('expires_at', new Date().toISOString())
            .order('researched_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (researchRes.error) {
            console.error('❌ Query 2 error:', researchRes.error);
        } else {
            console.log('✅ Query 2 success');
        }
    }
}

run().catch(console.error);
