'use server';

import { complete } from '@/lib/ai/model-router';

/**
 * Generates 3 concise bullet points explaining WHY a CV station
 * fulfills a specific job requirement. Used in CoverLetterWizard Step 2.
 *
 * MIGRATION NOTE (2026-03-29): Replaced GPT-4o-mini direct call with
 * Claude Haiku via model-router (task: classify_station_relevance).
 */
export async function generateStationReasoning(
    role: string,
    company: string,
    bullets: string[],
    requirement: string
): Promise<string[]> {
    try {
        const systemPrompt = `Du bist ein erfahrener Recruiter und Karrierecoach. 
Erkläre in EXAKT drei kurzen, prägnanten Stichpunkten (Bullet Points), warum die folgende berufliche Station eine bestimmte Anforderung aus der Stellenanzeige erfüllt. 

Nutze die Du-Form. Bleib sehr konkret und beziehe dich direkt auf die Tätigkeiten/Erfolge der Person. Keine Floskeln.
Antworte NUR mit validem JSON. Kein Markdown, keine Codeblocks.

JSON-Format:
{
  "reasoning_bullets": ["Punkt 1", "Punkt 2", "Punkt 3"]
}`;

        const userPrompt = `STATION: 
Rolle: ${role}
Unternehmen: ${company}
Tätigkeiten/Erfolge:
${bullets.map(b => `- ${b}`).join('\n')}

ANFORDERUNG DER STELLENANZEIGE:
"${requirement}"`;

        const response = await complete({
            taskType: 'classify_station_relevance',
            systemPrompt,
            prompt: userPrompt,
            temperature: 0.7,
            maxTokens: 500,
        });

        // Robust JSON parsing — Claude may wrap in markdown
        let parsed: { reasoning_bullets: string[] };
        try {
            parsed = JSON.parse(response.text);
        } catch {
            const jsonMatch = response.text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                parsed = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error('No JSON found in station reasoning response');
            }
        }

        if (!Array.isArray(parsed.reasoning_bullets)) {
            throw new Error('reasoning_bullets is not an array');
        }

        return parsed.reasoning_bullets.slice(0, 3);
    } catch (error) {
        console.error('❌ [StationReasoning] Error:', error);
        return [
            `Die Station ${role} bei ${company} zeigt Praxis-Erfahrung.`,
            `Es gibt klare Überschneidungen mit den Anforderungen.`,
            `Details aus dem CV stützen diese Empfehlung.`
        ];
    }
}
