/**
 * extract-job-pipeline.ts — Inngest Background Function
 *
 * Replaces the synchronous Claude call in /api/jobs/extract/route.ts.
 * Event: 'job/extract'
 * Payload: { jobId: string, userId: string }
 *
 * Contracts: §3 (user-scoped), §8 (supabaseAdmin), JSONB Merge Pflicht
 */

import { inngest } from './client';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { complete } from '@/lib/ai/model-router';
import { getLanguageName, type SupportedLocale } from '@/lib/i18n/get-user-locale';

const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

/**
 * Robust JSON parser: handles markdown blocks, truncated arrays, etc.
 * Moved from /api/jobs/extract/route.ts
 */
function safeParseJSON(raw: string): Record<string, unknown> {
    let cleaned = raw.trim();
    const mdMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (mdMatch && mdMatch[1]) {
        cleaned = mdMatch[1].trim();
    }

    try {
        return JSON.parse(cleaned);
    } catch {
        const firstOpen = cleaned.indexOf('{');
        const lastClose = cleaned.lastIndexOf('}');
        if (firstOpen !== -1 && lastClose > firstOpen) {
            try {
                return JSON.parse(cleaned.substring(firstOpen, lastClose + 1));
            } catch {
                let fixable = cleaned.substring(firstOpen, lastClose + 1);
                const opens = (fixable.match(/\[/g) || []).length;
                const closes = (fixable.match(/\]/g) || []).length;
                if (opens > closes) {
                    fixable = fixable.replace(/,\s*$/, '');
                    for (let i = 0; i < opens - closes; i++) {
                        fixable = fixable.replace(/}\s*$/, ']}');
                    }
                    try {
                        return JSON.parse(fixable);
                    } catch { /* fall through */ }
                }
            }
        }
    }

    console.error('❌ [Extract] All JSON parse attempts failed. Raw:', raw.substring(0, 200));
    return {};
}

export const extractJob = inngest.createFunction(
    {
        id: 'extract-job',
        name: 'Extract Job Description',
        retries: 2,
        rateLimit: {
            key: 'event.data.userId',
            limit: 10,
            period: '1m',
        },
    },
    { event: 'job/extract' },
    async ({ event, step }) => {
        const { jobId, userId, locale: rawLocale } = event.data as { jobId: string; userId: string; locale?: string };
        const locale = (rawLocale === 'en' || rawLocale === 'es' ? rawLocale : 'de') as SupportedLocale;
        const languageName = getLanguageName(locale);

        // Step 1: Read job description (§3 — user-scoped)
        const job = await step.run('read-job', async () => {
            const { data } = await supabaseAdmin
                .from('job_queue')
                .select('id, description, metadata')
                .eq('id', jobId)
                .eq('user_id', userId) // §3: user-scoped
                .single();

            if (!data?.description || data.description.length < 100) {
                throw new Error('Beschreibung zu kurz oder nicht gefunden');
            }
            return data;
        });

        // Step 2: Claude analysis via Model Router
        // OPTIMIZATION (2026-03-30): Skip if synchronous extraction in ingest/route.ts
        // already populated these fields. Uses metadata flag (set BEFORE Inngest trigger)
        // to avoid race condition where Inngest starts before sync extraction finishes.
        const extracted = await step.run('claude-extract', async () => {
            // Re-read job including metadata flag
            const { data: currentJob } = await supabaseAdmin
                .from('job_queue')
                .select('summary, requirements, responsibilities, metadata')
                .eq('id', jobId)
                .eq('user_id', userId)
                .single();

            // Check metadata flag first (most reliable — set atomically during ingest)
            const meta = (currentJob?.metadata || {}) as Record<string, unknown>;
            const syncExtractedAt = meta.sync_extracted_at as string | undefined;
            const hasSyncFlag = !!syncExtractedAt;

            // Also verify the data itself is present (defense in depth)
            const hasSummary = !!currentJob?.summary && currentJob.summary.length > 10;
            const hasRequirements = Array.isArray(currentJob?.requirements) && currentJob.requirements.length > 0;

            if (hasSyncFlag && hasSummary && hasRequirements) {
                console.log(`✅ [Extract] Job ${jobId} sync_extracted_at=${syncExtractedAt} — skipping redundant LLM call`);
                return {
                    summary: currentJob.summary,
                    qualifications: currentJob.requirements,
                    responsibilities: currentJob.responsibilities,
                    _skipped: true,
                };
            }

            // If sync flag is missing (manual entry, failed sync, or old job), run extraction
            console.log(`🔄 [Extract] Job ${jobId} running full extraction (syncFlag=${hasSyncFlag}, hasSummary=${hasSummary})`);
            const response = await complete({
                taskType: 'parse_html',
                systemPrompt: `Extract the following JSON structure from the job description. Return ONLY JSON, no markdown, no explanations. All text fields (summary, responsibilities, qualifications, benefits) MUST be written in ${languageName}.

IMPORTANT for lists (responsibilities, qualifications):
- Write condensed, complete sentences — approximately 20% shorter than the original.
- Preserve the core message of each point. No abbreviating to mere keywords.
- NO copy-paste of the original, but an informed condensation.

IMPORTANT for benefits:
- Extract ONLY the 6 most standout benefits, max 3 words each.
- Example GOOD: ["30 Tage Urlaub", "Remote Work"] — Example BAD: ["Flexibles Arbeiten: Wir arbeiten in einem ausgewogenen hybriden Mix..."]

{"summary":"2-3 sentences in ${languageName}","responsibilities":["max 8 responsibilities as condensed complete sentences in ${languageName}"],"qualifications":["max 8 qualifications as condensed complete sentences in ${languageName}"],"benefits":["TOP 6 most important, max 3 words each, e.g. '30 Tage Urlaub'"],"location":"string or null","seniority":"junior|mid|senior|lead|unknown","buzzwords":["max 12 ATS Keywords"]}`,
                prompt: job.description,
                temperature: 0,
                maxTokens: 2000,
            });

            return safeParseJSON(response.text);
        });

        // Step 3: Write extracted data + clear any previous errors (JSONB Merge!)
        // Skip if sync extraction already populated the data (no new LLM data to write)
        if (!(extracted as any)._skipped) {
            await step.run('write-results', async () => {
                const currentMetadata = (job.metadata as Record<string, unknown>) || {};

                await supabaseAdmin
                    .from('job_queue')
                    .update({
                        summary: (extracted.summary as string) || null,
                        responsibilities: Array.isArray(extracted.responsibilities) && extracted.responsibilities.length > 0
                            ? extracted.responsibilities : null,
                        requirements: Array.isArray(extracted.qualifications) && (extracted.qualifications as unknown[]).length > 0
                            ? extracted.qualifications : null,
                        benefits: Array.isArray((extracted as any).benefits) ? (extracted as any).benefits : [],
                        location: ((extracted as any).location as string) || null,
                        seniority: ((extracted as any).seniority as string) || 'unknown',
                        buzzwords: Array.isArray((extracted as any).buzzwords) ? (extracted as any).buzzwords : null,
                        // JSONB Merge: preserve existing metadata, clear extract_error
                        metadata: {
                            ...currentMetadata,
                            extract_error: null,
                            extract_completed_at: new Date().toISOString(),
                        },
                    })
                    .eq('id', jobId)
                    .eq('user_id', userId); // §3

                console.log(`✅ [Extract] Job ${jobId} extracted successfully`);
            });
        } else {
            console.log(`✅ [Extract] Job ${jobId} — write step skipped (sync data already in DB)`);
        }

        return { success: true, jobId };
    }
);
