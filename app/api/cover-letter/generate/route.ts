import crypto from 'crypto';
import { generateCoverLetterWithQuality } from '@/lib/services/cover-letter-generator';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import type { CoverLetterSetupContext } from '@/types/cover-letter-setup';
import { createRateLimiter, checkRateLimit } from '@/lib/api/rate-limit';
import { logger } from '@/lib/logging';

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

        const { jobId, setupContext, fixMode, targetFix, currentLetter } = await request.json() as {
            jobId: string;
            setupContext?: CoverLetterSetupContext;
            fixMode?: 'full' | 'targeted';
            targetFix?: string;
            currentLetter?: string;
        };

        console.log(`[${requestId}] route=cover-letter/generate step=start userId=${userId} jobId=${jobId ?? 'none'} fixMode=${fixMode || 'full'}`);

        if (!jobId) {
            return NextResponse.json({ error: 'Missing jobId', requestId }, { status: 400 });
        }

        if (!setupContext && fixMode !== 'targeted') {
            console.warn(`[${requestId}] ⚠️ No setupContext provided — generation quality will be reduced`);
        }

        const result = await generateCoverLetterWithQuality(jobId, userId, setupContext, fixMode, targetFix, currentLetter);

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
                audit_trail: result.auditTrail ?? null,
                pipeline_warnings: result.pipelineWarnings ?? [],
                pipeline_improved: result.pipelineImproved ?? false,
            },
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
            pipeline_warnings: result.pipelineWarnings ?? [],
            pipeline_improved: result.pipelineImproved ?? false,
            audit_trail: result.auditTrail ?? [],
        });

    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error(`[${requestId}] ❌ route=cover-letter/generate error=${errMsg}`);
        return NextResponse.json({ error: errMsg || 'Generation failed', requestId }, { status: 500 });
    }
}
