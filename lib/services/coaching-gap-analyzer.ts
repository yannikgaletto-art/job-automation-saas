/**
 * Coaching Gap Analyzer
 * Feature-Silo: coaching
 * 
 * Analyzes the gap between a user's CV and job requirements.
 * Uses isolated Anthropic client — does NOT touch model-router.ts.
 * 
 * QA: Uses existing cv-text-retriever.ts for CV parsing.
 * Round-aware: generates different output schemas per interview round.
 */

import Anthropic from '@anthropic-ai/sdk';
import { getCVText } from '@/lib/services/cv-text-retriever';
import type { CoachingDossier, KennenlernenDossier, DeepDiveDossier, CaseStudyDossier } from '@/types/coaching';
import type { InterviewRound } from '@/lib/prompts/coaching-system-prompt';

// Isolated Anthropic client — NOT from model-router (Forbidden File)
let coachingClient: Anthropic | null = null;

function getClient(): Anthropic {
    if (!coachingClient) {
        coachingClient = new Anthropic({
            apiKey: process.env.ANTHROPIC_API_KEY!,
        });
    }
    return coachingClient;
}

const COACHING_MODEL = 'claude-sonnet-4-5-20250929';

interface JobData {
    jobTitle: string;
    companyName: string;
    description: string;
    requirements: Record<string, unknown> | null;
}

// ─── Round-specific JSON schema instructions ────────────────────────────
function getSchemaInstruction(round: InterviewRound, companyName: string, jobTitle: string): string {
    switch (round) {
        case 'kennenlernen':
            return `Antworte als JSON mit exakt dieser Struktur:
{
  "strengths": ["Genau 3 relevante Stärken des Kandidaten für diese Stelle"],
  "gaps": ["Genau 3 kritische Lücken zwischen CV und Anforderungsprofil"],
  "interviewQuestions": ["5 Motivations- und Cultural-Fit-Fragen basierend auf dem CV und den Gaps. Fokus: Werdegang, Motivation, Soft Skills. BEZIEHE DICH auf konkrete Punkte aus dem Lebenslauf."],
  "companyContext": "2-3 Sätze über das Unternehmen und die Rolle"
}`;

        case 'deep_dive':
            return `Antworte als JSON mit exakt dieser Struktur:
{
  "strengths": ["Genau 3 relevante Stärken des Kandidaten"],
  "gaps": ["Genau 3 kritische fachliche/technische Lücken"],
  "probingAreas": [
    {
      "mainQuestion": "Eine tiefgehende STAR-Format-Frage zu einem kritischen Gap. BEZIEHE DICH auf konkrete Projekte oder Erfahrungen aus dem Lebenslauf.",
      "followUps": [
        "Nachfrage 1: Warum genau dieser Ansatz? Was wäre die Alternative gewesen?",
        "Nachfrage 2: Was war das messbare Ergebnis? Was hätten Sie rückblickend anders gemacht?"
      ]
    }
  ],
  "companyContext": "2-3 Sätze über das Unternehmen und die Rolle"
}
WICHTIG: Generiere genau 3 probingAreas, jede mit 1 mainQuestion und 2 followUps.
Die Fragen müssen fachlich/technisch tiefgehend sein und sich auf KONKRETE CV-Inhalte beziehen.`;

        case 'case_study':
            return `Antworte als JSON mit exakt dieser Struktur:
{
  "strengths": ["Genau 3 relevante Stärken des Kandidaten"],
  "gaps": ["Genau 3 kritische Lücken"],
  "caseScenario": "Ein detailliertes, realistisches Business-Szenario (8-12 Sätze) aus dem Arbeitsalltag bei ${companyName} für die Stelle ${jobTitle}. Das Szenario beschreibt ein konkretes Problem, das der Kandidat lösen muss. Es soll zu den Gaps des Kandidaten passen, sodass er/sie gezielt gefordert wird. Beschreibe die Ausgangssituation, die Stakeholder und das Ziel.",
  "hiddenData": [
    "Datenpunkt 1 den der Kandidat erst erfragen muss (z.B. eine konkrete Kennzahl)",
    "Datenpunkt 2 (z.B. ein internes Hindernis oder eine Marktinformation)",
    "Datenpunkt 3 (z.B. Budget, Timeline oder Teamgröße)"
  ],
  "expectedApproach": "Kurze Beschreibung (3-4 Sätze) wie ein idealer Kandidat das Szenario strukturiert angehen würde.",
  "companyContext": "2-3 Sätze über das Unternehmen und die Rolle"
}
WICHTIG: Das Szenario muss SPEZIFISCH für ${companyName} und die Rolle ${jobTitle} sein. Kein generisches Szenario!`;
    }
}

