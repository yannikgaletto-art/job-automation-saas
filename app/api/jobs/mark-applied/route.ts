import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
    try {
        // Auth: verify session — never trust userId from body
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { jobId } = await request.json() as { jobId: string };

        if (!jobId) {
            return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });
        }

        const admin = createAdminClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const { error } = await admin
            .from('job_queue')
            .update({ status: 'submitted', applied_at: new Date().toISOString() })
            .eq('id', jobId)
            .eq('user_id', user.id);

        if (error) {
            console.error('Failed to mark job as applied:', error.message);
            return NextResponse.json({ error: 'Database update failed', detail: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        console.error('mark-applied route error:', msg);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
