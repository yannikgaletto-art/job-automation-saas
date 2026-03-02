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
    },
    { event: 'cv-match/analyze' },
    async ({ event, step }) => {
        const { jobId, userId, cvDocumentId } = event.data as {
            jobId: string;
            userId: string;
            cvDocumentId?: string;
        };

        // Step 1: Read job data (§3 — user-scoped)
        const job = await step.run('read-job', async () => {
            const { data } = await supabaseAdmin
                .from('job_queue')
                .select('id, job_title, company_name, description, requirements, buzzwords, seniority, location, metadata')
                .eq('id', jobId)
                .eq('user_id', userId) // §3: user-scoped
                .single();

            if (!data) throw new Error('Job not found');
            return data;
        });

        // Step 2: Load CV text
        const cvData = await step.run('load-cv', async () => {
            const result = await getCVText(userId, cvDocumentId);
            if (!result) throw new Error('CV not found or empty');
            return result;
        });

        // Step 3: Run CV Match Analysis (the heavy LLM work)
        const matchResult = await step.run('analyze-match', async () => {
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
            });
        });

        // Step 4: Save result to DB (JSONB Merge! + Status → cv_matched per DB constraint)
        await step.run('save-results', async () => {
            const currentMetadata = (job.metadata as Record<string, unknown>) || {};

            const { error: updateError } = await supabaseAdmin
                .from('job_queue')
                .update({
                    metadata: {
                        ...currentMetadata, // JSONB Merge Pflicht — preserve existing keys
                        cv_match: {
                            analyzed_at: new Date().toISOString(),
                            cv_document_id: cvData.documentId,
                            ...matchResult,
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
