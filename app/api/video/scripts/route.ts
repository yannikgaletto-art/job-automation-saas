import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const supabaseAdmin = getSupabaseAdmin();

/**
 * GET /api/video/scripts?jobId=X
 * 
 * Initial load route — returns existing script for a job, or null if none exists.
 * No AI call. Used by frontend on mount to decide: "load" vs "generate".
 * 
 * Contracts: §8 (Auth Guard), §3 (user-scoped)
 */
export async function GET(request: NextRequest) {
    try {
        // §8: Auth Guard
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const jobId = request.nextUrl.searchParams.get('jobId');
        if (!jobId) {
            return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });
        }

        // §3: user-scoped query
        const { data: script } = await supabaseAdmin
            .from('video_scripts')
            .select('id, mode, blocks, keywords_covered, categorized_keywords, wpm_speed, created_at, updated_at')
            .eq('user_id', user.id)
            .eq('job_id', jobId)
            .maybeSingle();

        // Also load block templates for the editor
        const { data: templates } = await supabaseAdmin
            .from('script_block_templates')
            .select('id, name, is_system, is_required, default_duration_seconds, sort_order')
            .or(`user_id.is.null,user_id.eq.${user.id}`)
            .order('sort_order', { ascending: true });

        // Load keywords from job_queue (no AI call)
        const { data: job } = await supabaseAdmin
            .from('job_queue')
            .select('ats_keywords, buzzwords, hard_requirements, job_title, company_name')
            .eq('id', jobId)
            .eq('user_id', user.id)
            .single();

        if (!job) {
            return NextResponse.json({ error: 'Job not found' }, { status: 404 });
        }

        // Deduplicate raw keywords
        const rawKeywords = [
            ...(job.ats_keywords || []),
            ...(job.buzzwords || []),
            ...(job.hard_requirements || []),
        ];
        const uniqueKeywords = [...new Set(rawKeywords.map((k: string) => k.trim()).filter(Boolean))];

        return NextResponse.json({
            script: script || null,
            templates: templates || [],
            rawKeywords: uniqueKeywords,
            job: {
                jobTitle: job.job_title,
                companyName: job.company_name,
            },
        });

    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error(`❌ video/scripts GET error=${errMsg}`);
        return NextResponse.json({ error: errMsg }, { status: 500 });
    }
}
