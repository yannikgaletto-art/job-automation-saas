/**
 * Cover Letter Quality Judge — Claude Haiku
 *
 * Extracted from cover-letter-generator.ts for maintainability.
 * Only depends on Anthropic SDK for Haiku judge calls.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { CoverLetterSetupContext } from '@/types/cover-letter-setup';
import type { StyleAnalysis } from './writing-style-analyzer';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface JudgeResult {
    scores: {
        naturalness: number;
        style_match: number;
        company_relevance: number;
        individuality: number;
        overall_score: number;
    };
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
    const FALLBACK_SCORES: JudgeResult = {
        scores: { naturalness: 7, style_match: 7, company_relevance: 7, individuality: 7, overall_score: 7 },
        weaknesses: []
    };

    if (!process.env.ANTHROPIC_API_KEY) {
        console.warn('⚠️ [Judge] No API Key — returning fallback scores');
        return FALLBACK_SCORES;
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const hookContent = setupContext?.selectedQuote?.quote || setupContext?.selectedHook?.content || '';
    const tonePreset = setupContext?.tone.preset || 'formal';
    const requirements = (job?.requirements || []).slice(0, 3);
    const companyName = job?.company_name || 'das Unternehmen';

    const toneRubric: Record<string, string> = {
        'data-driven': 'Enthält Zahlen/KPIs/messbare Resultate in jedem Absatz? Claim-Beweis-Implikation Struktur? Aktive Verben?',
        'storytelling': 'Erzählstruktur (Situation-Handlung-Ergebnis)? Kohärentes Karriere-Narrativ? Persönliche Momente? Roter Faden?',
        'formal': 'Klassische 4-Absatz-Struktur? Vollständige Formulierungen? Kein umgangssprachlicher Ton? Seriöse Übergänge?',
        'philosophisch': 'Intellektueller Rahmen? Konzept-Beweis-Reflexion? Max. 1 Zitat? Strategische Denktiefe sichtbar?'
    };

    const judgePrompt = `Du bist ein strenger Anschreiben-Qualitätsprüfer. Sei ehrlich und kritisch.

Bewerte dieses Anschreiben auf 4 Dimensionen (0–10, halbe Punkte erlaubt).

BEWERTUNGSKRITERIEN:

1. NATÜRLICHKEIT (0–10):
GPT-Marker (sofort -2 Punkte pro Treffer):
- "Ich freue mich sehr darauf", "Ich bin überzeugt, dass", "meine Leidenschaft für", "ideal auf diese Stelle", "Mit großer Begeisterung"
10 = klingt wie ein realer Mensch, 0 = eindeutig KI-generiert

2. STIL-MATCH (0–10):
Gewünschter Preset: ${tonePreset}
Rubrik: ${toneRubric[tonePreset] || toneRubric['formal']}

3. RELEVANZ (0–10):
Job-Anforderungen: ${requirements.map((r, i) => `${i + 1}. ${r}`).join(' | ')}
Unternehmen: ${companyName}
${hookContent ? `Aufhänger (soll integriert sein): "${hookContent.substring(0, 100)}..."` : ''}

4. INDIVIDUALITÄT (0–10):
Spezifische Details, Zahlen, Projekte? Oder austauschbar?

ANSCHREIBEN:
***
${text}
***

Sei streng. Durchschnittlich = 6-7, nicht 8-9.
WICHTIG: Wenn der 'overall_score' unter 9.0 liegt, MUSST du zwingend mindestens eine konkrete inhaltliche Schwäche im "weaknesses" Array nennen! 

Antworte NUR als valides JSON:
{
  "naturalness": <0-10>,
  "style_match": <0-10>,
  "company_relevance": <0-10>,
  "individuality": <0-10>,
  "overall_score": <0-10>,
  "weaknesses": ["<Schwäche 1>", "<Schwäche 2>"]
}`;

    try {
        console.log('🔍 [Judge] Calling Haiku for quality assessment...');

        const message = await anthropic.messages.create({
            model: 'claude-3-haiku-20240307',
            max_tokens: 300,
            temperature: 0.1,
            system: 'You are a strict cover letter quality assessor. Respond only with valid JSON.',
            messages: [{ role: 'user', content: judgePrompt }]
        });

        const content = message.content[0].type === 'text' ? message.content[0].text : '';

        let parsed: JudgeResult['scores'] & { weaknesses?: string[] };
        try {
            parsed = JSON.parse(content);
        } catch {
            // Fallback: extract JSON from markdown code block
            const match = content.match(/\{[\s\S]*\}/);
            if (!match) throw new Error('No JSON in judge response');
            parsed = JSON.parse(match[0]);
        }

        console.log(`✅ [Judge] naturalness=${parsed.naturalness} style=${parsed.style_match} relevance=${parsed.company_relevance} individuality=${parsed.individuality} overall=${parsed.overall_score}`);

        return {
            scores: {
                naturalness: parsed.naturalness,
                style_match: parsed.style_match,
                company_relevance: parsed.company_relevance,
                individuality: parsed.individuality,
                overall_score: parsed.overall_score,
            },
            weaknesses: parsed.weaknesses || []
        };

    } catch (err) {
        console.error('❌ [Judge] Failed to parse judge response:', err);
        console.warn('⚠️ [Judge] Using fallback scores');
        return FALLBACK_SCORES;
    }
}
