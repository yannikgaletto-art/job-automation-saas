export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { cleanAtsKeywords } from '@/lib/services/ats-keyword-filter';
import { cleanJobBenefits } from '@/lib/services/job-benefit-filter';

// Admin client for bypassing RLS
const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function GET() {
    try {
        // Authenticate
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
        }

        // Fetch jobs from job_queue for this user
        const { data: jobs, error } = await supabaseAdmin
            .from('job_queue')
            .select(`
                id, 
                job_url, 
                source_url,
                company_website,
                job_title, 
                company_name, 
                location, 
                salary_range, 
                platform, 
                status, 
                created_at, 
                description, 
                requirements, 
                summary, 
                seniority, 
                benefits, 
                responsibilities, 
                buzzwords, 
                metadata,
                company_research (
                    intel_data,
                    suggested_quotes,
                    recent_news,
                    perplexity_citations
                )
            `)
            .eq('user_id', user.id)
            .neq('status', 'pending_review') // §12.5: exclude Steckbrief Preview jobs
            .neq('status', 'submitted') // Submitted jobs live in Application History CRM only
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) {
            console.error('❌ Failed to fetch jobs:', error);
            return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }

        const sanitizedJobs = (jobs || []).map((job) => {
            const cleanedBuzzwords = cleanAtsKeywords(
                Array.isArray(job.buzzwords) ? job.buzzwords : [],
                job.description || null
            );

            return {
                ...job,
                buzzwords: cleanedBuzzwords.kept.length > 0 ? cleanedBuzzwords.kept : null,
                benefits: cleanJobBenefits(Array.isArray(job.benefits) ? job.benefits : []),
            };
        });

        return NextResponse.json({ success: true, jobs: sanitizedJobs });
    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        return NextResponse.json({ success: false, error: errMsg }, { status: 500 });
    }
}
