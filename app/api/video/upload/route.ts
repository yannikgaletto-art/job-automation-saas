import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logging';
import { inngest } from '@/lib/inngest/client';
import { getUserLocale } from '@/lib/i18n/get-user-locale';

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

        const log = logger.forRequest(requestId, user.id, '/api/video/upload');
        const { jobId, action } = await request.json() as {
            jobId: string;
            action: 'get-signed-url' | 'confirm-upload';
        };

        if (!jobId || !action) {
            return NextResponse.json({ error: 'Missing jobId or action', requestId }, { status: 400 });
        }

        const userId = user.id;

        if (action === 'get-signed-url') {
            log.info('Generating signed upload URL', { jobId });

            // Check existing entry — if storage_path exists, delete old file first (V3 fix: re-record cleanup)
            const { data: existing } = await supabaseAdmin
                .from('video_approaches')
                .select('storage_path')
                .eq('user_id', userId)
                .eq('job_id', jobId)
                .single();

            if (existing?.storage_path) {
                log.info('Deleting old video before re-upload', { path: existing.storage_path });
                await supabaseAdmin.storage
                    .from('videos')
                    .remove([existing.storage_path]);
            }

            // Generate storage path and signed URL
            const storagePath = `${userId}/${jobId}.webm`;
            const { data: signedData, error: signedError } = await supabaseAdmin.storage
                .from('videos')
                .createSignedUploadUrl(storagePath);

            if (signedError || !signedData) {
                log.error('Failed to create signed upload URL', { error: signedError?.message });
                return NextResponse.json({ error: 'Signed URL creation failed', requestId }, { status: 500 });
            }

            // Update storage path in DB
            await supabaseAdmin
                .from('video_approaches')
                .update({ storage_path: storagePath, updated_at: new Date().toISOString() })
                .eq('user_id', userId)
                .eq('job_id', jobId);

            return NextResponse.json({
                success: true,
                requestId,
                signedUrl: signedData.signedUrl,
                token: signedData.token,
                storagePath,
            });

        } else if (action === 'confirm-upload') {
            log.info('Confirming video upload', { jobId });

            const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

            const { error: updateError } = await supabaseAdmin
                .from('video_approaches')
                .update({
                    status: 'uploaded',
                    uploaded_at: new Date().toISOString(),
                    expires_at: expiresAt,
                    updated_at: new Date().toISOString(),
                })
                .eq('user_id', userId)
                .eq('job_id', jobId);

            if (updateError) {
                log.error('Failed to confirm upload', { error: updateError.message });
                return NextResponse.json({ error: 'Upload confirmation failed', requestId }, { status: 500 });
            }

            // Fire Inngest scheduled deletion
            await inngest.send({
                name: 'video/schedule-deletion',
                data: { userId, jobId, locale: await getUserLocale(userId) },
            });

            log.info('Video upload confirmed, deletion scheduled', { expiresAt });

            return NextResponse.json({
                success: true,
                requestId,
                expiresAt,
            });
        }

        return NextResponse.json({ error: 'Invalid action', requestId }, { status: 400 });

    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error(`[${requestId}] ❌ video/upload error=${errMsg}`);
        return NextResponse.json({ error: errMsg || 'Upload failed', requestId }, { status: 500 });
    }
}
