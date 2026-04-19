import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { inngest } from '@/lib/inngest/client';
import { getUserLocale } from '@/lib/i18n/get-user-locale';

const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
    try {
        // §8: Auth Guard
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const jobId = request.nextUrl.searchParams.get('jobId');
        if (!jobId) {
            return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });
        }

        const { data: videoApproach } = await supabaseAdmin
            .from('video_approaches')
            .select('status, talking_points, expires_at, storage_path, access_token, view_count, first_viewed_at')
            .eq('user_id', user.id)
            .eq('job_id', jobId)
            .maybeSingle();

        if (!videoApproach) {
            // Fix 9: Check if a video_scripts entry exists (user already started scripting)
            const { data: existingScript } = await supabaseAdmin
                .from('video_scripts')
                .select('id')
                .eq('user_id', user.id)
                .eq('job_id', jobId)
                .maybeSingle();

            return NextResponse.json({
                status: null,
                talkingPoints: null,
                expiresAt: null,
                hasVideo: false,
                hasScript: !!existingScript,
                accessToken: null,
            });
        }

        // V3 fix: Reconciliation — if DB says token_created but file exists in storage
        if (videoApproach.status === 'token_created' && videoApproach.storage_path) {
            const { data: fileList } = await supabaseAdmin.storage
                .from('videos')
                .list(videoApproach.storage_path.split('/').slice(0, -1).join('/'), {
                    search: videoApproach.storage_path.split('/').pop(),
                });

            if (fileList && fileList.length > 0) {
                // Auto-confirm: file exists despite status mismatch
                const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
                await supabaseAdmin
                    .from('video_approaches')
                    .update({
                        status: 'uploaded',
                        uploaded_at: new Date().toISOString(),
                        expires_at: expiresAt,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('user_id', user.id)
                    .eq('job_id', jobId);

                // QA fix: Also fire Inngest deletion — without this, reconciled
                // videos only get cleaned up by pg_cron (no user notification).
                inngest.send({
                    name: 'video/schedule-deletion',
                    data: { userId: user.id, jobId, locale: await getUserLocale(user.id) },
                }).catch(() => { /* best-effort — pg_cron is the hard fallback */ });

                return NextResponse.json({
                    status: 'uploaded',
                    talkingPoints: videoApproach.talking_points?.items || null,
                    expiresAt,
                    hasVideo: true,
                    accessToken: videoApproach.access_token,
                    viewCount: 0,
                    firstViewedAt: null,
                });
            }
        }

        return NextResponse.json({
            status: videoApproach.status,
            talkingPoints: videoApproach.talking_points?.items || null,
            expiresAt: videoApproach.expires_at,
            hasVideo: videoApproach.status === 'uploaded',
            hasScript: true,
            accessToken: videoApproach.access_token,
            viewCount: videoApproach.view_count ?? 0,
            firstViewedAt: videoApproach.first_viewed_at ?? null,
        });

    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error(`❌ video/status error=${errMsg}`);
        return NextResponse.json({ error: errMsg }, { status: 500 });
    }
}
