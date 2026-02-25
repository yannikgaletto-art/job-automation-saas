'use server';

import OpenAI from 'openai';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export async function generateStationReasoning(
    role: string,
    company: string,
    bullets: string[],
    requirement: string
): Promise<string[]> {
    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            temperature: 0.7,
            messages: [
                {
                    role: "developer",
                    content: `Du bist ein erfahrener Recruiter und Karrierecoach. 
Erkläre in EXAKT drei kurzen, prägnanten Stichpunkten (Bullet Points), warum die folgende berufliche Station eine bestimmte Anforderung aus der Stellenanzeige erfüllt. 

Nutze die Du-Form. Bleib sehr konkret und beziehe dich direkt auf die Tätigkeiten/Erfolge der Person. Keine Floskeln.
GIB NUR EIN JSON ZURUECK.`
                },
                {
                    role: "user",
                    content: `STATION: 
Rolle: ${role}
Unternehmen: ${company}
Tätigkeiten/Erfolge:
${bullets.map(b => `- ${b}`).join('\n')}

ANFORDERUNG DER STELLENANZEIGE:
"${requirement}"`
                }
            ],
            response_format: {
                type: "json_schema",
                json_schema: {
                    name: "reasoning_response",
                    schema: {
                        type: "object",
                        properties: {
                            reasoning_bullets: {
                                type: "array",
                                items: { type: "string" },
                                description: "Genau 3 Stichpunkte."
                            }
                        },
                        required: ["reasoning_bullets"],
                        additionalProperties: false
                    },
                    strict: true
                }
            }
        });

        const content = response.choices[0].message.content;
        if (!content) throw new Error("No content generated");

        const parsed = JSON.parse(content);
        return parsed.reasoning_bullets.slice(0, 3);
    } catch (error) {
        console.error('Error generating station reasoning:', error);
        return [
            `Die Station ${role} bei ${company} zeigt Praxis-Erfahrung.`,
            `Es gibt klare Überschneidungen mit den Anforderungen.`,
            `Details aus dem CV stützen diese Empfehlung.`
        ];
    }
}
