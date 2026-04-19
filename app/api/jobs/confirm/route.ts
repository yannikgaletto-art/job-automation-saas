import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { z } from 'zod';

const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

/**
 * POST /api/jobs/confirm
 * §12.5: User confirmed the Steckbrief Preview.
 * Transitions pending_review → pending and optionally applies user edits.
 */
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

        const { jobId, edits } = z.object({
            jobId: z.string().uuid(),
            edits: z.object({
                tasks: z.array(z.string()).optional(),
                hard_requirements: z.array(z.string()).optional(),
                ats_keywords: z.array(z.string()).optional(),
                benefits: z.array(z.string()).optional(),
            }).optional(),
        }).parse(await request.json());

        // §12.5: Whitelist-spread — only allowed fields from edits
        // Transition: pending_review → pending (confirmed, enters queue)
        const safeEdits: Record<string, any> = { status: 'pending' };
        if (edits?.tasks) safeEdits.tasks = edits.tasks;
        if (edits?.hard_requirements) safeEdits.requirements = edits.hard_requirements;
        if (edits?.ats_keywords) safeEdits.buzzwords = edits.ats_keywords;
        if (edits?.benefits) safeEdits.benefits = edits.benefits;

        // Guard: Accept jobs in pre-confirmed states (pending, pending_review, processing)
        const { data: updated, error } = await supabaseAdmin
            .from('job_queue')
            .update(safeEdits)
            .eq('id', jobId)
            .eq('user_id', user.id)
            .in('status', ['pending', 'pending_review', 'processing'])
            .select('id');

        if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

        // §1 Double-Assurance: verify the DB was actually updated
        if (!updated || updated.length === 0) {
            console.warn('⚠️ [confirm] No rows affected — job may already be confirmed or in wrong status');
            return NextResponse.json({ success: true, alreadyConfirmed: true });
        }

        return NextResponse.json({ success: true });
    } catch (err: unknown) {
        return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
    }
}
