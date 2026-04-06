import crypto from 'crypto';
import { generateCoverLetterWithQuality } from '@/lib/services/cover-letter-generator';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createRateLimiter, checkRateLimit } from '@/lib/api/rate-limit';
import { logger } from '@/lib/logging';
import { inngest } from '@/lib/inngest/client';
import { getUserLocale } from '@/lib/i18n/get-user-locale';
import { withCreditGate, handleBillingError } from '@/lib/middleware/credit-gate';
import { CREDIT_COSTS } from '@/lib/services/credit-types';
import { parseGenerateRequest } from '@/lib/schemas/cover-letter-schema';
import type { CoverLetterSetupContext } from '@/types/cover-letter-setup';

export const maxDuration = 120; // Vercel timeout — frontend client waits 180s, server allows 120s

// Rate limit: 3 cover letter requests per minute per user
const coverLetterLimiter = createRateLimiter({ maxRequests: 3, windowMs: 60_000 });

// Admin client for DB writes (used after Auth Guard verification)
const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);
export async function POST(request: NextRequest) {
    const requestId = crypto.randomUUID();

    try {
        // §8: Auth Guard — verify session before any processing
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized', requestId }, { status: 401 });
        }

        // Rate limit check (3 req/min per user)
        const rateLimited = checkRateLimit(coverLetterLimiter, user.id, 'cover-letter/generate');
        if (rateLimited) return rateLimited;

        const log = logger.forRequest(requestId, user.id, '/api/cover-letter/generate');
        log.info('Cover letter generation started');

        // §3: User-scoped — always use session user.id, never trust body
        const userId = user.id;

        // §SANITIZE: Zod schema — repairs bad input, never blocks
        const rawBody = await request.json();
        const { data: parsed, warnings: sanitizationWarnings } = parseGenerateRequest(rawBody);
        const { jobId, targetFix, currentLetter } = parsed;
        // Zod sanitizes 5 critical fields (tone, stations, quote); passthrough preserves the rest.
        // Cast is safe because the frontend always sends the full CoverLetterSetupContext shape.
        const setupContext = parsed.setupContext as unknown as CoverLetterSetupContext | undefined;
        const fixMode = parsed.fixMode as 'full' | 'targeted' | undefined;

        console.log(`[${requestId}] route=cover-letter/generate step=start userId=${userId} jobId=${jobId ?? 'none'} fixMode=${fixMode || 'full'}`);

        if (!jobId) {
            return NextResponse.json({ error: 'Missing jobId', requestId }, { status: 400 });
        }

        if (!setupContext && fixMode !== 'targeted') {
            console.warn(`[${requestId}] ⚠️ No setupContext provided — generation quality will be reduced`);
        }

        // Collect warnings for transparent user communication
        const warnings: string[] = [...sanitizationWarnings];
        if (!setupContext && fixMode !== 'targeted') {
            warnings.push('Kein Setup-Kontext — generische Qualität.');
        }

        // §BILLING: Credit Gate — debit 0.5 credits, auto-refund on AI failure
        const result = await withCreditGate(
            userId,
            CREDIT_COSTS.cover_letter,
            'cover_letter',
            () => generateCoverLetterWithQuality(jobId, userId, setupContext, fixMode, targetFix, currentLetter),
            jobId
        );

        // Merge generator-level warnings (orphan-guard, style-fallback) into the route warnings array
        if (result.generationWarnings?.length) {
            warnings.push(...result.generationWarnings);
        }

        console.log(`[${requestId}] step=complete iterations=${result.iterations} judge=${result.judgePassed ? 'PASS' : 'FAIL'} cost=${result.costCents}¢`);

        // ─── B1.4: Auto-Save as Draft ─────────────────────────────────────────
        // Contract 2 (Document Storage Safety): Write → Read-Back → Validate

        const { data: insertData, error: insertError } = await supabaseAdmin.from('documents').insert({
            user_id: userId,
            document_type: 'cover_letter',
            file_url_encrypted: `generated:${requestId}`, // §2: Meaningful identifier instead of dummy
            metadata: {
                status: 'draft',
                job_id: jobId,
                generated_content: result.coverLetter,
                judge_passed: result.judgePassed,
                judge_fail_reasons: result.judgeFailReasons,
                validation: result.finalValidation,
                iterations: result.iterations,
                setup_context: setupContext ?? null,
                cost_cents: result.costCents,
                fluff_warning: result.fluffWarning ?? false,
                polish_status: 'pending', // Will be updated by Inngest cover-letter/polish job
            },
            origin: 'generated', // Data Hygiene: distinguish AI drafts from user uploads
            pii_encrypted: {}
        }).select('id').single();

        let draftId: string | null = null;

        if (insertError) {
            console.error(`[${requestId}] ❌ Failed to save cover letter draft: ${insertError.message}`);
        } else {
            draftId = insertData?.id ?? null;

            // Read-Back Verification (Contract 2: Double-Assurance)
            if (draftId) {
                const { data: readBack } = await supabaseAdmin
                    .from('documents')
                    .select('id, metadata')
                    .eq('id', draftId)
                    .single();

                if (!readBack || readBack.metadata?.status !== 'draft') {
                    console.error(`[${requestId}] ❌ Read-back verification FAILED for draft ${draftId}`);
                } else {
                    console.log(`[${requestId}] ✅ Draft saved and verified: ${draftId}`);
                }
            }
        }

        // P5: Update job_queue status so stepper and other features know CL is done
        const { error: statusError } = await supabaseAdmin
            .from('job_queue')
            .update({ status: 'cover_letter_done', updated_at: new Date().toISOString() })
            .eq('id', jobId)
            .eq('user_id', userId);

        if (statusError) {
            console.warn(`[${requestId}] ⚠️ Failed to update job_queue status: ${statusError.message}`);
        }

        // ─── Dispatch Inngest cover-letter/polish for async improvements ────────
        if (draftId && fixMode !== 'targeted') {
            try {
                await inngest.send({
                    name: 'cover-letter/polish',
                    data: {
                        draftId,
                        userId,
                        locale: await getUserLocale(userId),
                        coverLetter: result.coverLetter,
                        fluffFound: result.fluffWarning ?? false,
                        jobData: undefined, // Job data already in DB — polish job reads it
                        companyResearch: undefined,
                        setupContext: setupContext ?? undefined,
                    },
                });
                console.log(`[${requestId}] ✅ Polish job dispatched for draft ${draftId}`);
            } catch (inngestErr) {
                // Non-fatal: polish is best-effort improvement
                console.warn(`[${requestId}] ⚠️ Failed to dispatch polish job:`, inngestErr);
            }
        }

        return NextResponse.json({
            success: true,
            requestId,
            draft_id: draftId,
            cover_letter: result.coverLetter,
            judge_passed: result.judgePassed,
            judge_fail_reasons: result.judgeFailReasons,
            validation: result.finalValidation,
            iterations: result.iterations,
            iteration_log: result.iterationLog,
            fluff_warning: result.fluffWarning ?? false,
            polish_status: draftId ? 'pending' : null, // Frontend uses this to show polish banner
            warnings, // Transparent fallback communication to frontend
        });

    } catch (error: unknown) {
        // §BILLING: Return 402 for credit/quota exhaustion
        const billingResponse = handleBillingError(error);
        if (billingResponse) return billingResponse;

        const errMsg = error instanceof Error ? error.message : String(error);
        console.error(`[${requestId}] ❌ route=cover-letter/generate error=${errMsg}`);
        return NextResponse.json({ error: errMsg || 'Generation failed', requestId }, { status: 500 });
    }
}
