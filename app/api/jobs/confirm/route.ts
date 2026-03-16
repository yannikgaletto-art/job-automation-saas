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
        const safeEdits: Record<string, any> = { status: 'pending' };
        if (edits?.tasks) safeEdits.tasks = edits.tasks;
        if (edits?.hard_requirements) safeEdits.hard_requirements = edits.hard_requirements;
        if (edits?.ats_keywords) safeEdits.ats_keywords = edits.ats_keywords;
        if (edits?.benefits) safeEdits.benefits = edits.benefits;

        const { error } = await supabaseAdmin
            .from('job_queue')
            .update(safeEdits)
            .eq('id', jobId)
            .eq('user_id', user.id)
            .eq('status', 'pending_review'); // Guard: only confirm pending_review jobs

        if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

        return NextResponse.json({ success: true });
    } catch (err: unknown) {
        return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
    }
}
