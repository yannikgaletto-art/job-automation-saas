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
        };

        if (!body.coverLetter || body.coverLetter.trim().length === 0) {
            return NextResponse.json(
                { success: false, error: 'Missing or empty coverLetter' },
                { status: 400 }
            );
        }

        if (!body.companyName || body.companyName.trim().length === 0) {
            return NextResponse.json(
                { success: false, error: 'Missing or empty companyName' },
                { status: 400 }
            );
        }

        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
            console.warn('⚠️ [Critique] No ANTHROPIC_API_KEY — returning null');
            return NextResponse.json({ success: true, critique: null });
        }

        const anthropic = new Anthropic({ apiKey });

        const jobTitle = body.jobTitle || 'die ausgeschriebene Stelle';
        const companyName = body.companyName;

        const prompt = `Du bist ein skeptischer, erfahrener Hiring Manager bei ${companyName} für die Rolle "${jobTitle}".

Lies dieses Anschreiben eines Kandidaten:
---
${body.coverLetter}
---

DEINE AUFGABE:
Formuliere GENAU EINE konstruktive, spezifische Kritik als Hiring Manager.

REGELN:
- Die Kritik muss sich auf eine KONKRETE LÜCKE beziehen (fehlende Zahlen, unklare Teamgröße, vage Ergebnisse, fehlende Zeiträume, etc.)
- KEINE generischen Kommentare wie "könnte besser sein" oder "mehr Details"
- Formuliere die Kritik als direkte Rede des Hiring Managers (Ich-Perspektive)
- Gib einen konkreten Verbesserungsvorschlag

Antworte NUR als valides JSON:
{
  "persona": "Skeptischer HR-Chef",
  "role": "Head of People @ ${companyName}",
  "critique": "Der Teil über [X] ist gut, aber als HR-Chef frage ich mich: [konkrete Frage]. Das fehlt mir, um [konkretes Ziel].",
  "fixSuggestion": "Erwähne [konkretes Detail] bei der Station [X]"
}`;

        console.log('🎭 [Critique] Generating hiring manager critique via Haiku...');

        const message = await anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 300,
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
