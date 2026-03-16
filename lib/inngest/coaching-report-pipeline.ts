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

const REPORT_MODEL = 'claude-haiku-4-5-20251001';

export const generateCoachingReport = inngest.createFunction(
    {
        id: 'generate-coaching-report',
        name: 'Generate Coaching Report',
        retries: 2,
    },
    { event: 'coaching/generate-report' },
    async ({ event, step }) => {
        const { sessionId, userId } = event.data;

        // Step 1: Load session + job data (single step, 2 sequential queries)
        const { session, job } = await step.run('load-data', async () => {
            const { data: sessionData, error: sessionError } = await supabaseAdmin
                .from('coaching_sessions')
                .select('*')
                .eq('id', sessionId)
                .eq('user_id', userId)
                .single();

            if (sessionError || !sessionData) {
                throw new NonRetriableError(`Session not found: ${sessionId}`);
            }

            const { data: jobData } = await supabaseAdmin
                .from('job_queue')
                .select('job_title, company_name')
                .eq('id', sessionData.job_id)
                .single();

            return { session: sessionData, job: jobData };
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
                max_tokens: 4096,
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

KOMMUNIKATIONS-FRAMEWORKS (NUR bei unstrukturiertem Antwortverhalten als topicSuggestion empfehlen):

Wenn der Kandidat erkennbar unstrukturiert, abschweifend oder vage antwortet, empfiehl genau die Frameworks, die zum identifizierten Problem passen. Empfiehl NICHT alle drei pauschal — nur was zum konkreten Verhalten passt!

1. PREP-Framework (bei vagen Argumenten ohne klare Position):
   - topic: "PREP-Framework: Souveräne Argumentation"
   - searchQuery: "PREP Methode Interview souverän argumentieren deutsch"
   - youtubeTitle: "PREP-Methode – So argumentierst du souverän im Interview"
   - category: "interview"
   - Logik: Point (klare Aussage) → Reason (Begründung) → Example (konkreter Beweis) → Point (Wiederholung als harter Abschluss)
   - Wann empfehlen: Kandidat bezieht keine klare Position, bleibt unverbindlich, sagt "ich würde versuchen" statt "ich mache"

2. 3-2-1-Framework (bei chaotischen Antworten unter Druck):
   - topic: "3-2-1-Framework: Spontane Fragen meistern"
   - searchQuery: "spontane Fragen Interview strukturiert beantworten"
   - youtubeTitle: "Spontane Interview-Fragen meistern – Das 3-2-1-Framework"
   - category: "interview"
   - Logik: Sofort-Anker wählen — 3 Schritte ("Erstens... Zweitens... Drittens...") ODER 2 Arten ("analytisch und kreativ") ODER 1 Hauptsache ("Die eine entscheidende Sache ist...")
   - Wann empfehlen: Kandidat beginnt mit Füllwörtern ("ähm", "also"), schweift ab, verliert den Faden

3. CCC-Framework (bei unklaren Erklärungen komplexer Themen):
   - topic: "CCC-Framework: Komplexes klar erklären"
   - searchQuery: "komplexe Themen einfach erklären Interview Technik"
   - youtubeTitle: "CCC-Framework – Komplexe Sachverhalte klar kommunizieren"
   - category: "interview"
   - Logik: Context (Warum/Rahmenbedingungen) → Core (Kernbotschaft in einem Satz) → Connect (Relevanz für den Zuhörer)
   - Wann empfehlen: Kandidat verliert den roten Faden bei komplexen Sachverhalten, erklärt zu lang ohne Struktur

REGEL: Wenn der Kandidat strukturiert und klar antwortet → KEIN Framework empfehlen. Die Frameworks sind Hilfestellungen, keine Pflicht.

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
            const costCents = Math.ceil(
                ((response.usage.input_tokens / 1_000_000) * 1.0 + (response.usage.output_tokens / 1_000_000) * 5.0) * 100
            );

            return { text, tokensUsed, costCents };
        });

        // Step 4: Parse and save report
        await step.run('save-report', async () => {
            let reportJson;
            try {
                // Multi-stage robust JSON extraction:
                // 1. Strip markdown fences
                // 2. Find outermost JSON by bracket counting
                let raw = report.text;

                // Strip markdown code fences (```json, ```JSON, ```, etc.)
                raw = raw.replace(/```(?:json|JSON)?\s*\n?/g, '').replace(/```\s*/g, '').trim();

                // Find outermost JSON object using bracket depth counting
                let depth = 0;
                let jsonStart = -1;
                let jsonEnd = -1;
                for (let i = 0; i < raw.length; i++) {
                    if (raw[i] === '{') {
                        if (depth === 0) jsonStart = i;
                        depth++;
                    } else if (raw[i] === '}') {
                        depth--;
                        if (depth === 0) { jsonEnd = i; break; }
                    }
                }

                if (jsonStart === -1 || jsonEnd === -1) {
                    throw new Error(`No valid JSON object found. Raw output starts with: ${raw.substring(0, 100)}`);
                }

                const jsonStr = raw.substring(jsonStart, jsonEnd + 1);
                reportJson = JSON.parse(jsonStr);

                console.log(`✅ [Coaching Report] Parsed JSON OK. Score: ${reportJson.overallScore}, dims: ${reportJson.dimensions?.length || 0}`);
            } catch (err) {
                const errMsg = err instanceof Error ? err.message : String(err);
                console.error('❌ [Coaching Report] JSON parse failed:', errMsg);
                console.error('❌ [Coaching Report] Raw output (first 500):', report.text.substring(0, 500));
                console.error('❌ [Coaching Report] Raw output (last 200):', report.text.substring(Math.max(0, report.text.length - 200)));
                reportJson = { overallScore: 5, summary: 'Report konnte nicht geladen werden. Bitte starte eine neue Session.', dimensions: [], strengths: [], improvements: [], topicSuggestions: [] };
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
