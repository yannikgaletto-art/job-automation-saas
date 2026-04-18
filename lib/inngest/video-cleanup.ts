import { inngest } from './client';
import { createClient as createAdminClient } from '@supabase/supabase-js';

const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * 1. Event-based deletion: Triggered after video upload.
 *    Sleeps 14 days, then deletes storage file and sets status to 'expired'.
 *    NOTE: pg_cron in the DB runs a daily fallback at 03:30 UTC as the
 *    legal DSGVO Art. 17 guarantee. This Inngest job is best-effort.
 */
export const videoDeleteScheduled = inngest.createFunction(
    { id: 'video-delete-scheduled', name: 'Video Scheduled Deletion' },
    { event: 'video/schedule-deletion' },
    async ({ event, step }) => {
        const { userId, jobId } = event.data;

        // Sleep 14 days
        await step.sleep('wait-14-days', '14d');

        await step.run('delete-video', async () => {
            // Get storage path
            const { data: video } = await supabaseAdmin
                .from('video_approaches')
                .select('storage_path, status, expires_at')
                .eq('user_id', userId)
                .eq('job_id', jobId)
                .single();

            // Already expired (by pg_cron or manual delete) — nothing to do
            if (!video || video.status === 'expired' || !video.storage_path) {
                console.log(`[video-cleanup] Already handled: ${userId}/${jobId} (status=${video?.status})`);
                return;
            }

            // Double-check: only delete if expires_at has actually passed
            if (video.expires_at && new Date(video.expires_at) > new Date()) {
                console.log(`[video-cleanup] Not yet expired: ${userId}/${jobId} — skipping`);
                return;
            }

            // Delete from storage
            if (video.storage_path) {
                const { error } = await supabaseAdmin.storage
                    .from('videos')
                    .remove([video.storage_path]);
                if (error) {
                    console.error(`[video-cleanup] Storage delete failed: ${error.message}`);
                }
            }

            // Mark as expired
            await supabaseAdmin
                .from('video_approaches')
                .update({ status: 'expired', storage_path: null, updated_at: new Date().toISOString() })
                .eq('user_id', userId)
                .eq('job_id', jobId);

            console.log(`[video-cleanup] Expired by Inngest: ${userId}/${jobId}`);
        });
    }
);


/**
 * 2. Daily cron cleanup: Catches any missed deletions and zombie tokens.
 *    Runs at 3:00 AM UTC daily.
 */
export const videoCleanupCron = inngest.createFunction(
    { id: 'video-cleanup-cron', name: 'Video Cleanup Cron' },
    { cron: '0 3 * * *' },
    async ({ step }) => {
        await step.run('cleanup-expired-videos', async () => {
            // 1. Find expired videos that still have storage files
            const { data: expiredVideos } = await supabaseAdmin
                .from('video_approaches')
                .select('id, user_id, job_id, storage_path')
                .eq('status', 'uploaded')
                .lt('expires_at', new Date().toISOString());

            if (expiredVideos && expiredVideos.length > 0) {
                console.log(`[video-cron] Found ${expiredVideos.length} expired videos`);

                for (const video of expiredVideos) {
                    // Delete from storage
                    if (video.storage_path) {
                        await supabaseAdmin.storage
                            .from('videos')
                            .remove([video.storage_path]);
                    }

                    // Mark as expired
                    await supabaseAdmin
                        .from('video_approaches')
                        .update({ status: 'expired', storage_path: null, updated_at: new Date().toISOString() })
                        .eq('id', video.id);
                }
            }

            // 2. Zombie-token cleanup: tokens created > 7 days ago without upload
            const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
            const { data: zombies } = await supabaseAdmin
                .from('video_approaches')
                .select('id')
                .eq('status', 'token_created')
                .lt('created_at', sevenDaysAgo);

            if (zombies && zombies.length > 0) {
                console.log(`[video-cron] Cleaning ${zombies.length} zombie tokens`);
                const ids = zombies.map(z => z.id);
                await supabaseAdmin
                    .from('video_approaches')
                    .delete()
                    .in('id', ids);
            }

            console.log('[video-cron] Cleanup complete');
        });
    }
);
