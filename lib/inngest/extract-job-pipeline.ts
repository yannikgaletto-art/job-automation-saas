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
        const { jobId, userId } = event.data as { jobId: string; userId: string };

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
        const extracted = await step.run('claude-extract', async () => {
            const response = await complete({
                taskType: 'parse_html',
                systemPrompt: `Extrahiere aus der Stellenbeschreibung diese JSON-Struktur. NUR JSON zurückgeben, kein Markdown, keine Erklärungen.

WICHTIG für Listen (responsibilities, qualifications, benefits):
- Schreibe verdichtete, vollständige Sätze — ca. 20% kürzer als das Original.
- Erhalte die Kernaussage jedes Punktes. Kein Abkürzen auf bloße Stichworte.
- KEIN Copy-Paste des Originals, sondern eine informierte Verdichtung.
- Beispiel SCHLECHT: "Aktive Gewinnung neuer Partner, innen"
- Beispiel GUT: "Du verantwortest den kompletten Sales-Funnel — von der Lead-Identifikation über Kaltakquise und Demo bis zum Vertragsabschluss."

{"summary":"2-3 Sätze auf Deutsch","responsibilities":["max 8 Aufgaben als verdichtete vollständige Sätze"],"qualifications":["max 8 Anforderungen als verdichtete vollständige Sätze"],"benefits":["max 5"],"location":"string oder null","seniority":"junior|mid|senior|lead|unknown","buzzwords":["max 12 ATS Keywords"]}`,
                prompt: job.description,
                temperature: 0,
                maxTokens: 2000,
            });

            return safeParseJSON(response.text);
        });

        // Step 3: Write extracted data + clear any previous errors (JSONB Merge!)
        await step.run('write-results', async () => {
            const currentMetadata = (job.metadata as Record<string, unknown>) || {};

            await supabaseAdmin
                .from('job_queue')
                .update({
                    summary: (extracted.summary as string) || null,
                    responsibilities: Array.isArray(extracted.responsibilities) && extracted.responsibilities.length > 0
                        ? extracted.responsibilities : null,
                    requirements: Array.isArray(extracted.qualifications) && extracted.qualifications.length > 0
                        ? extracted.qualifications : null,
                    benefits: Array.isArray(extracted.benefits) ? extracted.benefits : [],
                    location: (extracted.location as string) || null,
                    seniority: (extracted.seniority as string) || 'unknown',
                    buzzwords: Array.isArray(extracted.buzzwords) ? extracted.buzzwords : null,
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

        return { success: true, jobId };
    }
);
