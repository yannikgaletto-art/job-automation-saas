import { complete } from '@/lib/ai/model-router';
import { createClient } from '@supabase/supabase-js';
import { judgeQuality, QualityScores } from './quality-judge';
import { validateCoverLetter, logValidation, ValidationResult } from './cover-letter-validator';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface GenerationContext {
    job: any;
    userDocs: any[];
    cvMetadata: any;
    styleExample: string;
    styleAnalysis: any;
    enrichmentContext: string;
}

/**
 * Fetch all necessary context for generation
 */
async function fetchGenerationContext(userId: string, jobId: string): Promise<GenerationContext> {
    // 1. Fetch Job
    const { data: job } = await supabase
        .from('job_queue')
        .select('*, company_research(*)')
        .eq('id', jobId)
        .single();

    if (!job) throw new Error(`Job ${jobId} not found`);

    // 2. Fetch User Cover Letters (Style)
    // FIX: Select only available columns (metadata)
    const { data: userDocs } = await supabase
        .from('documents')
        .select('metadata')
        .eq('user_id', userId)
        .eq('document_type', 'cover_letter')
        .limit(2);

    if (!userDocs || userDocs.length === 0) {
        throw new Error('No user cover letters found. User must upload examples first.');
    }

    // 3. Fetch CV (Skills/Experience)
    const { data: cvDocs } = await supabase
        .from('documents')
        .select('metadata')
        .eq('user_id', userId)
        .eq('document_type', 'cv')
        .limit(1);

    const cvMetadata = cvDocs?.[0]?.metadata || {};

    // FIX: Extract style from metadata
    const docMeta = userDocs[0].metadata || {};
    const styleExample = (docMeta.content_snippet || 'No example available').slice(0, 500);
    const styleAnalysis = docMeta.style_analysis || {};

    // 4. Build Enrichment Context
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

    return { job, userDocs, cvMetadata, styleExample, styleAnalysis, enrichmentContext };
}

/**
 * Core generation logic
 */
async function generateCoverLetterCore(context: GenerationContext, additionalInstructions: string = '') {
    const { job, cvMetadata, styleExample, styleAnalysis, enrichmentContext } = context;

    const skills = cvMetadata.skills ? `SKILLS: ${Array.isArray(cvMetadata.skills) ? cvMetadata.skills.join(', ') : cvMetadata.skills}` : '';
    const experience = cvMetadata.experience ? `ERFAHRUNG: ${cvMetadata.experience}` : '';

    const instructionBlock = additionalInstructions ? `
═══════════════════════════════════════════════════════════════
ZUSÄTZLICHE ANWEISUNGEN (Feedback aus vorheriger Iteration):
${additionalInstructions}
═══════════════════════════════════════════════════════════════
` : '';

    const result = await complete({
        taskType: 'write_cover_letter',
        prompt: `Schreibe ein Anschreiben im EXAKTEN Stil des Nutzers.

POSITION: ${job.title}
FIRMA: ${job.company}

═══════════════════════════════════════════════════════════════
NUTZER PROFILDATEN:
${skills}
${experience}
═══════════════════════════════════════════════════════════════

═══════════════════════════════════════════════════════════════
NUTZER SCHREIBSTIL (analysiert aus hochgeladenen Anschreiben):
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

${instructionBlock}

JOB BESCHREIBUNG:
${job.description}

═══════════════════════════════════════════════════════════════
ANFORDERUNGEN:
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
VERBOTEN:
- Formeller oder lockerer als das Beispiel
- Karriereberater-Phrasen wie "Als erfahrener Professional..."
- Bot-Sprache wie "Ich freue mich auf die Gelegenheit..."
ERLAUBT:
- Konjunktionen aus dem Beispiel kopieren
- Firmen-Intel subtil einbauen
- Authentisch wie der User selbst klingen`,
        temperature: 0.8,
    });

    console.log(
        `✅ Cover Letter generated: €${(result.costCents / 100).toFixed(4)}, ${result.tokensUsed} tokens`
    );

    return result;
}

/**
 * Single-shot generation (Legacy / Fast)
 */
export async function generateCoverLetter(userId: string, jobId: string) {
    const context = await fetchGenerationContext(userId, jobId);
    const result = await generateCoverLetterCore(context);
    return {
        coverLetter: result.text,
        costCents: result.costCents,
        model: result.model,
        tokensUsed: result.tokensUsed,
    };
}

/**
 * Iterative generation with Validation + Quality Judge Loop (Max 3 iterations)
 */
