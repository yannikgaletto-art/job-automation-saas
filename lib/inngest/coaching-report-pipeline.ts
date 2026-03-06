/**
 * Coaching Report Pipeline (Inngest)
 * Feature-Silo: coaching
 * 
 * Generates a feedback report after a coaching session ends.
 * Triggered by event: 'coaching/generate-report'
 */

import { inngest } from './client';
import Anthropic from '@anthropic-ai/sdk';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { COACHING_PROMPT_VERSION } from '@/lib/prompts/coaching-system-prompt';
import type { ChatMessage } from '@/types/coaching';
import { NonRetriableError } from 'inngest';

const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

// Isolated client — NOT from model-router
let reportClient: Anthropic | null = null;
function getClient(): Anthropic {
    if (!reportClient) {
        reportClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
    }
    return reportClient;
}

const REPORT_MODEL = 'claude-sonnet-4-5-20250929';

export const generateCoachingReport = inngest.createFunction(
    {
        id: 'generate-coaching-report',
        name: 'Generate Coaching Report',
        retries: 2,
    },
    { event: 'coaching/generate-report' },
    async ({ event, step }) => {
        const { sessionId, userId } = event.data;

        // Step 1: Load session
        const session = await step.run('load-session', async () => {
            const { data, error } = await supabaseAdmin
                .from('coaching_sessions')
                .select('*')
                .eq('id', sessionId)
                .eq('user_id', userId)
                .single();

            if (error || !data) {
                throw new NonRetriableError(`Session not found: ${sessionId}`);
            }
            return data;
        });

        // Step 2: Load job data
        const job = await step.run('load-job', async () => {
            const { data } = await supabaseAdmin
                .from('job_queue')
                .select('job_title, company_name')
                .eq('id', session.job_id)
                .single();
            return data;
        });

        // Step 3: Generate report via Claude (round-aware dimensions)
        const report = await step.run('generate-report', async () => {
            const conversation = (session.conversation_history as ChatMessage[]) || [];
            const conversationText = conversation
                .map((msg) => `${msg.role === 'coach' ? 'Coach' : 'Kandidat'}: ${msg.content}`)
                .join('\n\n');

            const round = session.interview_round || 'kennenlernen';

            // Round-specific evaluation dimensions
            const dimensionsByRound: Record<string, string> = {
                kennenlernen: `[
    { "name": "Fachliche Kompetenz", "score": 8, "feedback": "..." },
    { "name": "Kommunikation & Struktur", "score": 6, "feedback": "..." },
    { "name": "Motivation & Cultural Fit", "score": 7, "feedback": "..." },
    { "name": "Selbstreflexion", "score": 7, "feedback": "..." },
    { "name": "Auftreten & Authentizität", "score": 6, "feedback": "..." }
  ]`,
                deep_dive: `[
    { "name": "Technische / Fachliche Tiefe", "score": 8, "feedback": "..." },
    { "name": "STAR-Methodik (Situation-Task-Action-Result)", "score": 6, "feedback": "..." },
    { "name": "Problemlösungskompetenz", "score": 7, "feedback": "..." },
    { "name": "Konkretheit & Belastbarkeit der Beispiele", "score": 7, "feedback": "..." },
    { "name": "Reflexionsfähigkeit", "score": 6, "feedback": "..." }
  ]`,
                case_study: `[
    { "name": "Strukturiertes Denken", "score": 8, "feedback": "..." },
    { "name": "Datenanalyse & Informationsbeschaffung", "score": 6, "feedback": "..." },
    { "name": "Kreativität & Lösungsansätze", "score": 7, "feedback": "..." },
    { "name": "Synthese & Empfehlung", "score": 7, "feedback": "..." },
    { "name": "Kommunikation unter Druck", "score": 6, "feedback": "..." }
  ]`,
            };

            const dimensions = dimensionsByRound[round] || dimensionsByRound['kennenlernen'];

            const client = getClient();
            const response = await client.messages.create({
                model: REPORT_MODEL,
                max_tokens: 2048,
                temperature: 0.3,
                system: `Du bist ein Senior Recruiting Coach. Erstelle einen strukturierten Feedback-Report basierend auf dem Mock-Interview-Protokoll.
        
Antworte als valides JSON (kein Markdown, keine Code-Blöcke). Verwende diese exakte Struktur:
{
  "overallScore": 7,
  "dimensions": ${dimensions},
  "summary": "2-3 Sätze Gesamteinschätzung",
  "strengths": ["Stärke 1", "Stärke 2", "Stärke 3"],
  "improvements": ["Verbesserung 1 mit konkreter Beispielformulierung", "Verbesserung 2", "Verbesserung 3"],
  "topicSuggestions": ["Thema 1 das der Kandidat vertiefen sollte", "Thema 2", "Thema 3"]
}`,
                messages: [
                    {
                        role: 'user',
                        content: `Erstelle den Feedback-Report für folgendes Mock-Interview:

STELLE: ${job?.job_title || 'Unbekannt'} bei ${job?.company_name || 'Unbekannt'}

INTERVIEW-PROTOKOLL:
${conversationText}

Antworte als JSON.`,
                    },
                ],
            });

            const text = response.content
                .filter((block): block is Anthropic.TextBlock => block.type === 'text')
                .map((block) => block.text)
                .join('\n');

            const tokensUsed = response.usage.input_tokens + response.usage.output_tokens;
            const costCents = Math.ceil((tokensUsed / 1_000_000) * 3.0 * 100);

            return { text, tokensUsed, costCents };
        });

        // Step 4: Parse and save report
        await step.run('save-report', async () => {
            let reportJson;
            try {
                const cleaned = report.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
                reportJson = JSON.parse(cleaned);
            } catch {
                console.error('❌ [Coaching Report] JSON parse failed, saving raw text');
                reportJson = { overallScore: 5, summary: report.text, dimensions: [], strengths: [], improvements: [] };
            }

            const score = Math.min(10, Math.max(1, reportJson.overallScore || 5));

            const { error: updateError } = await supabaseAdmin
                .from('coaching_sessions')
                .update({
                    session_status: 'completed',
                    feedback_report: report.text,
                    coaching_score: score,
                    tokens_used: (session.tokens_used || 0) + report.tokensUsed,
                    cost_cents: (session.cost_cents || 0) + report.costCents,
                    completed_at: new Date().toISOString(),
                })
                .eq('id', sessionId);

            if (updateError) {
                throw new Error(`Failed to save report: ${updateError.message}`);
            }

            // Log the report generation
            await supabaseAdmin.from('generation_logs').insert({
                job_id: session.job_id,
                user_id: userId,
                model_name: REPORT_MODEL,
                model_version: COACHING_PROMPT_VERSION,
                iteration: 99, // Special marker for report generation
                prompt_tokens: report.tokensUsed,
                completion_tokens: 0,
                overall_score: score,
                generated_text: report.text.substring(0, 500),
                created_at: new Date().toISOString(),
            });

            console.log(`✅ [Coaching Report] Generated for session ${sessionId} | Score: ${score}/10`);
        });

        return { success: true, sessionId };
    }
);
