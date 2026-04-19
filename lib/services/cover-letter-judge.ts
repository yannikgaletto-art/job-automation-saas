/**
 * Cover Letter Quality Judge — Claude Haiku
 *
 * Pass/Fail judge: Checks hard constraints only (no numeric scores).
 * Extracted from cover-letter-generator.ts for maintainability.
 *
 * Hard-Checks (jeder = fail → Re-Generation):
 *  1. GPT-BLACKLIST: Verbotene Phrasen (KI-Tropen, Allwissens-Konstrukte, Doppelfehler)
 *  2. FIRMENNENNUNG: Unternehmensname mindestens 1x
 *  3. WORTLÄNGE: 150–500 Wörter
 *  4. SUBJEKT-INTEGRITÄT: Keine allwissenden Firmen/Branchen-Statements
 *  5. INTRO-ÖFFNUNG: Erster Absatz mit ICH-Perspektive + Firmenbezug
 *  6. PING-PONG (optional, nur wenn Quote + PingPong aktiv)
 *
 * Fallback: pass: false — bei Haiku-Timeout kein ungeprüfter Text durchgelassen.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { CoverLetterSetupContext } from '@/types/cover-letter-setup';
import type { StyleAnalysis } from './writing-style-analyzer';
import { buildJudgeBlacklistSection } from './anti-fluff-blacklist';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface JudgeResult {
    pass: boolean;
    failReasons: string[];
    weaknesses: string[];
}

interface JobData {
    job_title?: string;
    company_name?: string;
    requirements?: string[];
    [key: string]: unknown;
}



const SUBJEKT_CHECK_DE = `
4. SUBJEKT-INTEGRITÄT: Beschreibt der Bewerber Firmen- oder Branchen-Fakten als objektive Wahrheit (statt als eigene Beobachtung)?

VERBOTEN (fail) — Allwissende Statements:
❌ „E-Commerce-Plattformen stehen und fallen damit, dass..." (Branchen-Allwissen)
❌ „In der heutigen Zeit steht die Branche vor..." (neutrales Branchen-Statement)
❌ „Da ihr genau an dieser Stelle agiert..." (Bewerber beschreibt interne Firmen-Wahrheit)
❌ „Dass Sicherheit bei euch kein isoliertes Thema ist..." (Allwissen über interne Kultur)
❌ „[Firma] steht für Innovation" (Bewerber urteilt über Firm-Identität)

ERLAUBT (pass) — Subjektive Beobachtung:
✅ „Da ich auf eurer Website gelesen habe, dass ihr..." (eigene Recherche)
✅ „Als ich euer Projekt sah, hat mich beeindruckt, dass..." (subjektive Reaktion)
✅ „Euer Ansatz bei X hat mich angesprochen, weil..." (eigene Einschätzung)
✅ „Dass ihr so stark auf X setzt, zeigt für mich, dass..." (eigene Interpretation)
✅ „Ich habe die Erfahrung gemacht, dass..." (persönliche Beobachtung statt Branchen-These)

Wenn ein klares allwissendes Statement gefunden → fail_reason: "SUBJEKT: [Fundstelle] — Bewerber formuliert Firmen/Branchen-Wahrheit statt eigene Beobachtung"`;

const SUBJEKT_CHECK_EN = `
4. SUBJECT-INTEGRITY: Does the applicant describe company/industry facts as objective truth (instead of their own observation)?

FORBIDDEN (fail) — Omniscient statements:
❌ "E-commerce platforms stand or fall on..." (industry omniscience)
❌ "In today's world, the industry faces..." (neutral industry statement)
❌ "Since you operate exactly at this point..." (applicant describes internal company truth)
❌ "That security at your company is not an isolated topic..." (omniscience about internal culture)
❌ "[Company] stands for innovation" (applicant judges firm identity)

ALLOWED (pass) — Subjective observation:
✅ "Since I read on your website that you..." (own research)
✅ "When I saw your project, I was impressed that..." (subjective reaction)
✅ "Your approach to X appealed to me because..." (own assessment)
✅ "The fact that you focus so strongly on X shows me that..." (own interpretation)
✅ "In my experience I have found that..." (personal observation, not industry claim)

If a clear omniscient statement is found → fail_reason: "SUBJECT: [found passage] — applicant states company/industry truth instead of personal observation"`;

const INTRO_CHECK_DE = `
5. INTRO-ÖFFNUNG: Öffnet der ERSTE Absatz des Anschreibens mit einer ICH-Perspektive die einen direkten Firmenbezug enthält?

BESTANDEN wenn der erste Absatz:
✅ Ein Ich-Verb mit direktem Firmenbezug enthält (ich las, ich sah, ich recherchierte, ich beobachtete, mir fiel auf, mich begeisterte, mich sprach an)
✅ ODER eine subjektive Einschätzung mit expliziter Ich-Rahmung: „Dass ihr so stark auf X setzt, zeigt für mich..."
✅ ODER eine konkrete eigene Handlung als Anker: „Als ich eure Website las...", „Auf eurer Website sind mir eure Beiträge zu X aufgefallen..."

SCHEITERT wenn der erste Absatz:
❌ Mit einer objektiven Firmenbeschreibung ohne ICH-Rahmung öffnet
❌ Mit einer Branchen-These oder Allgemeinaussage beginnt
❌ Mit einem Zitat öffnet das dann KEIN Ich-Bezug zur Firma herstellt (Zitate sind erlaubt — aber danach muss eine ICH-Verbindung kommen)
❌ Mit dem Namen der Firma als grammatikalisches Subjekt öffnet ohne Ich-Rahmung

→ fail_reason: "INTRO: Erster Absatz öffnet ohne ICH-Perspektive + Firmenbezug. Bewerber beschreibt Firma statt eigene Beobachtung."`;

const INTRO_CHECK_EN = `
5. INTRO-OPENING: Does the FIRST paragraph of the cover letter open with an ICH-perspective that contains a direct company reference?

PASSED if the first paragraph:
✅ Contains an I-verb with direct company reference (I read, I saw, I researched, I noticed, I was impressed by, appealed to me)
✅ OR a subjective assessment with explicit I-framing: "The fact that you focus so strongly on X shows me..."
✅ OR a concrete personal action as anchor: "When I read your website...", "On your website I noticed your contributions to X..."

FAILS if the first paragraph:
❌ Opens with an objective company description without I-framing
❌ Begins with an industry thesis or general claim
❌ Opens with a quote that then establishes NO I-connection to the company
❌ Opens with the company name as grammatical subject without I-framing

→ fail_reason: "INTRO: First paragraph opens without I-perspective + company reference."`;

const WEAKNESS_HINTS_DE = `
Optionale Verbesserungshinweise (max. 2 weaknesses — nur wenn aufgefallen):
Achte besonders auf:
(a) Passive Stations-Übergänge: „ist meine Erfahrung bei X relevant" → besser: „kann ich mit meiner Zeit bei X anknüpfen" / „möchte ich mein Projekt bei X beleuchten"
(b) Generisches Closing: Wenn der Abschluss wie ein Verkaufs-Pitch klingt → besser: „Ich hoffe, ihr konntet einen kleinen Eindruck von mir gewinnen. Ich bin die nächsten Wochen flexibel und freue mich darauf, euch kennenzulernen."
(c) Wiederholte Lernkurven-Phrase: Wenn im Text mehrfach dieselbe Lernkurven-Formulierung auftaucht → besser: Variiere aus Pool: „Erst durch [konkretes Event] verstand ich, dass [Einsicht]." / „Diese Erfahrung zeigte mir, dass [konkreter Schluss]." / „Anfangs unterschätzte ich [X]; durch [Y] wurde deutlich, dass [Z]."`;

const WEAKNESS_HINTS_EN = `
Optional improvement suggestions (max. 2 weaknesses — only if noticed):
Watch especially for:
(a) Passive station transitions: "my experience at X is relevant" → better: "I can build on my time at X" / "I would like to highlight my project at X"
(b) Generic closing: If the closing reads like a sales pitch → better: "I hope this gave you a small impression of who I am. I'm flexible over the coming weeks and look forward to meeting you."
(c) Repeated learning-curve phrase: If the same learning-curve formulation appears multiple times → better: vary from pool: "It was only through [concrete event] that I understood that [insight]." / "This experience showed me that [concrete conclusion]." / "At first I underestimated [X]; working with [Y] made it clear that [Z]."`;

// ─── Judge ────────────────────────────────────────────────────────────────────
export async function judgeCoverLetter(
    text: string,
    job: JobData,
    setupContext: CoverLetterSetupContext | undefined,
    style: StyleAnalysis | null
): Promise<JudgeResult> {
    // FALLBACK: pass: false — bei Ausfall kein ungeprüfter Text
    const FALLBACK: JudgeResult = {
        pass: false,
        failReasons: ['JUDGE_UNAVAILABLE: Qualitätsprüfung konnte nicht durchgeführt werden — Re-Generation wird ausgelöst'],
        weaknesses: []
    };

    if (!process.env.ANTHROPIC_API_KEY) {
        console.warn('⚠️ [Judge] No API Key — returning fallback (fail, triggers retry)');
        return FALLBACK;
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const isEnglish = setupContext?.tone?.targetLanguage === 'en';
    const companyName = job?.company_name || (isEnglish ? 'the company' : 'das Unternehmen');
    const enablePingPong = setupContext?.optInModules?.pingPong ?? setupContext?.enablePingPong ?? false;
    const hasQuote = !!setupContext?.selectedQuote?.quote;

    const pingPongCheckDE = enablePingPong && hasQuote
        ? `\n6. PING-PONG: Enthält die Einleitung eine ECHTE Antithese — eine frühere andere Perspektive des Kandidaten?
   Pseudo-Kontrast (SCHEITERT): „Ich sah das genauso", „immer schon", „noch überzeugter"
   Wenn kein echter Kontrast → fail_reason: "PING-PONG: Kein echter Perspektiv-Wechsel in der Einleitung"`
        : '';

    const pingPongCheckEN = enablePingPong && hasQuote
        ? `\n6. PING-PONG: Does the introduction contain a REAL antithesis — an earlier different perspective of the candidate?
   Pseudo-contrast (FAILS): "I saw it the same way", "always have", "even more convinced"
   If no real contrast → fail_reason: "PING-PONG: No real perspective shift in the introduction"`
        : '';

    const judgePrompt = isEnglish
        ? `You are a strict cover letter quality checker. Check ONLY the hard constraints below.

COVER LETTER:
***
${text}
***

HARD CONSTRAINT CHECKS (each violation = fail):

1. GPT-BLACKLIST: Does the text contain any of these forbidden phrases?
${buildJudgeBlacklistSection('en')}
   If YES → fail_reason: "BLACKLIST: [found phrase]"

2. COMPANY MENTION: Is "${companyName}" (or a recognizable variant) mentioned at least once?
   If NO → fail_reason: "COMPANY: Company name missing from text"

3. WORD COUNT: Does the text have between 150 and 500 words?
   If NO → fail_reason: "LENGTH: Text has [N] words (allowed: 150-500)"
${SUBJEKT_CHECK_EN}
${INTRO_CHECK_EN}
${pingPongCheckEN}

${WEAKNESS_HINTS_EN}

Respond ONLY as valid JSON:
{
  "pass": true/false,
  "fail_reasons": ["..."],
  "weaknesses": ["..."]
}`
        : `Du bist ein strenger Anschreiben-Qualitätsprüfer. Prüfe NUR die harten Constraints unten.

ANSCHREIBEN:
***
${text}
***

HARTE CONSTRAINT-CHECKS (jeder Verstoß = fail):

1. GPT-BLACKLIST: Enthält der Text eine dieser verbotenen Phrasen?
${buildJudgeBlacklistSection('de')}
   Wenn JA → fail_reason: "BLACKLIST: [gefundene Phrase]"

2. FIRMENNENNUNG: Wird "${companyName}" (oder eine erkennbare Variante) mindestens 1x im Text erwähnt?
   Wenn NEIN → fail_reason: "FIRMA: Unternehmensname fehlt im Text"

3. WORTLÄNGE: Hat der Text zwischen 150 und 500 Wörter?
   Wenn NEIN → fail_reason: "LÄNGE: Text hat [N] Wörter (erlaubt: 150-500)"
${SUBJEKT_CHECK_DE}
${INTRO_CHECK_DE}
${pingPongCheckDE}

${WEAKNESS_HINTS_DE}

Antworte NUR als valides JSON:
{
  "pass": true/false,
  "fail_reasons": ["..."],
  "weaknesses": ["..."]
}`;

    try {
        console.log('🔍 [Judge] Calling Haiku for Pass/Fail check (5 hard constraints)...');

        const message = await anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 400,
            temperature: 0.1,
            system: 'You are a strict cover letter constraint checker. Respond only with valid JSON. No explanations outside JSON.',
            messages: [{ role: 'user', content: judgePrompt }]
        });

        const content = message.content[0].type === 'text' ? message.content[0].text : '';

        let parsed: { pass?: boolean; fail_reasons?: string[]; weaknesses?: string[] };
        try {
            parsed = JSON.parse(content);
        } catch {
            const match = content.match(/\{[\s\S]*\}/);
            if (!match) throw new Error('No JSON in judge response');
            parsed = JSON.parse(match[0]);
        }

        // Safety: if Claude returns pass:true but has fail_reasons → treat as fail
        const failReasons = parsed.fail_reasons || [];
        const pass = failReasons.length === 0 ? (parsed.pass ?? false) : false;
        const weaknesses = parsed.weaknesses || [];

        console.log(`${pass ? '✅' : '❌'} [Judge] pass=${pass} failReasons=${failReasons.length} weaknesses=${weaknesses.length}`);
        if (failReasons.length > 0) {
            console.log(`  ❌ Fail reasons: ${failReasons.join(' | ')}`);
        }
        if (weaknesses.length > 0) {
            console.log(`  ⚠️  Weaknesses: ${weaknesses.join(' | ')}`);
        }

        return { pass, failReasons, weaknesses };

    } catch (err) {
        console.error('❌ [Judge] Failed to parse judge response:', err);
        console.warn('⚠️ [Judge] Using fallback (fail) — will trigger re-generation');
        return FALLBACK;
    }
}