// ─── Round-specific fallback dossiers ────────────────────────────────────
function getFallbackDossier(round: InterviewRound, jobData: JobData): CoachingDossier {
    const base = {
        strengths: ['Berufserfahrung vorhanden'],
        gaps: ['Keine detaillierte Analyse möglich'],
        companyContext: `${jobData.companyName} sucht eine/n ${jobData.jobTitle}.`,
    };

    switch (round) {
        case 'kennenlernen':
            return {
                ...base,
                interviewQuestions: [
                    'Erzählen Sie uns von sich und Ihrem beruflichen Werdegang.',
                    'Was motiviert Sie, sich bei uns zu bewerben?',
                    'Welche relevante Erfahrung bringen Sie für diese Stelle mit?',
                    'Wie gehen Sie mit Herausforderungen im Arbeitsalltag um?',
                    'Wo sehen Sie sich in drei Jahren?',
                ],
            } as KennenlernenDossier;

        case 'deep_dive':
            return {
                ...base,
                probingAreas: [
                    {
                        mainQuestion: 'Beschreiben Sie ein Projekt, bei dem Sie eine komplexe Herausforderung lösen mussten.',
                        followUps: [
                            'Welchen Ansatz haben Sie gewählt und warum?',
                            'Was war das messbare Ergebnis?',
                        ],
                    },
                    {
                        mainQuestion: 'Wie haben Sie in Ihrer letzten Rolle fachliche Entscheidungen getroffen?',
                        followUps: [
                            'Welche Daten haben Sie herangezogen?',
                            'Was hätten Sie im Nachhinein anders gemacht?',
                        ],
                    },
                    {
                        mainQuestion: 'Erzählen Sie von einer Situation, in der Sie unter Zeitdruck liefern mussten.',
                        followUps: [
                            'Wie haben Sie priorisiert?',
                            'Was haben Sie aus dieser Erfahrung gelernt?',
                        ],
                    },
                ],
            } as DeepDiveDossier;

        case 'case_study':
            return {
                ...base,
                caseScenario: `Sie sind neu im Team bei ${jobData.companyName} als ${jobData.jobTitle}. In Ihrem ersten Monat stellen Sie fest, dass ein wichtiges Projekt hinter dem Zeitplan liegt und die Stakeholder unzufrieden sind. Ihr Vorgesetzter bittet Sie, die Situation zu analysieren und einen Vorschlag zur Lösung zu erarbeiten.`,
                hiddenData: [
                    'Das Projekt hat 3 Monate Verspätung',
                    'Zwei Schlüsselpersonen haben das Team verlassen',
                    'Das Budget wurde bereits zu 80% aufgebraucht',
                ],
                expectedApproach: 'Der Kandidat sollte zuerst die Ursachen analysieren (Ressourcen, Scope, Timeline), dann priorisieren und einen strukturierten Lösungsvorschlag präsentieren.',
            } as CaseStudyDossier;
    }
}

