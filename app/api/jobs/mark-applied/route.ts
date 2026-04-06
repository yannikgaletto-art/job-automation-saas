import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { trackApplication } from '@/lib/services/application-history';

export async function POST(request: NextRequest) {
    try {
        // §8: Auth Guard — never trust userId from body
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { jobId } = await request.json() as { jobId: string };

        if (!jobId) {
            return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });
        }

        const admin = getSupabaseAdmin();

        // Step 1: Fetch job details for the CRM bridge (§3: user-scoped)
        const { data: job, error: fetchError } = await admin
            .from('job_queue')
            .select('job_url, source_url, job_title, company_name')
            .eq('id', jobId)
            .eq('user_id', user.id)
            .single();

        if (fetchError || !job) {
            console.error('❌ [mark-applied] Job not found or access denied:', fetchError?.message);
            return NextResponse.json({ error: 'Job not found' }, { status: 404 });
        }

        // Step 2: Update job_queue status to 'submitted' (NO applied_at — column doesn't exist here)
        const { error: updateError } = await admin
            .from('job_queue')
            .update({ status: 'submitted' })
            .eq('id', jobId)
            .eq('user_id', user.id);

        if (updateError) {
            console.error('❌ [mark-applied] DB update failed:', updateError.message);
            return NextResponse.json({ error: 'Database update failed' }, { status: 500 });
        }

        // Step 3: Bridge to Application History CRM
        // Use source_url (real job URL) — fallback to job_url for manual entries
        const trackingUrl = job.source_url || job.job_url;

        const trackResult = await trackApplication({
            userId: user.id,
            jobUrl: trackingUrl,
            companyName: job.company_name || 'Unknown',
            jobTitle: job.job_title || 'Unknown Position',
            applicationMethod: 'manual',
        });

        // Duplicate in application_history is NOT a failure — user already applied before
        if (!trackResult.success && !trackResult.duplicate) {
            console.warn('⚠️ [mark-applied] CRM tracking failed (non-blocking):', trackResult.error);
            // Non-blocking: job_queue status is already updated, CRM is optional
        }

        console.log(`✅ [mark-applied] Job ${jobId} marked as submitted, CRM tracked=${trackResult.success}, duplicate=${!!trackResult.duplicate}`);

        return NextResponse.json({
            success: true,
            duplicate: !!trackResult.duplicate,
        });
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        console.error('❌ [mark-applied] Unhandled error:', msg);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
