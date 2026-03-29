export const dynamic = 'force-dynamic';

import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { HiringManagerCritique } from '@/types/cover-letter-setup';

/**
 * POST /api/cover-letter/critique
 * Generates a single constructive critique from a simulated Hiring Manager persona.
 *
 * Input: { coverLetter: string, jobTitle: string, companyName: string }
 * Output: { success: boolean, critique: HiringManagerCritique | null }
 *
 * Auth: Required (401 without session)
 * Token-optimized: Only cover letter + job title + company name (no CV, no requirements)
 */
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json(
                { success: false, error: 'Not authenticated' },
                { status: 401 }
            );
        }

        const body = await request.json() as {
            coverLetter?: string;
            jobTitle?: string;
            companyName?: string;
            locale?: string;
        };

        if (!body.coverLetter || body.coverLetter.trim().length === 0) {
            return NextResponse.json(
                { success: false, error: 'Missing or empty coverLetter' },
                { status: 400 }
            );
        }

        // Use fallbacks for optional fields — never block critique on missing metadata
        const companyName = body.companyName?.trim() || 'the company';
        const jobTitle = body.jobTitle?.trim() || 'the role';

        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
            console.warn('⚠️ [Critique] No ANTHROPIC_API_KEY — returning null');
            return NextResponse.json({ success: true, critique: null });
        }

        const anthropic = new Anthropic({ apiKey });



        const locale = body.locale || 'de';

        const prompts: Record<string, string> = {
            de: `Du bist ein skeptischer, erfahrener Hiring Manager bei ${companyName} für die Rolle "${jobTitle}".

Lies dieses Anschreiben eines Kandidaten:
---
${body.coverLetter}
---

AUFGABE: Formuliere GENAU EINE konstruktive, spezifische Kritik als Hiring Manager.
REGELN:
- Beziehe dich auf eine KONKRETE LÜCKE (fehlende Zahlen, unklare Teamgröße, vage Ergebnisse)
- Keine generischen Kommentare
- Direkte Rede (Ich-Perspektive)
- Kurze, klare Sätze — maximal 20 Wörter pro Satz
- Die "critique" darf 2-3 Sätze lang sein, getrennt durch \\n\\n für Absätze
- Einen konkreten Verbesserungsvorschlag

Antworte NUR als valides JSON:
{
  "persona": "Skeptischer HR-Chef",
  "role": "Head of People @ ${companyName}",
  "critique": "Der Teil über [X] klingt gut.\\n\\nAber ich vermisse: [konkrete Frage]. Was waren die messbaren Ergebnisse?",
  "fixSuggestion": "Erwähne [konkretes Detail] bei Station [X]"
}`,
            en: `You are a skeptical, experienced Hiring Manager at ${companyName} for the role "${jobTitle}".

Read this cover letter from a candidate:
---
${body.coverLetter}
---

TASK: Formulate EXACTLY ONE constructive, specific critique as a Hiring Manager.
RULES:
- Focus on a CONCRETE GAP (missing numbers, unclear team size, vague results)
- No generic comments like "could be better"
- Write in first person (I-perspective as the hiring manager)
- Keep sentences SHORT — max 20 words per sentence
- The "critique" field may be 2-3 short sentences, separated by \\n\\n for paragraph breaks
- Provide a specific improvement suggestion

Respond ONLY as valid JSON:
{
  "persona": "Skeptical HR Director",
  "role": "Head of People @ ${companyName}",
  "critique": "The strategic thinking here is solid.\\n\\nBut I notice a critical absence: you don't mention a single quantifiable outcome. How many clients? What was the revenue impact?",
  "fixSuggestion": "Mention [specific detail] for the [X] role"
}`,
            es: `Eres un Director de Recursos Humanos escéptico y experimentado en ${companyName} para el puesto "${jobTitle}".

Lee esta carta de presentación del candidato:
---
${body.coverLetter}
---

TAREA: Formula EXACTAMENTE UNA crítica constructiva y específica como Director de RRHH.
REGLAS:
- Céntrate en una BRECHA CONCRETA (números faltantes, tamaño de equipo poco claro, resultados vagos)
- Sin comentarios genéricos
- Primera persona (perspectiva del director)
- Oraciones cortas — máximo 20 palabras por oración
- El campo "critique" puede tener 2-3 oraciones cortas, separadas por \\n\\n para párrafos
- Proporciona una sugerencia de mejora específica

Responde SOLO como JSON válido:
{
  "persona": "Director de RRHH Escéptico",
  "role": "Head of People @ ${companyName}",
  "critique": "La estrategia aquí es sólida.\\n\\nPero me falta un dato clave: no mencionas ningún resultado cuantificable. ¿Cuántos clientes? ¿Cuál fue el impacto en ingresos?",
  "fixSuggestion": "Menciona [detalle concreto] para el puesto [X]"
}`
        };

        const prompt = prompts[locale] ?? prompts['de'];

        console.log('🎭 [Critique] Generating hiring manager critique via Haiku...');

        const message = await anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 450,
            temperature: 0.3,
            system: 'You are a hiring manager simulator. Respond only with valid JSON.',
            messages: [{ role: 'user', content: prompt }]
        });


        const content = message.content[0].type === 'text' ? message.content[0].text : '';

        let parsed: HiringManagerCritique;
        try {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (!jsonMatch) throw new Error('No JSON found in critique response');
            parsed = JSON.parse(jsonMatch[0]);
        } catch {
            console.warn('⚠️ [Critique] Could not parse JSON — returning null');
            return NextResponse.json({ success: true, critique: null });
        }

        // Validate required fields
        if (!parsed.persona || !parsed.critique || !parsed.fixSuggestion) {
            console.warn('⚠️ [Critique] Incomplete response — returning null');
            return NextResponse.json({ success: true, critique: null });
        }

        console.log(`✅ [Critique] Generated critique from "${parsed.persona}"`);

        return NextResponse.json({
            success: true,
            critique: {
                persona: parsed.persona,
                role: parsed.role || `Hiring Manager @ ${companyName}`,
                critique: parsed.critique,
                fixSuggestion: parsed.fixSuggestion,
            } satisfies HiringManagerCritique,
        });

    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error('❌ [Critique] Error:', errMsg);
        return NextResponse.json(
            { success: false, error: errMsg },
            { status: 500 }
        );
    }
}
