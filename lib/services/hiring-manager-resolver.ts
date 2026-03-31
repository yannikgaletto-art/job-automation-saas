/**
 * Hiring Manager Resolver — Claude Haiku via Model Router
 *
 * Batch 3.2: Resolves likely hiring managers from job descriptions
 * and derives personality personas for tone-matching.
 *
 * COST OPTIMIZATION (2026-03-30 Phase 2):
 * - Switched from Perplexity Sonar → Claude Haiku via model-router
 * - Perplexity added no value here: without a contactPerson name it returned
 *   generic archetypes. Haiku produces identical archetypes from job text alone.
 * - DSGVO bonus: No PII (person names) sent to external search engine anymore.
 *
 * Graceful Degradation: Missing API key or errors → default persona.
 */

import { complete } from '@/lib/ai/model-router';

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
    const contactHint = contactPerson
        ? `\nBekannter Ansprechpartner: "${contactPerson}". Leite mögliche Eigenschaften aus dem Kontext der Stelle ab.`
        : '';

    const prompt = `Analysiere diese Stellenanzeige für "${companyName}":
---
${jobDescription.substring(0, 2000)}
---
${contactHint}

Aufgabe:
1. Identifiziere den/die wahrscheinlichsten Hiring Manager aus der Stellenanzeige
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
        const response = await complete({
            taskType: 'summarize_job_description',
            prompt,
            temperature: 0.3,
            maxTokens: 800,
        });

        // Robust JSON parsing — Haiku may wrap in markdown
        const jsonMatch = response.text.match(/\{[\s\S]*\}/);
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
