/**
 * Hiring Manager Resolver — Perplexity Sonar
 *
 * Batch 3.2: Resolves likely hiring managers from job descriptions
 * and derives personality personas for tone-matching.
 *
 * Graceful Degradation: Missing API key or errors → default persona.
 */

// ─── Types ────────────────────────────────────────────────────────────────────
export interface HiringPersona {
    name: string;            // z.B. "Anna-Nicole W." oder "Unbekannt"
    role: string;            // z.B. "People Lead @ Mission Wertvoll"
    traits: string[];        // z.B. ["Werteorientiert", "Empathisch"]
    preferredStyle: 'storytelling' | 'data-driven' | 'formal' | 'philosophisch';
    confidence: number;      // 0-1: Wie sicher ist die Persona-Ableitung?
}

const DEFAULT_PERSONA: HiringPersona = {
    name: 'Unbekannt',
    role: '',
    traits: [],
    preferredStyle: 'formal',
    confidence: 0,
};

// ─── Resolver ─────────────────────────────────────────────────────────────────
export async function resolveHiringPersona(
    jobDescription: string,
    companyName: string,
    contactPerson?: string,
): Promise<HiringPersona[]> {
    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (!apiKey) {
        console.warn('⚠️ [HiringResolver] PERPLEXITY_API_KEY missing — returning default persona');
        return [DEFAULT_PERSONA];
    }

    const contactHint = contactPerson
        ? `\nBekannter Ansprechpartner: "${contactPerson}". Suche öffentliche Informationen zu dieser Person.`
        : '';

    const prompt = `Analysiere diese Stellenanzeige für "${companyName}":
---
${jobDescription.substring(0, 2000)}
---
${contactHint}

Aufgabe:
1. Identifiziere den/die wahrscheinlichsten Hiring Manager (aus Anzeige, Impressum oder öffentlichen Profilen)
2. Leite für jede Person ab: Werte, Hintergrund, vermutliche Prioritäten
3. Wenn keine Person identifizierbar: Erstelle 2 Archetypen basierend auf der Rolle (z.B. "People Lead" vs. "CTO")

Output als JSON:
{
  "personas": [
    {
      "name": "Name oder Archetyp-Bezeichnung",
      "role": "Rolle @ Firma",
      "traits": ["Eigenschaft 1", "Eigenschaft 2", "Eigenschaft 3"],
      "preferredStyle": "storytelling" | "data-driven" | "formal" | "philosophisch",
      "confidence": 0.0-1.0
    }
  ]
}

Maximal 3 Personas. confidence = 0.0 wenn Archetyp, > 0.5 wenn reale Person identifiziert.`;

    try {
        const response = await fetch('https://api.perplexity.ai/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: 'sonar',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 800,
            }),
        });

        if (!response.ok) {
            throw new Error(`Perplexity API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (!content) throw new Error('Empty Perplexity response');

        // Perplexity may return markdown-wrapped JSON
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            console.warn('[HiringResolver] Could not parse JSON — returning default');
            return [DEFAULT_PERSONA];
        }

        const parsed = JSON.parse(jsonMatch[0]);
        const personas: HiringPersona[] = (parsed.personas || []).map((p: Record<string, unknown>) => ({
            name: (p.name as string) || 'Unbekannt',
            role: (p.role as string) || '',
            traits: (p.traits as string[]) || [],
            preferredStyle: (['storytelling', 'data-driven', 'formal', 'philosophisch'].includes(p.preferredStyle as string)
                ? p.preferredStyle
                : 'formal') as HiringPersona['preferredStyle'],
            confidence: typeof p.confidence === 'number' ? Math.min(1, Math.max(0, p.confidence)) : 0,
        }));

        if (personas.length === 0) return [DEFAULT_PERSONA];

        console.log(`✅ [HiringResolver] Found ${personas.length} persona(s): ${personas.map(p => p.name).join(', ')}`);
        return personas;

    } catch (error) {
        console.error('❌ [HiringResolver] Persona resolution failed:', error);
        return [DEFAULT_PERSONA];
    }
}
