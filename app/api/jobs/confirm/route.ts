import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { z } from 'zod';

const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

        const { jobId } = z.object({ jobId: z.string().uuid() }).parse(await request.json());

        const { error } = await supabaseAdmin
            .from('job_queue')
            .update({ status: 'processing' })
            .eq('id', jobId)
            .eq('user_id', user.id);

        if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

        return NextResponse.json({ success: true });
    } catch (err: unknown) {
        return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
    }
}
