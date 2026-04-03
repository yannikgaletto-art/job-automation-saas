import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { getCVText } from '@/lib/services/cv-text-retriever';
import { inngest } from '@/lib/inngest/client';
import { createRateLimiter, checkRateLimit } from '@/lib/api/rate-limit';
import { logger } from '@/lib/logging';
import { getUserLocale } from '@/lib/i18n/get-user-locale';
import { withCreditGate, handleBillingError } from '@/lib/middleware/credit-gate';
import { CREDIT_COSTS } from '@/lib/services/credit-types';

// Rate limit: 5 CV match requests per minute per user
const cvMatchLimiter = createRateLimiter({ maxRequests: 5, windowMs: 60_000 });

/**
 * POST /api/cv/match — Smart Trigger
 *
 * DEV:  Runs synchronously (no Inngest CLI needed locally).
 * PROD: Fires Inngest background event (no Vercel timeout risk).
 *
 * Contracts: §8 (Auth Guard), §3 (user-scoped), §2 (CV Safety), JSONB Merge Pflicht
 */

const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(req: NextRequest) {
    try {
        const { jobId, cvDocumentId, forceRestart } = await req.json();
        if (!jobId) {
            return NextResponse.json({ error: 'Job ID is required' }, { status: 400 });
        }

        // §8: Auth Guard
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Rate limit check (5 req/min per user)
        const rateLimited = checkRateLimit(cvMatchLimiter, user.id, 'cv/match');
        if (rateLimited) return rateLimited;

        const log = logger.forRequest(undefined, user.id, '/api/cv/match');
        log.info('CV Match requested', { jobId });

        // §3: Ownership check (user-scoped)
        const { data: job } = await supabaseAdmin
            .from('job_queue')
            .select('id, job_title, company_name, description, requirements, buzzwords, seniority, location, metadata')
            .eq('id', jobId)
            .eq('user_id', user.id)
            .single();

        if (!job) {
            return NextResponse.json({ error: 'Job not found' }, { status: 404 });
        }

        // §2: CV Safety — verify CV exists before any processing
        const cvData = await getCVText(user.id, cvDocumentId);
        if (!cvData) {
            return NextResponse.json({
                error: 'CV not found or empty. Please upload your CV in settings.',
                code: 'CV_NOT_FOUND',
            }, { status: 400 });
        }

        // ── Stale-Recovery Check (Batch 2.1) ────────────────────────────
        // If already processing, check if it's stale (> 2.5 min, synced with frontend polling timeout).
        // If forceRestart is true (user clicked "Try again" after timeout), skip this check entirely.
        const currentMetadata = (job.metadata as Record<string, unknown>) || {};
        const existingStatus = currentMetadata.cv_match_status as string | undefined;
        const startedAt = currentMetadata.cv_match_started_at as string | undefined;

        if (!forceRestart && existingStatus === 'processing' && startedAt) {
            const elapsed = Date.now() - new Date(startedAt).getTime();
            // §BUG-FIX #2: Aligned with frontend mount-check (4min) to close the dead-zone
            // where the API blocked restarts but the frontend was still polling.
            // API: 4min | Frontend mount: 4min | Frontend poll limit: 6min (last resort)
            const STALE_THRESHOLD_MS = 240_000; // 4 min

            if (elapsed < STALE_THRESHOLD_MS) {
                // Still within threshold — don't re-trigger
                console.log(`⏳ [CV Match] Already processing for ${Math.round(elapsed / 1000)}s — skipping re-trigger`);
                return NextResponse.json({ success: true, status: 'processing' });
            }
            // Stale — reset and re-trigger below
            console.warn(`⚠️ [CV Match] Stale processing detected (${Math.round(elapsed / 1000)}s) — re-triggering`);
        } else if (forceRestart) {
            console.log(`🔄 [CV Match] Force restart requested — bypassing stale check`);
        }

        // Set processing status + timestamp in metadata (JSONB Merge!)
        await supabaseAdmin
            .from('job_queue')
            .update({
                metadata: {
                    ...currentMetadata,
                    cv_match_status: 'processing',
                    cv_match_started_at: new Date().toISOString(),
                },
            })
            .eq('id', jobId)
            .eq('user_id', user.id);

        // §BILLING: Credit Gate — debit 0.5 credits, auto-refund if Inngest send fails
        console.log('🚀 [CV Match] About to fire Inngest event...');
        const userLocale = await getUserLocale(user.id);
        const sendResult = await withCreditGate(
            user.id,
            CREDIT_COSTS.cv_match,
            'cv_match',
            () => inngest.send({
                name: 'cv-match/analyze',
                data: {
                    jobId,
                    userId: user.id,
                    cvDocumentId: cvData.documentId,
                    locale: userLocale,
                },
            }),
            jobId
        );
        console.log('🚀 [CV Match] Inngest event fired successfully!', sendResult);

        return NextResponse.json({ success: true, status: 'processing' });

    } catch (error: any) {
        const billingResponse = handleBillingError(error);
        if (billingResponse) return billingResponse;

        const msg = error?.message || String(error);
        console.error('❌ CV Match FATAL ERROR:', error);
        console.error('❌ Stack:', error?.stack);
        return NextResponse.json({ error: msg, success: false }, { status: 500 });
    }
}
