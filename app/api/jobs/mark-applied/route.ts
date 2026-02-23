import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
    try {
        const { jobId, userId } = await request.json() as { jobId: string; userId: string };

        if (!jobId || !userId) {
            return NextResponse.json({ error: 'Missing jobId or userId' }, { status: 400 });
        }

        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        // We assume job_queue has 'status' and 'applied_at'
        const { error } = await supabase
            .from('job_queue')
            .update({ status: 'applied', applied_at: new Date().toISOString() })
            .eq('id', jobId)
            .eq('user_id', userId);

        if (error) {
            console.error('Failed to mark job as applied:', error.message);
            return NextResponse.json({ error: 'Database update failed' }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        console.error('mark-applied route error:', msg);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
