import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

/**
 * PATCH /api/jobs/[jobId]/context
 *
 * Saves company_website to job metadata AND invalidates the Perplexity
 * cache for this company so the next enrichCompany call fetches fresh data
 * with the correct context.
 *
 * Batch 7, Punkt 2: Cache-Invalidierung bei nachträglichem Context
 * SICHERHEITSARCHITEKTUR.md Section 3 (user_id filter zwingend)
 * SICHERHEITSARCHITEKTUR.md Section 8 (Auth Guard)
 */
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ jobId: string }> }
) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { jobId } = await params;
        const { company_website } = await req.json();

        if (!company_website || typeof company_website !== 'string') {
            return NextResponse.json({ error: 'company_website is required' }, { status: 400 });
        }

        // 1. Verify job belongs to user (RLS enforcement — Section 3)
        const { data: job, error: jobError } = await supabase
            .from('job_queue')
            .select('id, company_name, metadata')
            .eq('id', jobId)
            .eq('user_id', user.id)
            .maybeSingle();

        if (jobError || !job) {
            return NextResponse.json({ error: 'Job not found' }, { status: 404 });
        }

        // 2. Save company_website to job metadata
        const updatedMeta = {
            ...(job.metadata || {}),
            company_url: company_website.trim(),
        };

        const { error: updateError } = await supabase
            .from('job_queue')
            .update({ metadata: updatedMeta })
            .eq('id', jobId)
            .eq('user_id', user.id);

        if (updateError) {
            console.error('[context/PATCH] Failed to update job metadata:', updateError.message);
            return NextResponse.json({ error: 'Failed to save context' }, { status: 500 });
        }

        // 3. Invalidate company_research cache for this company
        //    Delete the cached row so next enrichCompany triggers a fresh Perplexity fetch
        //    Use admin client because RLS on company_research may block anon/user deletes
        const adminClient = createAdminClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const { error: cacheDeleteError } = await adminClient
            .from('company_research')
            .delete()
            .eq('company_name', job.company_name);

        if (cacheDeleteError) {
            // Non-fatal: log and continue. Next enrichCompany will still use forceRefresh.
            console.warn('[context/PATCH] Cache invalidation warning:', cacheDeleteError.message);
        } else {
            console.log(`🗑️ [context/PATCH] Cache invalidated for "${job.company_name}"`);
        }

        return NextResponse.json({
            success: true,
            message: `Website gespeichert und Cache invalidiert für "${job.company_name}"`,
        });

    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error('[context/PATCH] Error:', errMsg);
        return NextResponse.json({ error: errMsg }, { status: 500 });
    }
}
