import { complete } from '@/lib/ai/model-router';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Generate cover letter in USER'S writing style (not generic!)
 *
 * This respects the existing Writing Style Analysis architecture:
 * 1. Fetch user's uploaded cover letters
 * 2. Extract style characteristics (tone, sentence length, conjunctions)
 * 3. Generate new letter that mimics user's style
 */
export async function generateCoverLetter(
    userId: string,
    jobId: string
) {
    // ============================================================================
    // STEP 1: Fetch job with company enrichment
    // ============================================================================

    const { data: job } = await supabase
        .from('job_queue')
        .select('*, company_research(*)')
        .eq('id', jobId)
        .single();

    if (!job) {
        throw new Error(`Job ${jobId} not found`);
    }

    // ============================================================================
    // STEP 2: Fetch user's writing style from uploaded cover letters
    // ============================================================================

    const { data: userDocs } = await supabase
        .from('documents')
        .select('content, style_analysis')
        .eq('user_id', userId)
        .eq('document_type', 'cover_letter')
        .limit(2);

    if (!userDocs || userDocs.length === 0) {
        throw new Error(
            'No user cover letters found. User must upload examples first.'
        );
    }

    // Extract style reference (first 500 chars as example)
    const styleExample = (userDocs[0].content || '').slice(0, 500);
    const styleAnalysis = userDocs[0].style_analysis || {};

    console.log(
        `📝 User style: ${styleAnalysis.tone || 'unknown'}, ${styleAnalysis.sentence_length || 'unknown'} sentences`
    );

    // ============================================================================
    // STEP 3: Build enrichment context (if available)
    // ============================================================================

    const companyResearch = job.company_research;
    const enrichmentContext = companyResearch
        ? `
FIRMEN-INTELLIGENCE (nutze für Personalisierung):
${companyResearch.recent_news?.length > 0 ? `- Aktuelle News: "${companyResearch.recent_news[0]}"` : ''}
${companyResearch.company_values?.length > 0 ? `- Firmenwerte: ${companyResearch.company_values.join(', ')}` : ''}
${companyResearch.tech_stack?.length > 0 ? `- Tech Stack: ${companyResearch.tech_stack.join(', ')}` : ''}
`
        : `
FIRMEN-INTELLIGENCE: Keine öffentlichen Daten verfügbar (Stealth Startup).
→ Nutze generische aber professionelle Eröffnung: "Sehr geehrte Damen und Herren"
`;

    // ============================================================================
    // STEP 4: Generate in USER'S style using Model Router
    // ============================================================================

    const result = await complete({
        taskType: 'write_cover_letter',
        prompt: `Schreibe ein Anschreiben im EXAKTEN Stil des Nutzers.

POSITION: ${job.title}
FIRMA: ${job.company_name}

═══════════════════════════════════════════════════════════════
NUTZER SCHREIBSTIL (analysiert aus hochgeladenen Anschreiben):
═══════════════════════════════════════════════════════════════
Ton: ${styleAnalysis.tone || 'professional'}
Satzlänge: ${styleAnalysis.sentence_length || 'medium'}
Lieblings-Konjunktionen: ${styleAnalysis.conjunctions?.join(', ') || 'durch, deshalb, daher'}
Anrede: ${styleAnalysis.greeting || 'Sehr geehrte Damen und Herren'}

BEISPIEL vom Nutzer (imitiere GENAU diesen Stil):
"""
${styleExample}
"""

═══════════════════════════════════════════════════════════════
${enrichmentContext}
═══════════════════════════════════════════════════════════════

JOB BESCHREIBUNG:
${job.description}

═══════════════════════════════════════════════════════════════
ANFORDERUNGEN:
═══════════════════════════════════════════════════════════════
1. Schreibe im GLEICHEN Ton wie das Beispiel (nicht formeller, nicht lockerer)
2. Nutze die GLEICHEN Satzstrukturen und Konjunktionen wie der Nutzer
3. Wenn Firmen-Intelligence vorhanden: Erwähne EIN spezifisches Detail natürlich im ersten Absatz
4. Wenn keine Intel: Nutze "Sehr geehrte Damen und Herren" und fokussiere auf Skills
5. Bleib authentisch - als hätte der Nutzer es SELBST geschrieben
6. NIEMALS erwähnen: "auf LinkedIn gefunden", "recherchiert", "laut meiner Analyse"
7. Länge: 3-4 Absätze (~250-300 Wörter)

KRITISCH: Das Anschreiben muss sich anfühlen wie vom Nutzer selbst - NICHT wie ein Bot oder Karriereberater!`,

        systemPrompt: `Du bist ein Writing Style Mimic, kein Karriereberater.

Deine EINZIGE Aufgabe: Analysiere den Schreibstil des Nutzers und imitiere ihn perfekt.

ANALYSE-SCHRITTE:
1. Satzlänge: Wie lang sind die Sätze im Beispiel? (kurz/mittel/lang)
2. Pronomen: Nutzt der User "ich" oder "meine Person"?
3. Formalität: Wie förmlich ist die Sprache? (sehr formal / professionell / locker)
4. Konjunktionen: Welche Übergangswörter? ("durch", "deshalb", "daher", "somit")
5. Struktur: Wie baut der User Argumente auf?

DANN: Schreibe das neue Anschreiben EXAKT so.

VERBOTEN:
- Formeller oder lockerer als das Beispiel
- Karriereberater-Phrasen wie "Als erfahrener Professional..."
- Bot-Sprache wie "Ich freue mich auf die Gelegenheit..."
- Erwähnung von Research ("auf LinkedIn", "in meiner Recherche")

ERLAUBT:
- Konjunktionen aus dem Beispiel kopieren
- Satzlänge aus dem Beispiel übernehmen
- Firmen-Intel subtil einbauen (falls vorhanden)
- Authentisch wie der User selbst klingen`,

        temperature: 0.8, // Etwas Kreativität, aber kontrolliert
    });

    console.log(
        `✅ Cover Letter generated: €${(result.costCents / 100).toFixed(4)}, ${result.tokensUsed} tokens`
    );

    return {
        coverLetter: result.text,
        costCents: result.costCents,
        model: result.model,
        tokensUsed: result.tokensUsed,
    };
}
