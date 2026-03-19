/**
 * Coaching Report Generator — Shared Service (Single Source of Truth)
 * Feature-Silo: coaching
 *
 * Generates the feedback report for a completed coaching session.
 * Called from:
 *   - complete/route.ts (direct, fire-and-forget)
 *   - coaching-report-pipeline.ts (Inngest retry shell)
 *
 * This is the ONLY place where the report prompt lives.
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { COACHING_PROMPT_VERSION } from '@/lib/prompts/coaching-system-prompt';
import { getDimensionNames, getScoringTags, getConversationLabels, getReportSystemPrompt, getReportUserMessage, type CoachingLocale } from '@/lib/prompts/coaching-prompt-i18n';
import { buildContentHash } from '@/lib/services/pii-sanitizer';
import type { ChatMessage } from '@/types/coaching';

const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

let reportClient: Anthropic | null = null;
function getClient(): Anthropic {
    if (!reportClient) {
        reportClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
    }
    return reportClient;
}

const REPORT_MODEL = 'claude-haiku-4-5-20251001';



export async function generateAndSaveReport(sessionId: string, userId: string): Promise<void> {
    // ─── Idempotency Guard ───────────────────────────────────────────────
    // Prevents double-generation if called from both direct + Inngest paths
    const { data: existing } = await supabaseAdmin
        .from('coaching_sessions')
        .select('feedback_report')
        .eq('id', sessionId)
        .eq('user_id', userId)
        .single();

    if (existing?.feedback_report) {
        console.log(`⏭️ [Coaching Report] Report already exists for ${sessionId} — skipping`);
        return;
    }

    // 1. Load session + job
    const { data: session, error: sessionError } = await supabaseAdmin
        .from('coaching_sessions')
        .select('*')
        .eq('id', sessionId)
        .eq('user_id', userId)
        .single();

    if (sessionError || !session) {
        throw new Error(`Session not found: ${sessionId}`);
    }

    const { data: job } = await supabaseAdmin
        .from('job_queue')
        .select('job_title, company_name')
        .eq('id', session.job_id)
        .single();

    // 2. Build conversation text with locale-aware role labels (BUG#3 FIX)
    const conversation = (session.conversation_history as ChatMessage[]) || [];
    const round = session.interview_round || 'kennenlernen';
    const locale: CoachingLocale = session.language || 'de';
    const roleLabels = getConversationLabels(locale);
    const conversationText = conversation
        .map((msg: ChatMessage) => `${msg.role === 'coach' ? roleLabels.coach : roleLabels.candidate}: ${msg.content}`)
        .join('\n\n');

    const dimNames = getDimensionNames(locale, round);
    const tags = getScoringTags(locale);

    // 3. Generate report via Claude Haiku
    const client = getClient();
    const jobTitle = job?.job_title || (locale === 'en' ? 'Unknown' : locale === 'es' ? 'Desconocido' : 'Unbekannt');
    const companyName = job?.company_name || (locale === 'en' ? 'Unknown' : locale === 'es' ? 'Desconocida' : 'Unbekannt');

    const response = await client.messages.create({
        model: REPORT_MODEL,
        max_tokens: 3500,
        temperature: 0.3,
        system: getReportSystemPrompt(locale, tags, dimNames),
        messages: [
            {
                role: 'user',
                content: getReportUserMessage(locale, jobTitle, companyName, conversationText),
            },
        ],
    });

    const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('\n');

    const tokensUsed = response.usage.input_tokens + response.usage.output_tokens;
    const costCents = Math.ceil(
        ((response.usage.input_tokens / 1_000_000) * 1.0 + (response.usage.output_tokens / 1_000_000) * 5.0) * 100
    );

    // 4. Parse report JSON
    let reportJson;
    try {
        let raw = text.replace(/```(?:json|JSON)?\s*\n?/g, '').replace(/```\s*/g, '').trim();
        let depth = 0, jsonStart = -1, jsonEnd = -1;
        for (let i = 0; i < raw.length; i++) {
            if (raw[i] === '{') { if (depth === 0) jsonStart = i; depth++; }
            else if (raw[i] === '}') { depth--; if (depth === 0) { jsonEnd = i; break; } }
        }
        if (jsonStart === -1 || jsonEnd === -1) throw new Error('No JSON found');
        reportJson = JSON.parse(raw.substring(jsonStart, jsonEnd + 1));
        console.log(`✅ [Coaching Report] Parsed OK. Score: ${reportJson.overallScore}, dims: ${reportJson.dimensions?.length || 0}`);
    } catch (err) {
        console.error('❌ [Coaching Report] JSON parse failed:', err);
        console.error('❌ [Coaching Report] Raw (first 500):', text.substring(0, 500));
        // Technical fallback — prevents isBrokenReport on frontend
        // but clearly marks this as a generation error, not a content judgement
        const fallbackDims = (getDimensionNames(locale, round)).map(name => ({
            name, score: 3, level: 'red' as const, tag: tags.red,
            observation: locale === 'en' ? 'Report generation **failed**' : locale === 'es' ? 'Generación de informe **fallida**' : 'Report-Generierung **fehlgeschlagen**',
            reason: locale === 'en' ? 'JSON could not be **parsed**' : locale === 'es' ? 'JSON no pudo ser **parseado**' : 'JSON konnte nicht **geparst** werden',
            suggestion: locale === 'en' ? '**Regenerate analysis**' : locale === 'es' ? '**Regenerar análisis**' : '**Analyse neu generieren**',
            quote: '—', feedback: '',
        }));
        reportJson = {
            overallScore: 3,
            topStrength: '', recommendation: '',
            whatWorked: locale === 'en' ? 'The analysis could not be generated correctly due to a technical issue.' : locale === 'es' ? 'El análisis no se pudo generar correctamente por un error técnico.' : 'Die Analyse konnte technisch nicht korrekt erstellt werden.',
            whatWasMissing: locale === 'en' ? 'Please click "Regenerate analysis" for another attempt.' : locale === 'es' ? 'Por favor haz clic en "Regenerar análisis" para otro intento.' : 'Bitte klicke auf "Analyse neu generieren" für einen erneuten Versuch.',
            recruiterAdvice: locale === 'en' ? 'Another attempt should resolve the issue.' : locale === 'es' ? 'Otro intento debería resolver el problema.' : 'Ein erneuter Versuch sollte das Problem lösen.',
            summary: locale === 'en' ? 'Technical error during report generation.' : locale === 'es' ? 'Error técnico en la generación del informe.' : 'Technischer Fehler bei der Report-Generierung.',
            dimensions: fallbackDims,
            strengths: [], improvements: [], topicSuggestions: [],
        };
    }

    const score = Math.min(10, Math.max(1, reportJson.overallScore || 5));
    const cleanReportString = JSON.stringify(reportJson);

    // 5. Save report to DB
    const { error: updateError } = await supabaseAdmin
        .from('coaching_sessions')
        .update({
            session_status: 'completed',
            feedback_report: cleanReportString,
            coaching_score: score,
            tokens_used: (session.tokens_used || 0) + tokensUsed,
            cost_cents: (session.cost_cents || 0) + costCents,
            completed_at: new Date().toISOString(),
        })
        .eq('id', sessionId);

    if (updateError) throw new Error(`Failed to save report: ${updateError.message}`);

    // 6. Log — report processes finished session, no live user input
    await supabaseAdmin.from('generation_logs').insert({
        job_id: session.job_id,
        user_id: userId,
        model_name: REPORT_MODEL,
        model_version: COACHING_PROMPT_VERSION,
        iteration: 99,
        prompt_tokens: response.usage.input_tokens,
        completion_tokens: response.usage.output_tokens,
        overall_score: score,
        generated_text: null,
        content_hash: buildContentHash(text),
        quality_summary: { pii_flags: [], sanitized: false, source: 'report' },
        created_at: new Date().toISOString(),
    });

    console.log(`✅ [Coaching Report] Saved for session ${sessionId} | Score: ${score}/10`);
}
