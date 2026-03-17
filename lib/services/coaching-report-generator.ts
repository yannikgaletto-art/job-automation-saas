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

// Round-specific dimension names (shared constant)
const DIMENSION_NAMES_BY_ROUND: Record<string, string[]> = {
    kennenlernen: ['Fachliche Kompetenz', 'Kommunikation & Struktur', 'Motivation & Cultural Fit', 'Selbstreflexion', 'Auftreten & Authentizität'],
    deep_dive: ['Technische / Fachliche Tiefe', 'STAR-Methodik', 'Problemlösungskompetenz', 'Konkretheit & Belastbarkeit', 'Reflexionsfähigkeit'],
    case_study: ['Strukturiertes Denken', 'Datenanalyse & Informationsbeschaffung', 'Kreativität & Lösungsansätze', 'Synthese & Empfehlung', 'Kommunikation unter Druck'],
};



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

    // 2. Build conversation text
    const conversation = (session.conversation_history as ChatMessage[]) || [];
    const conversationText = conversation
        .map((msg) => `${msg.role === 'coach' ? 'Coach' : 'Kandidat'}: ${msg.content}`)
        .join('\n\n');

    const round = session.interview_round || 'kennenlernen';
    const dimNames = DIMENSION_NAMES_BY_ROUND[round] || DIMENSION_NAMES_BY_ROUND['kennenlernen'];

    // 3. Generate report via Claude Haiku
    const client = getClient();
    const response = await client.messages.create({
        model: REPORT_MODEL,
        max_tokens: 3500,
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
Auch bei kurzen Gesprächen (1-2 Fragen): Arbeite mit dem vorhandenen Material. Eine einzelne Antwort enthält Signal zu Kommunikationsstil, Struktur, Motivation und Authentizität. Bewerte ehrlich was du siehst — nicht halluzinieren, aber auch nicht kapitulieren.

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
   - Wann empfehlen: Kandidat bezieht keine klare Position, bleibt unverbindlich

2. 3-2-1-Framework (bei chaotischen Antworten unter Druck):
   - topic: "3-2-1-Framework: Spontane Fragen meistern"
   - searchQuery: "spontane Fragen Interview strukturiert beantworten"
   - youtubeTitle: "Spontane Interview-Fragen meistern – Das 3-2-1-Framework"
   - category: "interview"
   - Wann empfehlen: Kandidat beginnt mit Füllwörtern, schweift ab, verliert den Faden

3. CCC-Framework (bei unklaren Erklärungen komplexer Themen):
   - topic: "CCC-Framework: Komplexes klar erklären"
   - searchQuery: "komplexe Themen einfach erklären Interview Technik"
   - youtubeTitle: "CCC-Framework – Komplexe Sachverhalte klar kommunizieren"
   - category: "interview"
   - Wann empfehlen: Kandidat verliert den roten Faden bei komplexen Sachverhalten

REGEL: Wenn der Kandidat strukturiert und klar antwortet → KEIN Framework empfehlen.

NOCHMAL: observation, reason, suggestion sind KURZE STICHPUNKTE (max 8-10 Wörter). KEINE Sätze, KEINE Absätze!`,
        messages: [
            {
                role: 'user',
                content: `Erstelle den Feedback-Report für folgendes Mock-Interview:\n\nSTELLE: ${job?.job_title || 'Unbekannt'} bei ${job?.company_name || 'Unbekannt'}\n\nINTERVIEW-PROTOKOLL:\n${conversationText}\n\nAntworte als JSON.`,
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
        const fallbackDims = (DIMENSION_NAMES_BY_ROUND[round] || DIMENSION_NAMES_BY_ROUND['kennenlernen']).map(name => ({
            name, score: 3, level: 'red' as const, tag: 'Technischer Fehler',
            observation: 'Report-Generierung **fehlgeschlagen**', reason: 'JSON konnte nicht **geparst** werden',
            suggestion: '**Analyse neu generieren**', quote: '—', feedback: '',
        }));
        reportJson = {
            overallScore: 3,
            topStrength: '', recommendation: '',
            whatWorked: 'Die Analyse konnte technisch nicht korrekt erstellt werden.',
            whatWasMissing: 'Bitte klicke auf "Analyse neu generieren" für einen erneuten Versuch.',
            recruiterAdvice: 'Ein erneuter Versuch sollte das Problem lösen.',
            summary: 'Technischer Fehler bei der Report-Generierung.',
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

    // 6. Log
    await supabaseAdmin.from('generation_logs').insert({
        job_id: session.job_id,
        user_id: userId,
        model_name: REPORT_MODEL,
        model_version: COACHING_PROMPT_VERSION,
        iteration: 99,
        prompt_tokens: response.usage.input_tokens,
        completion_tokens: response.usage.output_tokens,
        overall_score: score,
        generated_text: text.substring(0, 500),
        created_at: new Date().toISOString(),
    });

    console.log(`✅ [Coaching Report] Saved for session ${sessionId} | Score: ${score}/10`);
}
