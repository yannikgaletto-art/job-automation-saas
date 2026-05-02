export const maxDuration = 60; // Vercel timeout protection — DEV sync LLM call can take 15-25s

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { inngest } from '@/lib/inngest/client';
import { getLanguageName, getUserLocale } from '@/lib/i18n/get-user-locale';
import { rateLimiters, checkUpstashLimit } from '@/lib/api/rate-limit-upstash';
import { buildAtsKeywordPrompt, cleanAtsKeywords } from '@/lib/services/ats-keyword-filter';

/**
 * POST /api/jobs/extract — Smart Trigger
 *
 * DEV:  Runs synchronously (no Inngest CLI needed locally).
 * PROD: Fires Inngest background event (no Vercel timeout risk).
 *
 * Contracts: §8 (Auth Guard), §3 (user-scoped)
 */

const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

const Schema = z.object({ jobId: z.string().uuid() });

/**
 * Robust JSON parser — handles markdown blocks, truncated arrays, etc.
 */
function safeParseJSON(raw: string): Record<string, unknown> {
    let cleaned = raw.trim();
    const mdMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (mdMatch && mdMatch[1]) cleaned = mdMatch[1].trim();

    try { return JSON.parse(cleaned); } catch { /* continue */ }

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
                for (let i = 0; i < opens - closes; i++) fixable = fixable.replace(/}\s*$/, ']}');
                try { return JSON.parse(fixable); } catch { /* fall through */ }
            }
        }
    }

    console.error('❌ [Extract] All JSON parse attempts failed. Raw:', raw.substring(0, 200));
    return {};
}

export async function POST(request: NextRequest) {
    try {
        // §8: Auth Guard
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
        }

        const rateLimited = await checkUpstashLimit(rateLimiters.jobExtract, user.id);
        if (rateLimited) return rateLimited;

        const { jobId } = Schema.parse(await request.json());

        // §3: Ownership check (user-scoped)
        const { data: job } = await supabaseAdmin
            .from('job_queue')
            .select('id, description, metadata')
            .eq('id', jobId)
            .eq('user_id', user.id)
            .single();

        if (!job?.description || job.description.length < 100) {
            return NextResponse.json({ success: false, error: 'Beschreibung zu kurz' }, { status: 400 });
        }

        if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
            return NextResponse.json({ success: false, error: 'KI nicht konfiguriert' }, { status: 503 });
        }

        const locale = await getUserLocale(user.id);
        const languageName = getLanguageName(locale);
        const isDev = process.env.NODE_ENV === 'development';

        if (isDev) {
            // ─── DEV MODE: Run synchronously (no Inngest CLI needed) ─────────────
            console.log('🔧 [Extract] DEV MODE — running synchronously');
            const { complete } = await import('@/lib/ai/model-router');

            const response = await complete({
                taskType: 'extract_job_fields',
                systemPrompt: `Extrahiere aus der Stellenbeschreibung diese JSON-Struktur. NUR JSON zurückgeben, kein Markdown, keine Erklärungen.

WICHTIG für Listen (responsibilities, qualifications, benefits):
- Schreibe verdichtete, vollständige Sätze — ca. 20% kürzer als das Original.
- Erhalte die Kernaussage jedes Punktes. Kein Abkürzen auf bloße Stichworte.
- KEIN Copy-Paste des Originals, sondern eine informierte Verdichtung.
- Beispiel SCHLECHT: "Aktive Gewinnung neuer Partner, innen"
- Beispiel GUT: "Du verantwortest den kompletten Sales-Funnel — von der Lead-Identifikation über Kaltakquise und Demo bis zum Vertragsabschluss."

{"summary":"2-3 Sätze auf Deutsch","responsibilities":["max 8 Aufgaben als verdichtete vollständige Sätze"],"qualifications":["max 8 Anforderungen als verdichtete vollständige Sätze"],"benefits":["max 5"],"location":"string oder null","seniority":"junior|mid|senior|lead|unknown","buzzwords":[${JSON.stringify(buildAtsKeywordPrompt(languageName))}]}`,
                prompt: job.description,
                temperature: 0,
                maxTokens: 2000,
            });

            const extracted = safeParseJSON(response.text);
            const currentMetadata = (job.metadata as Record<string, unknown>) || {};
            const cleanedBuzzwords = cleanAtsKeywords(
                Array.isArray(extracted.buzzwords) ? extracted.buzzwords as string[] : [],
                job.description
            );

            await supabaseAdmin.from('job_queue').update({
                summary: (extracted.summary as string) || null,
                responsibilities: Array.isArray(extracted.responsibilities) && extracted.responsibilities.length > 0 ? extracted.responsibilities : null,
                requirements: Array.isArray(extracted.qualifications) && extracted.qualifications.length > 0 ? extracted.qualifications : null,
                benefits: Array.isArray(extracted.benefits) ? extracted.benefits : [],
                location: (extracted.location as string) || null,
                seniority: (extracted.seniority as string) || 'unknown',
                buzzwords: cleanedBuzzwords.kept.length > 0 ? cleanedBuzzwords.kept : null,
                metadata: { ...currentMetadata, extract_error: null, extract_completed_at: new Date().toISOString() },
            }).eq('id', jobId).eq('user_id', user.id);

            console.log(`✅ [Extract DEV] Job ${jobId} extracted successfully`);
            return NextResponse.json({ success: true, status: 'processing' });

        } else {
            // ─── PROD MODE: Fire Inngest event (background, retry-safe) ──────────
            console.log('🚀 [Extract] PROD MODE — sending to Inngest');
            await inngest.send({
                name: 'job/extract',
                data: { jobId, userId: user.id, locale },
            });
            return NextResponse.json({ success: true, status: 'processing' });
        }

    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return NextResponse.json(
            { success: false, error: msg.includes('abort') ? 'Timeout – bitte erneut versuchen' : msg },
            { status: msg.includes('abort') ? 504 : 500 }
        );
    }
}
