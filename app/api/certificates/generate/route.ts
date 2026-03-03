/**
 * POST /api/certificates/generate
 * Triggers certificate recommendation generation for a job.
 *
 * Contract References:
 * - §3: user_id scoped queries
 * - §8: Auth Guard
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { inngest } from '@/lib/inngest/client';

export async function POST(request: NextRequest) {
    try {
        // Auth Guard (Contract §8)
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { jobId } = await request.json() as { jobId?: string };

        if (!jobId) {
            return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });
        }

        // Verify job belongs to user (Contract §3)
        const { data: job, error: jobError } = await supabase
            .from('job_queue')
            .select('id, status')
            .eq('id', jobId)
            .eq('user_id', user.id)
            .single();

        if (jobError || !job) {
            return NextResponse.json({ error: 'Job not found or access denied' }, { status: 404 });
        }

        // Verify CV exists (Contract §2)
        const { data: cvDoc } = await supabase
            .from('documents')
            .select('id')
            .eq('user_id', user.id)
            .eq('document_type', 'cv')
            .limit(1)
            .single();

        if (!cvDoc) {
            return NextResponse.json(
                { error: 'CV not found. Please upload your CV in Settings first.' },
                { status: 400 }
            );
        }

        // Verify status is cv_match_done or higher
        const validStatuses = ['cv_matched', 'cv_match_done', 'cv_optimized', 'cover_letter_done', 'ready_for_review', 'ready_to_apply'];
        if (!validStatuses.includes(job.status?.toLowerCase() || '')) {
            return NextResponse.json(
                { error: 'CV Match must be completed first.' },
                { status: 400 }
            );
        }

        // Check if already exists (idempotency)
        const { data: existing } = await supabase
            .from('job_certificates')
            .select('id, status, updated_at')
            .eq('job_id', jobId)
            .eq('user_id', user.id)
            .single();

        if (existing) {
            // If already done → return immediately (no re-generation)
            if (existing.status === 'done') {
                return NextResponse.json({
                    success: true,
                    certificateId: existing.id,
                    status: existing.status,
                });
            }
            // If processing but NOT stale → return in-progress status
            if (existing.status === 'processing') {
                const updatedAt = new Date((existing as any).updated_at || 0).getTime();
                const staleThresholdMs = 5 * 60 * 1000; // 5 minutes
                const isStale = Date.now() - updatedAt > staleThresholdMs;
                if (!isStale) {
                    return NextResponse.json({
                        success: true,
                        certificateId: existing.id,
                        status: existing.status,
                    });
                }
                // Stale processing → reset to pending so Inngest re-runs
                console.log(`[Certificates] Stale processing record detected — resetting to pending for job=${jobId}`);
            }
            // If failed or stale processing → allow re-generation by resetting to pending
            if (existing.status === 'failed' || existing.status === 'processing') {
                await supabase
                    .from('job_certificates')
                    .update({ status: 'pending', updated_at: new Date().toISOString() })
                    .eq('id', existing.id);
            }
        }

        // Create entry if not exists
        let certificateId = existing?.id;
        if (!existing) {
            const { data: inserted, error: insertError } = await supabase
                .from('job_certificates')
                .insert({
                    job_id: jobId,
                    user_id: user.id,
                    status: 'pending',
                })
                .select('id')
                .single();

            if (insertError || !inserted) {
                return NextResponse.json(
                    { error: `Failed to create certificate entry: ${insertError?.message}` },
                    { status: 500 }
                );
            }
            certificateId = inserted.id;
        }

        // Send Inngest Event
        await inngest.send({
            name: 'certificates/generate',
            data: { jobId, userId: user.id },
        });

        console.log(`[Certificates] Triggered generation for job=${jobId} user=${user.id}`);

        return NextResponse.json({
            success: true,
            certificateId,
        });

    } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error('[Certificates] Generate route error:', errMsg);
        return NextResponse.json({ error: errMsg }, { status: 500 });
    }
}
