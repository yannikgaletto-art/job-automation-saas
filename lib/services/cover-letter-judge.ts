/**
 * Cover Letter Quality Judge — Claude Haiku
 *
 * Pass/Fail judge: Checks hard constraints only (no numeric scores).
 * Extracted from cover-letter-generator.ts for maintainability.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { CoverLetterSetupContext } from '@/types/cover-letter-setup';
import type { StyleAnalysis } from './writing-style-analyzer';

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

// ─── Judge ────────────────────────────────────────────────────────────────────
export async function judgeCoverLetter(
    text: string,
    job: JobData,
    setupContext: CoverLetterSetupContext | undefined,
    style: StyleAnalysis | null
): Promise<JudgeResult> {
    const FALLBACK: JudgeResult = {
        pass: true,
        failReasons: [],
        weaknesses: []
    };

    if (!process.env.ANTHROPIC_API_KEY) {
        console.warn('⚠️ [Judge] No API Key — returning fallback (pass)');
        return FALLBACK;
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const isEnglish = setupContext?.tone?.targetLanguage === 'en';
    const companyName = job?.company_name || (isEnglish ? 'the company' : 'das Unternehmen');
    const enablePingPong = setupContext?.optInModules?.pingPong ?? setupContext?.enablePingPong ?? false;
    const hasQuote = !!setupContext?.selectedQuote?.quote;

    const judgePrompt = isEnglish
        ? `You are a strict cover letter quality checker. Check ONLY hard constraints.

COVER LETTER:
***
${text}
***

HARD CONSTRAINT CHECKS (each violation = fail):

1. GPT-BLACKLIST: Does the text contain any of these forbidden phrases?
   - "I am excited to apply", "I am confident that", "my passion for"
   - "ideal for this position", "With great enthusiasm", "I am writing to apply"
   - "Ich freue mich sehr darauf", "hiermit bewerbe ich mich"
   If YES → fail_reason: "BLACKLIST: [found phrase]"

2. COMPANY MENTION: Is "${companyName}" (or a recognizable variant) mentioned at least once in the text?
   If NO → fail_reason: "COMPANY: Company name missing from text"

3. WORD COUNT: Does the text have between 150 and 500 words?
   If NO → fail_reason: "LENGTH: Text has [N] words (allowed: 150-500)"
${enablePingPong && hasQuote ? `
4. PING-PONG: Does the introduction contain a REAL antithesis — an earlier different perspective of the candidate?
   Pseudo-contrast (FAILS): "I saw it the same way", "always have", "even more convinced"
   If no real contrast → fail_reason: "PING-PONG: No real perspective shift in the introduction"` : ''}

Additionally: Name at most 2 optional improvement suggestions (weaknesses), if you notice anything.

Respond ONLY as valid JSON:
{
  "pass": true/false,
  "fail_reasons": ["..."],
  "weaknesses": ["..."]
}`
        : `Du bist ein strenger Anschreiben-Qualitätsprüfer. Prüfe NUR harte Constraints.

ANSCHREIBEN:
***
${text}
***

HARTE CONSTRAINT-CHECKS (jeder Verstoß = fail):

1. GPT-BLACKLIST: Enthält der Text eine dieser verbotenen Phrasen?
   - "Ich freue mich sehr darauf", "Ich bin überzeugt, dass", "meine Leidenschaft für"
   - "ideal auf diese Stelle", "Mit großer Begeisterung", "hiermit bewerbe ich mich"
   - "I am excited to apply", "I am confident that"
   Wenn JA → fail_reason: "BLACKLIST: [gefundene Phrase]"

2. FIRMENNENNUNG: Wird "${companyName}" (oder eine erkennbare Variante) mindestens 1x im Text erwähnt?
   Wenn NEIN → fail_reason: "FIRMA: Unternehmensname fehlt im Text"

3. WORTLÄNGE: Hat der Text zwischen 150 und 500 Wörter?
   Wenn NEIN → fail_reason: "LÄNGE: Text hat [N] Wörter (erlaubt: 150-500)"
${enablePingPong && hasQuote ? `
4. PING-PONG: Enthält die Einleitung eine ECHTE Antithese — eine frühere andere Perspektive des Kandidaten?
   Pseudo-Kontrast (SCHEITERT): "Ich sah das genauso", "immer schon", "noch überzeugter"
   Wenn kein echter Kontrast → fail_reason: "PING-PONG: Kein echter Perspektiv-Wechsel in der Einleitung"` : ''}

Zusätzlich: Nenne maximal 2 optionale Verbesserungsvorschläge (weaknesses), falls dir etwas auffällt.

Antworte NUR als valides JSON:
{
  "pass": true/false,
  "fail_reasons": ["..."],
  "weaknesses": ["..."]
}`;

    try {
        console.log('🔍 [Judge] Calling Haiku for Pass/Fail check...');

        const message = await anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 200,
            temperature: 0.1,
            system: 'You are a strict cover letter constraint checker. Respond only with valid JSON.',
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

        const pass = parsed.pass ?? true;
        const failReasons = parsed.fail_reasons || [];
        const weaknesses = parsed.weaknesses || [];

        console.log(`${pass ? '✅' : '❌'} [Judge] pass=${pass} failReasons=${failReasons.length} weaknesses=${weaknesses.length}`);

        return { pass, failReasons, weaknesses };

    } catch (err) {
        console.error('❌ [Judge] Failed to parse judge response:', err);
        console.warn('⚠️ [Judge] Using fallback (pass)');
        return FALLBACK;
    }
}
