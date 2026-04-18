import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logging';

const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST /api/video/delete
 *
 * Deletes an uploaded video but preserves the access_token (QR stays valid for re-record).
 * Does NOT delete video_scripts — user can re-record without regenerating script.
 *
 * Contracts: §8 (Auth Guard), §3 (user-scoped), §1 (Double-Assurance)
 */
export async function POST(request: NextRequest) {
    const requestId = crypto.randomUUID();

    try {
        // §8: Auth Guard
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized', requestId }, { status: 401 });
        }

        const log = logger.forRequest(requestId, user.id, '/api/video/delete');
        const { jobId } = await request.json() as { jobId: string };

        if (!jobId) {
            return NextResponse.json({ error: 'Missing jobId', requestId }, { status: 400 });
        }

        const userId = user.id;

        // §3: Read storage_path from DB (NEVER from request body — prevents cross-user deletion)
        const { data: existing } = await supabaseAdmin
            .from('video_approaches')
            .select('storage_path, status')
            .eq('user_id', userId)
            .eq('job_id', jobId)
            .single();

        if (!existing) {
            return NextResponse.json({ error: 'Video not found', requestId }, { status: 404 });
        }

        if (existing.status !== 'uploaded') {
            return NextResponse.json({ error: 'No uploaded video to delete', requestId }, { status: 400 });
        }

        // Delete file from Supabase Storage
        if (existing.storage_path) {
            const { error: storageError } = await supabaseAdmin.storage
                .from('videos')
                .remove([existing.storage_path]);

            if (storageError) {
                log.error('Storage delete failed — proceeding with DB cleanup', { error: storageError.message });
                // Non-fatal: file might already be gone (expired cron). Continue with DB reset.
            }
        }

        // Reset video_approaches: keep access_token intact (QR stays valid for re-record)
        // Set expires_at = NULL to neutralize the Inngest scheduled deletion job
        const { error: updateError } = await supabaseAdmin
            .from('video_approaches')
            .update({
                status: 'token_created',
                storage_path: null,
                uploaded_at: null,
                expires_at: null,
                view_count: 0,
                first_viewed_at: null,
                updated_at: new Date().toISOString(),
            })
            .eq('user_id', userId)
            .eq('job_id', jobId);

        if (updateError) {
            log.error('Failed to reset video_approaches', { error: updateError.message });
            return NextResponse.json({ error: 'Delete failed', requestId }, { status: 500 });
        }

        // §1 Double-Assurance: Read-Back verification
        const { data: verify } = await supabaseAdmin
            .from('video_approaches')
            .select('status, storage_path')
            .eq('user_id', userId)
            .eq('job_id', jobId)
            .single();

        if (!verify || verify.status !== 'token_created' || verify.storage_path !== null) {
            log.error('Double-Assurance failed — video_approaches not properly reset');
            return NextResponse.json({ error: 'Delete verification failed', requestId }, { status: 500 });
        }

        log.info('Video deleted successfully', { jobId });

        return NextResponse.json({
            success: true,
            requestId,
        });

    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error(`[${requestId}] ❌ video/delete error=${errMsg}`);
        return NextResponse.json({ error: errMsg || 'Delete failed', requestId }, { status: 500 });
    }
}
