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

            // Round-specific dimension names
            const dimensionNamesByRound: Record<string, string[]> = {
                kennenlernen: [
                    'Fachliche Kompetenz',
                    'Kommunikation & Struktur',
                    'Motivation & Cultural Fit',
                    'Selbstreflexion',
                    'Auftreten & Authentizität',
                ],
                deep_dive: [
                    'Technische / Fachliche Tiefe',
                    'STAR-Methodik',
                    'Problemlösungskompetenz',
                    'Konkretheit & Belastbarkeit',
                    'Reflexionsfähigkeit',
                ],
                case_study: [
                    'Strukturiertes Denken',
                    'Datenanalyse & Informationsbeschaffung',
                    'Kreativität & Lösungsansätze',
                    'Synthese & Empfehlung',
                    'Kommunikation unter Druck',
                ],
            };

            const dimNames = dimensionNamesByRound[round] || dimensionNamesByRound['kennenlernen'];

            const client = getClient();
            const response = await client.messages.create({
                model: REPORT_MODEL,
                max_tokens: 3000,
                temperature: 0.3,
                system: `Du bist ein empathischer Senior Recruiting Coach.

ABSOLUT WICHTIG — KÜRZE für Dimensions-Felder:
- observation, reason, suggestion: KEINE GANZEN SÄTZE. Nur kurze Stichpunkte (max 8-10 Wörter).
- Markiere 1-2 entscheidende Wörter mit **fett**.
- Sprich den Kandidaten mit "du" an.

FÜR DIE GESAMTBEWERTUNG (whatWorked, whatWasMissing, recruiterAdvice):
- Schreibe je 1-2 ehrliche, direkte Sätze — wie ein Recruiter nach dem Interview.
- Kein Corporate Speak, kein Lobhudeln. Nenn konkrete Dinge aus dem tatsächlichen Gespräch.
- whatWorked: Was hat wirklich gut funktioniert? Was hat positiv überrascht?
- whatWasMissing: Was hat gefehlt? Was war zu wenig oder zu vage?
- recruiterAdvice: Eine klare, handlungsrelevante Empfehlung für das nächste Interview.

SCORING-SYSTEM (score ist 1-10):
- score 1-3 (unter 40%) → level: "red", tag: "Das vermissen wir"
- score 4-6 (40-69%) → level: "yellow", tag: "Da fehlt nicht viel"
- score 7-10 (70-100%) → level: "green", tag: "Das machst du gut"

WICHTIG — DIFFERENZIERUNG:
- Nutze die VOLLE Skala von 1 bis 10. NICHT alles auf 5-7 setzen!
- Ein Kandidat hat IMMER Stärken (grün) UND Schwächen (gelb/rot). Mixed Tags sind Pflicht!
- Mindestens 1 Dimension muss "green" sein und mindestens 1 muss "yellow" oder "red" sein.

JEDE Dimension braucht ein echtes ZITAT aus dem Interview-Protokoll.

Antworte als valides JSON (kein Markdown, keine Code-Blöcke). Exakte Struktur:
{
  "overallScore": 6,
  "topStrength": "Solide **Grundkenntnisse** im Kundenmanagement",
  "recommendation": "Mehr **konkrete Beispiele** und **STAR-Struktur** nutzen",
  "whatWorked": "Du bist offen mit Wissenslücken umgegangen und hast nicht versucht, etwas zu verbergen – das wirkt authentisch und kommt gut an.",
  "whatWasMissing": "Konkrete Zahlen und messbare Erfolge haben gefehlt. Bei beiden Fragen blieb es bei allgemeinen Aussagen statt echter Beispiele.",
  "recruiterAdvice": "Bereite 2-3 STAR-Geschichten aus deiner Praxis vor, die du flexibel einsetzen kannst – das gibt deinen Antworten die Substanz, die den Unterschied macht.",
  "dimensions": [
    {
      "name": "${dimNames[0]}",
      "score": 6,
      "level": "yellow",
      "tag": "Da fehlt nicht viel",
      "observation": "Kennt **Theorie**, wenig **Praxisbeispiele**",
      "reason": "Bleibt bei **Nachfragen** konzeptionell",
      "suggestion": "Mit **realen Fallstudien** und Zahlen belegen",
      "quote": "Also ich würde versuchen, transparent zu sein...",
      "feedback": ""
    },
    ... (für ALLE 5 Dimensionen: ${dimNames.join(', ')})
  ],
  "summary": "1-2 kurze Sätze Gesamteinschätzung",
  "strengths": ["**Kundenverständnis** und Lösungsorientierung", "**Offenheit** für neue Ansätze", "**Gründungserfahrung** zeigt Eigeninitiative"],
  "improvements": [
    {
      "title": "**STAR-Methode** für strukturierte Antworten",
      "bad": "Ich versuche immer transparent zu sein...",
      "good": "Bei **Projekt Y** habe ich den Kunden **3 Tage vorher** angerufen und **3 Timelines** präsentiert."
    }
  ],
  "topicSuggestions": [
    {
      "topic": "Strategisches Account Management",
      "searchQuery": "Strategisches Account Management Interview Tipps",
      "youtubeTitle": "Strategisches Account Management – So überzeugst du im Interview",
      "category": "rolle",
      "context": [
        "In der Rolle wird erwartet, dass du Key Accounts selbst steuerst – das kam in deinen Antworten nicht rüber.",
        "Empfehlung: Bereite ein konkretes Beispiel vor, wie du einen Account von der Bestandsaufnahme bis zum Upsell geführt hast."
      ]
    },
    {
      "topic": "Cold-Call Skripte und Einwandbehandlung",
      "searchQuery": "Cold Call Skript deutsch Verkauf Einwandbehandlung",
      "youtubeTitle": "Cold Calling meistern – Skripte und Einwandbehandlung für den Vertrieb",
      "category": "rolle",
      "context": [
        "Die Stellenbeschreibung betont Kaltakquise – dazu hast du im Interview keine eigene Erfahrung gezeigt.",
        "Empfehlung: Trainiere 2-3 Einwand-Reaktionen (z.B. 'Kein Interesse' → 'Verstehe ich, darf ich fragen was aktuell Priorität hat?')."
      ]
    },
    {
      "topic": "STAR-Methode meistern",
      "searchQuery": "STAR Methode Interview Beispiele deutsch",
      "youtubeTitle": "Die STAR-Methode in Aktion: So beantwortest du jede Interview-Frage",
      "category": "interview",
      "context": [
        "Deine Antworten blieben bei allgemeinen Aussagen – ohne messbare Ergebnisse fehlt der Beweis.",
        "Empfehlung: Starte jede Antwort mit der konkreten Situation, dann Aufgabe → Aktion → Ergebnis mit Zahlen."
      ]
    }
  ]
}

WICHTIG für topicSuggestions:
- Generiere mindestens 1x category "rolle" (rollenspezifisch: was man für DIESE Stelle können muss) und 1x "interview" (Interview-Technik).
- Die context-Stichpunkte sind KEINE generischen Tipps. Beziehe dich auf das tatsächliche Interview und was KONKRET gefehlt hat.
- Schreibe wie ein Head of Recruiting, der ehrlich sagt: "Das brauchst du, um diese Stelle zu kriegen."

NOCHMAL: observation, reason, suggestion sind KURZE STICHPUNKTE (max 8-10 Wörter). KEINE Sätze, KEINE Absätze!`,
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
                // Robust JSON extraction: strip markdown code blocks, find first { ... }
                let cleaned = report.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
                if (!cleaned.startsWith('{')) {
                    const match = cleaned.match(/\{[\s\S]*\}/);
                    if (match) cleaned = match[0];
                }
                reportJson = JSON.parse(cleaned);
            } catch {
                console.error('❌ [Coaching Report] JSON parse failed, saving raw text');
                reportJson = { overallScore: 5, summary: report.text.substring(0, 500), dimensions: [], strengths: [], improvements: [] };
            }

            const score = Math.min(10, Math.max(1, reportJson.overallScore || 5));

            // Save the PARSED JSON as string (not raw Claude text with markdown wrappers).
            // This ensures the analysis page can always JSON.parse() it cleanly.
            const cleanReportString = JSON.stringify(reportJson);

            const { error: updateError } = await supabaseAdmin
                .from('coaching_sessions')
                .update({
                    session_status: 'completed',
                    feedback_report: cleanReportString,
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