export async function analyzeGap(
    userId: string,
    jobData: JobData,
    interviewRound: InterviewRound = 'kennenlernen'
): Promise<{ dossier: CoachingDossier; tokensUsed: number; costCents: number }> {
    // 1. Get CV text via existing service (QA: reuse, don't reinvent)
    const cvResult = await getCVText(userId);
    if (!cvResult) {
        throw new Error('CV_NOT_FOUND: Kein Lebenslauf gefunden. Bitte lade deinen CV in den Settings hoch.');
    }

    const requirementsText = jobData.requirements
        ? JSON.stringify(jobData.requirements, null, 2)
        : 'Keine strukturierten Anforderungen verfügbar.';

    const schemaInstruction = getSchemaInstruction(interviewRound, jobData.companyName, jobData.jobTitle);

    // 2. Analyze gap via Claude Sonnet (isolated client)
    const client = getClient();
    const response = await client.messages.create({
        model: COACHING_MODEL,
        max_tokens: 2048,
        temperature: 0.3,
        system: `Du bist ein Recruiting-Analyst. Analysiere den Lebenslauf gegen die Stellenanforderungen.
BEZIEHE DICH IMMER auf konkrete Inhalte aus dem Lebenslauf des Kandidaten.
Antworte ausschließlich als valides JSON (kein Markdown, keine Code-Blöcke).`,
        messages: [
            {
                role: 'user',
                content: `Analysiere den folgenden Lebenslauf gegen die Stellenanforderungen und erstelle ein Coaching-Dossier.

LEBENSLAUF:
${cvResult.text.substring(0, 4000)}

STELLE: ${jobData.jobTitle} bei ${jobData.companyName}

STELLENBESCHREIBUNG:
${jobData.description?.substring(0, 3000) || 'Nicht verfügbar'}

ANFORDERUNGEN:
${requirementsText.substring(0, 2000)}

${schemaInstruction}`,
            },
        ],
    });

    const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('\n');

    const tokensUsed = response.usage.input_tokens + response.usage.output_tokens;
    const costCents = Math.ceil((tokensUsed / 1_000_000) * 3.0 * 100); // Sonnet pricing

    // 3. Parse JSON response (robust extraction)
    let dossier: CoachingDossier;
    try {
        // Try multiple extraction strategies
        let jsonStr = text.trim();

        // Strategy 1: Strip markdown code blocks
        jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

        // Strategy 2: If still not parseable, find the first { ... } block
        if (!jsonStr.startsWith('{')) {
            const match = jsonStr.match(/\{[\s\S]*\}/);
            if (match) {
                jsonStr = match[0];
            }
        }

        dossier = JSON.parse(jsonStr);
        console.log(`✅ [Coaching] JSON parsed successfully for round: ${interviewRound}`);
    } catch (parseError) {
        console.error('❌ [Coaching] Gap analysis JSON parse failed:', parseError);
        console.error('Raw response (first 500 chars):', text.substring(0, 500));
        // QA FIX: Round-aware fallback dossier
        dossier = getFallbackDossier(interviewRound, jobData);
    }

    // 4. Validate dossier structure (round-aware)
    if (!Array.isArray(dossier.strengths)) dossier.strengths = ['Erfahrung vorhanden'];
    if (!Array.isArray(dossier.gaps)) dossier.gaps = ['Keine Gaps identifiziert'];
    if (!dossier.companyContext) {
        dossier.companyContext = `${jobData.companyName} sucht eine/n ${jobData.jobTitle}.`;
    }

    // Limit strengths and gaps to 3 items for better UX
    dossier.strengths = dossier.strengths.slice(0, 3);
    dossier.gaps = dossier.gaps.slice(0, 3);

    // Round-specific validation
    if (interviewRound === 'kennenlernen') {
        const d = dossier as KennenlernenDossier;
        if (!Array.isArray(d.interviewQuestions) || d.interviewQuestions.length < 3) {
            dossier = getFallbackDossier('kennenlernen', jobData);
        }
    } else if (interviewRound === 'deep_dive') {
        const d = dossier as DeepDiveDossier;
        if (!Array.isArray(d.probingAreas) || d.probingAreas.length < 2) {
            dossier = getFallbackDossier('deep_dive', jobData);
        }
    } else if (interviewRound === 'case_study') {
        const d = dossier as CaseStudyDossier;
        if (!d.caseScenario || !Array.isArray(d.hiddenData)) {
            dossier = getFallbackDossier('case_study', jobData);
        }
    }

    console.log(`✅ [Coaching] Gap analysis complete (round: ${interviewRound}): ${dossier.strengths.length} strengths, ${dossier.gaps.length} gaps`);

    return { dossier, tokensUsed, costCents };
}
