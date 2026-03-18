/**
 * cv-match-pipeline.ts — Inngest Background Function
 *
 * Replaces the synchronous LLM call in /api/cv/match/route.ts.
 * Event: 'cv-match/analyze'
 * Payload: { jobId: string, userId: string, cvDocumentId?: string }
 *
 * Contracts: §3 (user-scoped), §8 (supabaseAdmin), §9 (status), JSONB Merge Pflicht
 */

import { inngest } from './client';
import { NonRetriableError } from 'inngest';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { getCVText } from '@/lib/services/cv-text-retriever';
import { runCVMatchAnalysis } from '@/lib/services/cv-match-analyzer';

const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

export const analyzeCVMatch = inngest.createFunction(
    {
        id: 'analyze-cv-match',
        name: 'Analyze CV Match',
        retries: 2,
        rateLimit: {
            key: 'event.data.userId',
            limit: 10,
            period: '1m',
        },
        onFailure: async ({ event, error }) => {
            // Dead-letter handler: write error status to DB so the frontend
            // never gets stuck polling a 'processing' state that will never resolve.
            //
            // §BUG-FIX: Wrap in try-catch + use safe optional chaining.
            // Previously: `event.data.event.data` could throw at runtime if the
            // Inngest wrapper shape differed — silently crashing this handler
            // and leaving cv_match_status='processing' forever in the DB.
            const errMsg = error?.message || 'Unknown pipeline failure';

            // Safe extraction — Inngest onFailure wraps the original event
            const originalData = (event?.data as any)?.event?.data;
            const jobId = originalData?.jobId as string | undefined;
            const userId = originalData?.userId as string | undefined;

            console.error(`❌ [CV Match] Pipeline permanently failed${jobId ? ` for job ${jobId}` : ''}: ${errMsg}`);

            if (!jobId || !userId) {
                console.error('❌ [CV Match] onFailure: Cannot write error status — jobId or userId missing from event payload', event?.data);
                return;
            }

            try {
                const { data: freshJob } = await supabaseAdmin
                    .from('job_queue')
                    .select('metadata')
                    .eq('id', jobId)
                    .eq('user_id', userId)
                    .single();

                const currentMetadata = (freshJob?.metadata as Record<string, unknown>) || {};

                const { error: updateErr } = await supabaseAdmin
                    .from('job_queue')
                    .update({
                        metadata: {
                            ...currentMetadata,
                            cv_match_status: 'error',
                            cv_match_error: errMsg,
                        },
                    })
                    .eq('id', jobId)
                    .eq('user_id', userId);

                if (updateErr) {
                    console.error(`❌ [CV Match] DB update in onFailure failed:`, updateErr.message);
                } else {
                    console.log(`📝 [CV Match] Error status written to DB for job ${jobId}`);
                }
            } catch (dbErr) {
                console.error(`❌ [CV Match] Failed to write error status to DB:`, dbErr);
            }
        },
    },
    { event: 'cv-match/analyze' },
    async ({ event, step }) => {
        const { jobId, userId, cvDocumentId, locale } = event.data as {
            jobId: string;
            userId: string;
            cvDocumentId?: string;
            locale?: string;
        };

        // Step 1: Read job data (§3 — user-scoped)
        const job = await step.run('read-job', async () => {
            const { data } = await supabaseAdmin
                .from('job_queue')
                .select('id, job_title, company_name, description, requirements, buzzwords, seniority, location, metadata')
                .eq('id', jobId)
                .eq('user_id', userId) // §3: user-scoped
                .single();

            if (!data) throw new NonRetriableError('Job not found — no retry');
            return data;
        });

        // Step 2: Load CV text
        const cvData = await step.run('load-cv', async () => {
            const result = await getCVText(userId, cvDocumentId);
            if (!result) throw new NonRetriableError('CV not found — no retry');
            return result;
        });

        // Step 3: Run CV Match Analysis (the heavy LLM work)
        const matchResult = await step.run('analyze-match', async () => {
            try {
                return await runCVMatchAnalysis({
                    userId,
                    jobId: job.id,
                    cvText: cvData.text,
                    jobTitle: job.job_title || 'Unknown Title',
                    company: job.company_name || 'Unknown Company',
                    jobDescription: job.description || '',
                    requirements: job.requirements || [],
                    atsKeywords: job.buzzwords || [],
                    level: job.seniority || '',
                    locale: (locale as any) || 'de',
                });
            } catch (err: any) {
                if (err?.status === 400 || err?.status === 401 || err?.status === 404) {
                    throw new NonRetriableError(`AI API permanent error: ${err.message}`);
                }
                throw err;
            }
        });

        // Step 4: Save result to DB (JSONB Merge! + Status → cv_matched per DB constraint)
        await step.run('save-results', async () => {
            // Re-read CURRENT metadata to avoid overwriting changes made between Step 1 and now
            // (e.g. cv_match_started_at written by /api/cv/match/route.ts)
            const { data: freshJob } = await supabaseAdmin
                .from('job_queue')
                .select('metadata')
                .eq('id', jobId)
                .eq('user_id', userId)
                .single();

            const currentMetadata = (freshJob?.metadata as Record<string, unknown>) || {};

            // Normalize matchResult — restore §7 compliance: validate before flagging done
            const missingFields: string[] = [];

            const safeResult = {
                ...matchResult,
                requirementRows: Array.isArray(matchResult.requirementRows)
                    ? matchResult.requirementRows : (missingFields.push('requirementRows'), []),
                strengths: Array.isArray(matchResult.strengths)
                    ? matchResult.strengths : (missingFields.push('strengths'), []),
                gaps: Array.isArray(matchResult.gaps)
                    ? matchResult.gaps : (missingFields.push('gaps'), []),
                potentialHighlights: Array.isArray(matchResult.potentialHighlights)
                    ? matchResult.potentialHighlights : (missingFields.push('potentialHighlights'), []),
                keywordsFound: Array.isArray(matchResult.keywordsFound)
                    ? matchResult.keywordsFound : (missingFields.push('keywordsFound'), []),
                keywordsMissing: Array.isArray(matchResult.keywordsMissing)
                    ? matchResult.keywordsMissing : (missingFields.push('keywordsMissing'), []),
                scoreBreakdown: (matchResult.scoreBreakdown && typeof matchResult.scoreBreakdown === 'object')
                    ? matchResult.scoreBreakdown : {},
                _normalized: missingFields.length > 0,
            };

            if (missingFields.length > 0) {
                console.warn(`[cv-match-pipeline] ⚠️ Normalized missing fields:`, missingFields);
            }

            const { error: updateError } = await supabaseAdmin
                .from('job_queue')
                .update({
                    metadata: {
                        ...currentMetadata, // JSONB Merge — fresh read, no data loss
                        cv_match: {
                            analyzed_at: new Date().toISOString(),
                            cv_document_id: cvData.documentId,
                            ...safeResult,
                        },
                        cv_match_error: null, // Clear any previous error
                        cv_match_status: 'done',
                    },
                    // Status: cv_matched (DB CHECK constraint value, maps to cv_match_done in §9)
                    status: 'cv_matched',
                })
                .eq('id', jobId)
                .eq('user_id', userId); // §3

            if (updateError) {
                console.error('❌ Failed to save CV match to DB:', updateError.message);
                throw updateError;
            }

            console.log(`✅ [CV Match] Job ${jobId} analyzed successfully`);
        });

        return { success: true, jobId };
    }
);
