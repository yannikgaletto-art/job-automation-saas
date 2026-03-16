import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logging';

// Admin client for DB writes (after Auth Guard verification)
const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
    const requestId = crypto.randomUUID();

    try {
        // §8: Auth Guard
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized', requestId }, { status: 401 });
        }

        const log = logger.forRequest(requestId, user.id, '/api/video/create-token');

        const { jobId } = await request.json() as { jobId: string };
        if (!jobId) {
            return NextResponse.json({ error: 'Missing jobId', requestId }, { status: 400 });
        }

        log.info('Creating video token', { jobId });

        // §3: User-scoped — always use session user.id
        const userId = user.id;

        // Upsert with conflict return (V3 fix: DO UPDATE RETURNING)
        const { data: upsertData, error: upsertError } = await supabaseAdmin
            .from('video_approaches')
            .upsert(
                { user_id: userId, job_id: jobId },
                { onConflict: 'user_id,job_id', ignoreDuplicates: false }
            )
            .select('access_token')
            .single();

        if (upsertError || !upsertData) {
            log.error('Failed to upsert video token', { error: upsertError?.message });
            return NextResponse.json({ error: 'Token creation failed', requestId }, { status: 500 });
        }

        // Contract 2: Double-Assurance — Read-Back
        const { data: readBack } = await supabaseAdmin
            .from('video_approaches')
            .select('access_token')
            .eq('user_id', userId)
            .eq('job_id', jobId)
            .single();

        if (!readBack || readBack.access_token !== upsertData.access_token) {
            log.error('Read-back verification failed for video token');
            return NextResponse.json({ error: 'Token verification failed', requestId }, { status: 500 });
        }

        log.info('Video token created', { accessToken: readBack.access_token });

        return NextResponse.json({
            success: true,
            requestId,
            accessToken: readBack.access_token,
        });

    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error(`[${requestId}] ❌ video/create-token error=${errMsg}`);
        return NextResponse.json({ error: errMsg || 'Token creation failed', requestId }, { status: 500 });
    }
}
