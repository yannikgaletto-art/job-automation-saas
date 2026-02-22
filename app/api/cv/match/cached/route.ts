import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

// Admin client bypasses RLS for consistent reads
const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

// GET /api/cv/match/cached?jobId=xxx
// Returns the saved CV match result from job_queue.metadata directly.
export async function GET(req: NextRequest) {
    try {
        const jobId = req.nextUrl.searchParams.get('jobId');
        if (!jobId) {
            return NextResponse.json({ success: false, error: 'jobId required' }, { status: 400 });
        }

        // Still authenticate the user to ensure they own this job
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        // Use admin client but scope by user_id for security
        const { data: job, error } = await supabaseAdmin
            .from('job_queue')
            .select('metadata')
            .eq('id', jobId)
            .eq('user_id', user.id)
            .single();

        if (error || !job) {
            console.warn('⚠️ CV Match cache lookup failed:', error?.message || 'Job not found');
            return NextResponse.json({ success: false, error: 'Job not found' }, { status: 404 });
        }

        const cvMatch = (job.metadata as Record<string, unknown> | null)?.cv_match ?? null;
        console.log('🔍 CV Match cache lookup:', jobId, cvMatch ? '✅ HIT' : '❌ MISS');

        return NextResponse.json({
            success: true,
            cached: cvMatch,
        });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('❌ Failed to load cached CV match:', msg);
        return NextResponse.json({ success: false, error: msg }, { status: 500 });
    }
}