export async function generateCoverLetterWithQuality(
    jobId: string,
    userId: string
): Promise<{
    coverLetter: string;
    finalScores: QualityScores;
    finalValidation: ValidationResult;
    iterations: number;
    iterationLog: Array<{
        iteration: number;
        validation: ValidationResult;
        scores: QualityScores;
        letterVersion: string;
    }>;
}> {
    const MAX_ITERATIONS = 3;
    const TARGET_SCORE = 8;

    // 1. Fetch Context once
    const context = await fetchGenerationContext(userId, jobId);

    let coverLetter = "";
    let scores: QualityScores | null = null;
    let validation: ValidationResult | null = null;
    let iterationLog: any[] = [];

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
        // STAGE 1: Build feedback prompt
        let feedbackPrompt = "";
        
        // Add validation feedback from previous iteration
        if (iteration > 0 && validation && !validation.isValid) {
            feedbackPrompt += `\n\n**VALIDATION ERRORS (KRITISCH - MUSS BEHOBEN WERDEN!):**\n${validation.errors.join('\n')}`;
        }
        
        // Add quality feedback from previous iteration
        if (iteration > 0 && scores) {
            feedbackPrompt += `\n\n**QUALITY FEEDBACK:**\n${scores.issues.slice(0, 3).join('\n')}`;
            feedbackPrompt += `\n\n**SUGGESTIONS:**\n${scores.suggestions.slice(0, 3).join('\n')}`;
        }

        // STAGE 2: Generate
        const result = await generateCoverLetterCore(context, feedbackPrompt);
        coverLetter = result.text;

        // STAGE 3: VALIDATE (before expensive Judge call)
        validation = validateCoverLetter(coverLetter, context.job.company);
        
        // Log validation
        await logValidation(jobId, userId, iteration + 1, validation);
        
        console.log(`\n✅ Iteration ${iteration + 1} Validation: ${validation.isValid ? 'PASSED' : 'FAILED'}`);
        console.log(`   - Errors: ${validation.errors.length}`);
        console.log(`   - Warnings: ${validation.warnings.length}`);
        console.log(`   - Stats: ${validation.stats.wordCount} words, ${validation.stats.companyMentions}x company mention`);

        // STAGE 4: JUDGE (only if validation passed)
        if (validation.isValid) {
            const companyValues = context.job.company_research?.company_values || [];
            scores = await judgeQuality(
                coverLetter,
                context.styleExample,
                companyValues,
                context.job.description || ""
            );

            console.log(`📊 Iteration ${iteration + 1} Quality Score: ${scores.overall_score}/10`);
        } else {
            // Skip judge call if validation failed (saves API costs!)
            scores = {
                overall_score: 0,
                naturalness_score: 0,
                style_match_score: 0,
                company_relevance_score: 0,
                individuality_score: 0,
                issues: ["Validation failed - skipped quality check"],
                suggestions: ["Fix validation errors first"]
            };
            
            console.log(`❌ Iteration ${iteration + 1}: Validation failed, skipping quality judge (cost saved!)`);
        }

        // STAGE 5: Log iteration
        iterationLog.push({
            iteration: iteration + 1,
            validation: validation,
            scores: scores,
            letterVersion: coverLetter
        });

        // Log to DB
        try {
            await supabase.from("generation_logs").insert({
                job_id: jobId,
                user_id: userId,
                iteration: iteration + 1,
                model_name: result.model,
                overall_score: scores.overall_score,
                naturalness_score: scores.naturalness_score,
                style_match_score: scores.style_match_score,
                company_relevance_score: scores.company_relevance_score,
                individuality_score: scores.individuality_score,
                issues: scores.issues,
                suggestions: scores.suggestions,
                generated_text: coverLetter,
                validation_passed: validation.isValid,
                word_count: validation.stats.wordCount
            });
        } catch (e) {
            console.error("Failed to log generation:", e);
        }

        // STAGE 6: Check success condition
        if (validation.isValid && scores.overall_score >= TARGET_SCORE) {
            console.log(`✅ Quality target reached! (Validation: PASSED, Score: ${scores.overall_score}/10)`);
            break;
        }

        // STAGE 7: Pick best if max iterations reached
        if (iteration === MAX_ITERATIONS - 1) {
            console.warn(`⚠️ Max iterations reached. Picking best valid version.`);
            
            // Pick best valid version (or best score if no valid version)
            const validAttempts = iterationLog.filter(log => log.validation.isValid);
            
            if (validAttempts.length > 0) {
                const bestAttempt = validAttempts.reduce((best, current) =>
                    current.scores.overall_score > best.scores.overall_score ? current : best
                );
                coverLetter = bestAttempt.letterVersion;
                scores = bestAttempt.scores;
                validation = bestAttempt.validation;
                console.log(`✅ Picked best valid attempt: Iteration ${bestAttempt.iteration} (Score: ${scores.overall_score}/10)`);
            } else {
                // No valid version found - return last attempt with warning
                console.error("❌ WARNING: No valid cover letter generated after 3 iterations!");
                console.error("   Returning last attempt despite validation failure.");
            }
        }
    }

    return {
        coverLetter,
        finalScores: scores!,
        finalValidation: validation!,
        iterations: iterationLog.length,
        iterationLog
    };
}
