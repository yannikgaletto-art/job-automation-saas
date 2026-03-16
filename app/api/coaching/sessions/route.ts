/**
 * DELETE /api/coaching/sessions?jobId={uuid}
 * Deletes all coaching sessions for a specific job.
 *
 * Contract References:
 * - §3: user_id scoped queries
 * - §8: Auth Guard
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function DELETE(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const jobId = request.nextUrl.searchParams.get('jobId');

        if (!jobId) {
            return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });
        }

        // Delete all coaching sessions for this job (Contract §3: user_id scoped)
        const { error } = await supabase
            .from('coaching_sessions')
            .delete()
            .eq('job_id', jobId)
            .eq('user_id', user.id);

        if (error) {
            console.error('[Coaching] Delete sessions error:', error.message);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });

    } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error('[Coaching] Delete sessions route error:', errMsg);
        return NextResponse.json({ error: errMsg }, { status: 500 });
    }
}
