import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { getCVText } from '@/lib/services/cv-text-retriever';
import { inngest } from '@/lib/inngest/client';
import { rateLimiters, checkUpstashLimit } from '@/lib/api/rate-limit-upstash';
import { logger } from '@/lib/logging';
import { getUserLocale } from '@/lib/i18n/get-user-locale';
import { withCreditGate, handleBillingError } from '@/lib/middleware/credit-gate';
import { CREDIT_COSTS } from '@/lib/services/credit-types';
import { runCVMatchAnalysis } from '@/lib/services/cv-match-analyzer';
import { computeInputHash } from '@/lib/services/cv-match-hash';
import { preMatchKeywords } from '@/lib/services/pre-match-keywords';

// Vercel Serverless: CV Match runs Claude + DB ops — needs extended timeout
export const maxDuration = 60;



const IS_DEV = process.env.NODE_ENV === 'development';

/**
 * POST /api/cv/match — Smart Trigger
 *
 * DEV:  Runs synchronously via runCVMatchAnalysis() — no Inngest CLI needed.
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
        // §PARSE: req.json() MUST be inside try/catch — if body is missing or malformed,
        // Next.js would otherwise return an HTML error page instead of JSON.
        let jobId: string | undefined;
        let cvDocumentId: string | undefined;
        let forceRestart: boolean | undefined;
        try {
            const body = await req.json();
            jobId = body?.jobId;
            cvDocumentId = body?.cvDocumentId;
            forceRestart = body?.forceRestart;
        } catch {
            return NextResponse.json({ error: 'Invalid or missing request body (expected JSON)' }, { status: 400 });
        }

        if (!jobId) {
            return NextResponse.json({ error: 'Job ID is required' }, { status: 400 });
        }

        // §8: Auth Guard
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Rate limit check (5 req/min per user — Upstash Redis)
        const rateLimited = await checkUpstashLimit(rateLimiters.cvMatch, user.id);
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
        const cvData = await getCVText(user.id, cvDocumentId, { forAI: true });
        if (!cvData) {
            return NextResponse.json({
                error: 'CV not found or empty. Please upload your CV in settings.',
                code: 'CV_NOT_FOUND',
            }, { status: 400 });
        }

        // ── Content-Hash Idempotency Check (QA Strategie 3) ──────────────
        // If an identical (CV text + job description) was already analyzed,
        // return the cached result instead of re-running the LLM.
        // forceRestart explicitly bypasses this cache.
        const currentMetadata = (job.metadata as Record<string, unknown>) || {};
        const existingStatus = currentMetadata.cv_match_status as string | undefined;
        const startedAt = currentMetadata.cv_match_started_at as string | undefined;

        if (!forceRestart && existingStatus === 'done') {
            const existingMatch = currentMetadata.cv_match as Record<string, unknown> | undefined;
            const existingHash = existingMatch?.input_hash as string | undefined;
            if (existingHash) {
                const currentHash = computeInputHash(
                    cvData.text,
                    job.description || '',
                    (job.requirements as string[]) || [],
                    (job.buzzwords as string[]) || []
                );
                if (currentHash === existingHash) {
                    // Identical input — serve cached result (no LLM call, no credit debit)
                    console.log(`✅ [CV Match] Cache HIT — identical input (hash: ${currentHash.slice(0, 8)}…). Serving cached result.`);
                    return NextResponse.json({ success: true, status: 'done_cached' });
                }
                console.log(`🔄 [CV Match] Cache MISS — input changed (hash: ${currentHash.slice(0, 8)}… vs ${existingHash.slice(0, 8)}…). Re-analyzing.`);
            }
        }

        // ── Persistent Result Cache (survives job deletes) ────────────────
        // If job_queue.metadata is empty (post-delete + re-add), check the
        // persistent cv_match_result_cache. On HIT: restore metadata, skip LLM,
        // skip credit debit. This is the second line of defense.
        if (!forceRestart && existingStatus !== 'done') {
            const persistentHash = computeInputHash(
                cvData.text,
                job.description || '',
                (job.requirements as string[]) || [],
                (job.buzzwords as string[]) || []
            );
            try {
                const { data: cached } = await supabaseAdmin
                    .from('cv_match_result_cache')
                    .select('result')
                    .eq('user_id', user.id)
                    .eq('input_hash', persistentHash)
                    .maybeSingle();

                if (cached?.result && typeof cached.result === 'object') {
                    console.log(`✅ [CV Match] Persistent cache HIT — restoring from cv_match_result_cache (hash: ${persistentHash.slice(0, 8)}…)`);

                    // Welle Re-1 LITE (2026-04-27): cache-restore must also sync master
                    // BEFORE building the snapshot. Without this, a user picking CV-A
                    // after uploading CV-B would get a cache-restored job pinned to a
                    // stale CV-B master snapshot. Same DEV/PROD-Drift pattern, fixed
                    // here too via the shared helper (DRY).
                    if (cvDocumentId) {
                        try {
                            const { syncMasterCvFromDocument } = await import('@/lib/services/cv-master-sync');
                            const syncResult = await syncMasterCvFromDocument(user.id, cvDocumentId, supabaseAdmin);
                            console.log(`[cv-match cache-restore] master sync: ${syncResult.status}${syncResult.message ? ` — ${syncResult.message}` : ''}`);
                        } catch (syncErr: any) {
                            console.warn(`⚠️ [CV Match] cache-restore master sync failed (non-blocking): ${syncErr?.message}`);
                        }
                    }

                    // Welle B: build a CV snapshot to pin alongside the restored
                    // match result so the Optimizer + Cover Letter use the same
                    // CV the user is currently viewing.
                    let cachedSnapshot: unknown = undefined;
                    try {
                        const { data: profile } = await supabaseAdmin
                            .from('user_profiles')
                            .select('cv_structured_data')
                            .eq('id', user.id)
                            .single();
                        if (profile?.cv_structured_data) {
                            let documentName: string | null = null;
                            if (cvData.documentId) {
                                const { data: doc } = await supabaseAdmin
                                    .from('documents')
                                    .select('metadata')
                                    .eq('id', cvData.documentId)
                                    .eq('user_id', user.id)
                                    .maybeSingle();
                                documentName = ((doc?.metadata as Record<string, unknown> | null)?.original_name as string) ?? null;
                            }
                            const { buildJobCvSnapshot } = await import('@/lib/services/job-cv-snapshot');
                            cachedSnapshot = buildJobCvSnapshot(profile.cv_structured_data, cvData.documentId ?? null, documentName);
                        }
                    } catch (snapErr: any) {
                        console.warn(`⚠️ [CV Match] cache-hit snapshot build failed (non-blocking): ${snapErr?.message}`);
                    }

                    // Restore cached result to job_queue.metadata (mirrors Inngest save-results)
                    await supabaseAdmin
                        .from('job_queue')
                        .update({
                            metadata: {
                                ...currentMetadata,
                                cv_match: {
                                    analyzed_at: new Date().toISOString(),
                                    cv_document_id: cvData.documentId,
                                    input_hash: persistentHash,
                                    ...(cached.result as Record<string, unknown>),
                                },
                                cv_match_error: null,
                                cv_match_status: 'done',
                                ...(cachedSnapshot ? { cv_snapshot: cachedSnapshot } : {}),
                            },
                            status: 'cv_matched',
                        })
                        .eq('id', jobId)
                        .eq('user_id', user.id);

                    return NextResponse.json({ success: true, status: 'done_cached' });
                }
            } catch (cacheErr: any) {
                // Non-blocking — fall through to LLM path
                console.warn(`⚠️ [CV Match] Persistent cache lookup error (non-blocking): ${cacheErr?.message}`);
            }
        }

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

        const userLocale = await getUserLocale(user.id);

        // ── DEV: Synchronous pipeline (no Inngest CLI needed) ──────────
        if (IS_DEV) {
            console.log('🔧 [CV Match] DEV MODE — running synchronously (no Inngest)');
            try {
                await withCreditGate(
                    user.id,
                    CREDIT_COSTS.cv_match,
                    'cv_match',
                    async () => {
                        // DEV: Deterministic pre-match (mirrors Inngest Step 2.5)
                        const buzzwords = Array.isArray(job.buzzwords) ? job.buzzwords as string[] : [];
                        const preMatchedKeywords = await preMatchKeywords(user.id, buzzwords);

                        // Run the LLM analysis directly
                        const matchResult = await runCVMatchAnalysis({
                            userId: user.id,
                            jobId: job.id,
                            cvText: cvData.text,
                            jobTitle: job.job_title || 'Unknown Title',
                            company: job.company_name || 'Unknown Company',
                            jobDescription: job.description || '',
                            requirements: job.requirements || [],
                            atsKeywords: buzzwords,
                            level: job.seniority || '',
                            locale: (userLocale as any) || 'de',
                            preMatchedKeywords: preMatchedKeywords ?? undefined,
                        });

                        // Save result to DB (mirrors cv-match-pipeline.ts Step 4)
                        const { data: freshJob } = await supabaseAdmin
                            .from('job_queue')
                            .select('metadata')
                            .eq('id', jobId)
                            .eq('user_id', user.id)
                            .single();

                        const freshMetadata = (freshJob?.metadata as Record<string, unknown>) || {};

                        // Normalize arrays defensively
                        const safeResult = {
                            ...matchResult,
                            _schemaVersion: 2,
                            requirementRows: Array.isArray(matchResult.requirementRows) ? matchResult.requirementRows : [],
                            strengths: Array.isArray(matchResult.strengths) ? matchResult.strengths : [],
                            gaps: Array.isArray(matchResult.gaps) ? matchResult.gaps : [],
                            potentialHighlights: Array.isArray(matchResult.potentialHighlights) ? matchResult.potentialHighlights : [],
                            keywordsFound: Array.isArray(matchResult.keywordsFound) ? matchResult.keywordsFound : [],
                            keywordsMissing: Array.isArray(matchResult.keywordsMissing) ? matchResult.keywordsMissing : [],
                        };

                        // F2-Fix: Store input_hash in DEV mode (mirrors Inngest pipeline)
                        const devInputHash = computeInputHash(
                            cvData.text,
                            job.description || '',
                            (job.requirements as string[]) || [],
                            (job.buzzwords as string[]) || []
                        );

                        await supabaseAdmin
                            .from('job_queue')
                            .update({
                                metadata: {
                                    ...freshMetadata,
                                    cv_match: {
                                        analyzed_at: new Date().toISOString(),
                                        cv_document_id: cvData.documentId,
                                        input_hash: devInputHash,
                                        ...safeResult,
                                    },
                                    cv_match_error: null,
                                    cv_match_status: 'done',
                                },
                                status: 'cv_matched',
                            })
                            .eq('id', jobId)
                            .eq('user_id', user.id);

                        console.log(`✅ [CV Match] DEV sync complete for job ${jobId}`);

                        // Write to persistent cache (mirrors Inngest Step 4.5)
                        try {
                            await supabaseAdmin
                                .from('cv_match_result_cache')
                                .upsert({
                                    user_id: user.id,
                                    input_hash: devInputHash,
                                    result: safeResult,
                                }, {
                                    onConflict: 'user_id,input_hash',
                                });
                            console.log(`✅ [CV Match] DEV result cached (hash: ${devInputHash.slice(0, 8)}…)`);
                        } catch (cacheWriteErr: any) {
                            console.warn(`⚠️ [CV Match] DEV cache write error (non-blocking): ${cacheWriteErr?.message}`);
                        }

                        // Welle Re-1 LITE (2026-04-27): sync master CV from chosen document
                        // BEFORE pinning the snapshot. Mirrors Inngest Step 5 — eliminates
                        // the DEV/PROD-Drift that caused the PwC E2E bug (master held stale
                        // EN-CV data while picker chose Exxeta). DRY via shared helper.
                        if (cvDocumentId) {
                            try {
                                const { syncMasterCvFromDocument } = await import('@/lib/services/cv-master-sync');
                                const syncResult = await syncMasterCvFromDocument(user.id, cvDocumentId, supabaseAdmin);
                                console.log(`[cv-match DEV] master sync: ${syncResult.status}${syncResult.message ? ` — ${syncResult.message}` : ''}`);
                            } catch (syncErr: any) {
                                console.warn(`⚠️ [CV Match] DEV master sync failed (non-blocking): ${syncErr?.message}`);
                            }
                        }

                        // Welle B: Pin the matched CV snapshot to job_queue.metadata.cv_snapshot
                        // (mirrors Inngest Step 6 — keeps Optimizer + Cover Letter consistent
                        // with the CV that was matched, even after later master CV uploads).
                        try {
                            const { data: profile } = await supabaseAdmin
                                .from('user_profiles')
                                .select('cv_structured_data')
                                .eq('id', user.id)
                                .single();
                            if (profile?.cv_structured_data) {
                                const docIdToPin = cvDocumentId ?? cvData.documentId ?? null;
                                let documentName: string | null = null;
                                if (docIdToPin) {
                                    const { data: doc } = await supabaseAdmin
                                        .from('documents')
                                        .select('metadata')
                                        .eq('id', docIdToPin)
                                        .eq('user_id', user.id)
                                        .maybeSingle();
                                    documentName = ((doc?.metadata as Record<string, unknown> | null)?.original_name as string) ?? null;
                                }
                                const { buildJobCvSnapshot } = await import('@/lib/services/job-cv-snapshot');
                                const snapshot = buildJobCvSnapshot(profile.cv_structured_data, docIdToPin, documentName);
                                const { data: freshJobForPin } = await supabaseAdmin
                                    .from('job_queue')
                                    .select('metadata')
                                    .eq('id', jobId)
                                    .eq('user_id', user.id)
                                    .single();
                                const freshMetadataForPin = (freshJobForPin?.metadata as Record<string, unknown>) ?? {};
                                await supabaseAdmin
                                    .from('job_queue')
                                    .update({ metadata: { ...freshMetadataForPin, cv_snapshot: snapshot } })
                                    .eq('id', jobId)
                                    .eq('user_id', user.id);
                                console.log(`✅ [CV Match] DEV CV snapshot pinned to job (doc_id=${docIdToPin ?? 'none'})`);
                            }
                        } catch (pinErr: any) {
                            console.warn(`⚠️ [CV Match] DEV snapshot pin failed (non-blocking): ${pinErr?.message}`);
                        }

                        return matchResult;
                    },
                    jobId
                );
            } catch (devError: any) {
                // Write error to DB so frontend can show it
                const { data: freshJob } = await supabaseAdmin
                    .from('job_queue')
                    .select('metadata')
                    .eq('id', jobId)
                    .eq('user_id', user.id)
                    .single();

                const freshMetadata = (freshJob?.metadata as Record<string, unknown>) || {};
                await supabaseAdmin
                    .from('job_queue')
                    .update({
                        metadata: {
                            ...freshMetadata,
                            cv_match_status: 'error',
                            cv_match_error: devError?.message || 'Unknown error',
                        },
                    })
                    .eq('id', jobId)
                    .eq('user_id', user.id);

                // Re-throw so the catch block handles billing errors
                throw devError;
            }

            return NextResponse.json({ success: true, status: 'processing' });
        }

        // ── PROD: Inngest background event ─────────────────────────────
        console.log('🚀 [CV Match] PROD MODE — firing Inngest event...');
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
