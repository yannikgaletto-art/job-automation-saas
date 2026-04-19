/**
 * Cover Letter Generator — Orchestrator
 *
 * Slim orchestrator: DB fetch → Claude generation loop → Fluff scan → VUL enforcement → Return.
 * Async polish job (Inngest) writes metadata ONLY (no content overwrite — K2-Fix).
 * buildSystemPrompt() and judgeCoverLetter() are extracted to their own services.
 * Multi-Agent Pipeline: DEPRECATED (2026-04-09) — Haiku overwriting Sonnet = quality regression.
 */

import Anthropic from '@anthropic-ai/sdk';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { validateCoverLetter, logValidation } from './cover-letter-validator';
import { enrichCompany, linkEnrichmentToJob } from './company-enrichment';
import type { CoverLetterSetupContext } from '@/types/cover-letter-setup';
import type { StyleAnalysis } from './writing-style-analyzer';
import { scanForFluff } from './anti-fluff-blacklist';
import { buildSystemPrompt, type UserProfileData, type JobData, type CompanyResearchData } from './cover-letter-prompt-builder';
import { judgeCoverLetter, type JudgeResult } from './cover-letter-judge';

// ─── Clients ──────────────────────────────────────────────────────────────────
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || '' });

const supabaseAdmin = getSupabaseAdmin();

/**
 * Replace em-dashes (–/—) with semicolons, preserving quote author attribution.
 * QUALITY_CV_COVER_LETTER.md §3.
 */
function replaceEmDashes(text: string): string {
    return text.replace(/(?<!["'\u201C\u201D\u201E\u00BB»]\s*)\s*[\u2013\u2014]\s*(?![\u201C\u201D"'])/g, '; ');
}

// ─── Public Interfaces ────────────────────────────────────────────────────────
export interface CoverLetterGenerationParams {
    userId: string;
    jobId: string;
    setupContext?: CoverLetterSetupContext;
    userProfile?: UserProfileData;
    jobData?: JobData;
    companyResearch?: CompanyResearchData;
    styleAnalysis?: StyleAnalysis | null;
    fixMode?: 'full' | 'targeted';
    targetFix?: string;
    currentLetter?: string;
    generationWarnings?: string[]; // Orphan-guard + style-fallback warnings from outer function
}

export interface CoverLetterResult {
    coverLetter: string;
    judgePassed: boolean;
    judgeFailReasons: string[];
    finalValidation: {
        isValid: boolean;
        issues: string[];
    };
    iterations: number;
    iterationLog?: Array<{
        iteration: number;
        letterVersion: string;
        judgePassed: boolean;
        judgeFailReasons: string[];
        validation: { isValid: boolean; issues: string[] };
        timestamp: string;
    }>;
    costCents: number;
    fluffWarning?: boolean;
    generationWarnings?: string[]; // Orphan-guard + style-fallback warnings for UI
}

const MAX_ITERATIONS = 2; // Reduced from 3 to stay under Vercel 120s timeout (see rollback criterion in plan)

// ─── Entry Point ──────────────────────────────────────────────────────────────
export async function generateCoverLetterWithQuality(
    jobId: string,
    userId: string,
    setupContext?: CoverLetterSetupContext,
    fixMode?: 'full' | 'targeted',
    targetFix?: string,
    currentLetter?: string
): Promise<CoverLetterResult> {
    // ─── Early exit for targeted fix: skip all DB lookups ─────────────────────
    if (fixMode === 'targeted' && targetFix && currentLetter) {
        console.log(`[CoverLetterGen] Targeted fix mode — skipping DB lookups. Instruction: "${targetFix}"`);
        return fixParagraph(currentLetter, targetFix, setupContext);
    }

    console.log(`[CoverLetterGen] Fetching data for Job ${jobId}, User ${userId}...`);

    const { data: jobData, error: jobError } = await supabaseAdmin
        .from('job_queue')
        .select(`*, company_research(intel_data)`)
        .eq('id', jobId)
        .eq('user_id', userId)
        .single();

    if (jobError || !jobData) throw new Error(`Job not found: ${jobError?.message}`);

    const { data: profileData, error: profileError } = await supabaseAdmin
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();

    if (profileError || !profileData) throw new Error(`Profile not found: ${profileError?.message}`);

    // ─── Style Analysis: Route based on toneSource ─────────────────────────
    let styleAnalysis: StyleAnalysis | null = null;
    const generationWarnings: string[] = [];
    if (setupContext?.tone?.toneSource === 'custom-style' && setupContext.tone.selectedStyleDocId) {
        // Load the user-selected document's style analysis
        const { data: selectedDoc } = await supabaseAdmin
            .from('documents')
            .select('metadata')
            .eq('id', setupContext.tone.selectedStyleDocId)
            .eq('user_id', userId) // RLS defense-in-depth
            .single();

        // Orphan Guard: Doc may have been deleted since wizard selection
        if (!selectedDoc) {
            console.warn(`[CoverLetterGen] ⚠️ Orphan Guard: Doc ${setupContext.tone.selectedStyleDocId} not found (deleted?). Falling back to latest style.`);
            generationWarnings.push('Gewähltes Stil-Dokument nicht mehr vorhanden — Fallback auf letzten verfügbaren Stil.');
            // Fall through to legacy path below
        } else {
            styleAnalysis = selectedDoc?.metadata?.style_analysis ?? null;
            if (!styleAnalysis) {
                generationWarnings.push('Stilanalyse für gewähltes Dokument nicht verfügbar — Preset wird als Fallback verwendet.');
            }
        }
        console.log(`[CoverLetterGen] Using custom style from doc ${setupContext.tone.selectedStyleDocId}: ${styleAnalysis ? 'found' : 'not found'}`);
    }

    // Legacy/Fallback: latest cover letter style (if no custom style resolved)
    if (!styleAnalysis) {
        const { data: docs } = await supabaseAdmin
            .from('documents')
            .select('metadata')
            .eq('user_id', userId)
            .eq('document_type', 'cover_letter')
            .neq('origin', 'generated')
            .order('created_at', { ascending: false })
            .limit(1);
        styleAnalysis = docs?.[0]?.metadata?.style_analysis ?? null;
    }

    let research: CompanyResearchData | undefined = jobData.company_research?.[0]?.intel_data;

    // Inline enrichment fallback if company research was skipped
    if (!research || Object.keys(research).length === 0) {
        console.log(`[CoverLetterGen] No company research — triggering inline enrichment...`);
        try {
            const enrichment = await enrichCompany(
                jobData.company_slug || jobData.company_name,
                jobData.company_name,
                false,
                {
                    website: jobData.metadata?.company_url || jobData.company_website || undefined,
                    industry: jobData.field || jobData.metadata?.field || undefined,
                    description: jobData.job_description?.substring(0, 200) || undefined,
                }
            );
            await linkEnrichmentToJob(jobId, enrichment.id);
            research = { company_values: enrichment.company_values, tech_stack: enrichment.tech_stack };
            console.log(`[CoverLetterGen] Inline enrichment successful.`);
        } catch (enrichErr) {
            console.warn(`[CoverLetterGen] Inline enrichment failed. Proceeding without.`, enrichErr);
        }
    }

    if (!setupContext) {
        console.warn(`⚠️ [CoverLetterGen] No setupContext provided — generation quality will be reduced`);
    }

    return generateCoverLetter({
        userId,
        jobId,
        setupContext,
        userProfile: profileData,
        jobData,
        companyResearch: research,
        styleAnalysis,
        fixMode,
        targetFix,
        currentLetter,
        generationWarnings: generationWarnings.length > 0 ? generationWarnings : undefined,
    });
}

// ─── Targeted Fix Logic ───────────────────────────────────────────────────────
async function fixParagraph(
    currentLetter: string,
    targetFix: string,
    setupContext?: CoverLetterSetupContext
): Promise<CoverLetterResult> {
    const isEnglish = setupContext?.tone?.targetLanguage === 'en';
    const lang = isEnglish ? 'English' : 'Deutsch';
    console.log(`[CoverLetterGen] Applying instruction-based fix: "${targetFix}"`);

    // FIX: Use locale-aware instruction text so Claude doesn't anchor to German
    // when the target language is English.
    const prompt = isEnglish
        ? `You are a professional senior career advisor and expert copywriter.
Here is the applicant's currently generated cover letter:
---
${currentLetter}
---

YOUR TASK:
Revise this cover letter based on the following critique or instruction:
>> "${targetFix}" <<

RULES:
1. If the instruction refers to a specific paragraph, change only what is necessary and leave the rest intact.
2. If the instruction is global ("write more casually", "shorten everything", "make it more enthusiastic"), adapt the entire text fluidly and naturally.
3. Maintain structure and format (paragraphs separated by blank lines) unless the instruction demands otherwise.
4. RETURN ONLY THE REVISED TEXT! No introductions, no markdown (except line breaks), no comments, no explanations.
5. Target language: ${lang}`
        : `Du bist ein professioneller Senior-Karriereberater und Experte für Copywriting.
Hier ist das aktuell generierte Anschreiben eines Bewerbers:
---
${currentLetter}
---

DEINE AUFGABE:
Überarbeite dieses Anschreiben basierend auf der folgenden Kritik bzw. Anweisung:
>> "${targetFix}" <<

REGELN:
1. Wenn die Anweisung sich auf einen bestimmten Absatz bezieht, ändere nur das Nötigste und lass den Rest gleich.
2. Wenn die Anweisung global ist ("Schreibe locker", "Kürze alles", "Mach es enthusiastischer"), passe den gesamten Text fließend und natürlich an.
3. Behalte Struktur und Format (Absätze durch Leerzeilen getrennt) ungefähr bei, sofern die Anweisung nichts Gegenteiliges verlangt.
4. GIB NUR DEN ÜBERARBEITETEN TEXT ZURÜCK! Keine Einleitungen, kein Markdown (außer Zeilenumbrüche), keine Kommentare, keine Erklärungen.
5. Zielsprache: ${lang}`;

    try {
        const message = await anthropic.messages.create({
            model: 'claude-sonnet-4-5-20250929',
            max_tokens: 1500,
            temperature: 0.5,
            messages: [{ role: 'user', content: prompt }]
        });

        let fixedText = message.content[0].type === 'text' ? message.content[0].text.trim() : currentLetter;

        // WHY: Prompt-Builder injiziert [VUL]...[/VUL] Tags als Tracking-Marker.
        // Diese Tags MÜSSEN vor der Ausgabe entfernt werden.
        // Der Text INNERHALB der Tags bleibt erhalten (authentischer Bewerbungstext).
        fixedText = fixedText.replace(/\[VUL\](.*?)\[\/VUL\]/gs, '$1');
        fixedText = replaceEmDashes(fixedText);

        // 1F: Minimum quality gate for targeted fixes (validator + fluff scan, no Judge call)
        const companyName = setupContext?.companyName || 'das Unternehmen';
        const fixValidation = validateCoverLetter(fixedText, companyName);
        const fixFluff = scanForFluff(fixedText);
        const fixJudgePassed = fixValidation.isValid && !fixFluff.found;
        const fixFailReasons: string[] = [
            ...fixValidation.errors,
            ...fixFluff.matches.map(m => `Fluff-Treffer: "${m.pattern}"`),
        ];

        return {
            coverLetter: fixedText,
            judgePassed: fixJudgePassed,
            judgeFailReasons: fixFailReasons,
            finalValidation: { isValid: fixValidation.isValid, issues: [...fixValidation.errors, ...fixValidation.warnings] },
            iterations: 1,
            costCents: 2.5,
        };
    } catch (err) {
        console.error('[CoverLetterGen] Targeted fix failed:', err);
        return {
            coverLetter: currentLetter,
            judgePassed: false,
            judgeFailReasons: ['Targeted fix failed'],
            finalValidation: { isValid: false, issues: ['Targeted fix failed'] },
            iterations: 0,
            costCents: 0,
        };
    }
}

// ─── Main Generation Loop ────────────────────────────────────────────────────
async function generateCoverLetter(params: CoverLetterGenerationParams): Promise<CoverLetterResult> {
    const { userId, jobId, setupContext, userProfile, jobData, companyResearch, styleAnalysis, generationWarnings: incomingWarnings } = params;

    const companyName = jobData?.company_name || setupContext?.companyName || 'das Unternehmen';
    let coverLetter = '';
    let iteration = 0;
    let judgePassed = false;
    let judgeFailReasons: string[] = [];
    let validation: { isValid: boolean; issues: string[] } = { isValid: false, issues: [] };
    let feedback: string[] = [];
    let lastWordCount = 0;
    const iterationLog: NonNullable<CoverLetterResult['iterationLog']> = [];
    let generatedText = '';

    while (iteration < MAX_ITERATIONS) {
        console.log(`🚀 [MasterPrompt] Generation Iteration ${iteration + 1}/${MAX_ITERATIONS}...`);

        const prompt = buildSystemPrompt(
            userProfile ?? {},
            jobData ?? {},
            companyResearch ?? {},
            styleAnalysis ?? null,
            setupContext,
            feedback,
            lastWordCount
        );

        // API Key guard — mock if missing
        if (!process.env.ANTHROPIC_API_KEY) {
            console.warn('⚠️ MOCKING GENERATION (No API Key) ⚠️');
            generatedText = 'Dies ist ein generiertes Anschreiben (MOCK). API Key fehlt.';
            judgePassed = true;
            judgeFailReasons = [];
            validation = { isValid: true, issues: [] };
            break;
        }

        const message = await anthropic.messages.create({
            model: 'claude-sonnet-4-5-20250929',
            max_tokens: 2000,
            temperature: 0.7,
            system: 'You are a senior career advisor and expert cover letter writer. Output ONLY the letter body. No explanations, no markdown, no preamble.',
            messages: [{ role: 'user', content: prompt }]
        });

        generatedText = message.content[0].type === 'text' ? message.content[0].text : '';
        generatedText = generatedText.replace(/\*\*/g, '').replace(/\*/g, '').replace(/^#+\s/gm, '');
        generatedText = replaceEmDashes(generatedText);

        const words = generatedText.trim().split(/\s+/);
        lastWordCount = words.length;

        const validationResult = validateCoverLetter(generatedText, companyName);
        await logValidation(jobId, userId, iteration + 1, validationResult);

        console.log(`✅ [MasterPrompt] Validation ${iteration + 1}: ${validationResult.isValid ? 'PASSED' : 'FAILED'} (${validationResult.errors.length} errors)`);

        let judgment: JudgeResult;
        if (validationResult.isValid) {
            judgment = await judgeCoverLetter(generatedText, jobData ?? {}, setupContext, styleAnalysis ?? null);
            judgePassed = judgment.pass;
            judgeFailReasons = judgment.failReasons;
            validation = { isValid: true, issues: [...judgment.failReasons, ...judgment.weaknesses] };
        } else {
            judgment = { pass: false, failReasons: [], weaknesses: [] };
            judgePassed = false;
            judgeFailReasons = validationResult.errors;
            validation = { isValid: false, issues: validationResult.errors };
            console.log(`❌ Iteration ${iteration + 1}: Validation failed, skipping judge`);
        }

        iterationLog.push({
            iteration: iteration + 1,
            letterVersion: generatedText,
            judgePassed,
            judgeFailReasons,
            validation,
            timestamp: new Date().toISOString()
        });

        if (validationResult.isValid && judgePassed) {
            coverLetter = generatedText;
            console.log(`✅ Quality target reached (Judge: PASS)`);
            break;
        }

        feedback = [];
        if (!validationResult.isValid) {
            feedback.push(...validationResult.errors.map(e => `VALIDATION ERROR: ${e}`));
        }
        if (validationResult.warnings.length > 0) {
            feedback.push(...validationResult.warnings.map(w => `WARNING: ${w}`));
        }
        if (judgment.failReasons.length > 0) {
            feedback.push(...judgment.failReasons.map(r => `JUDGE FAIL: ${r}`));
        }
        if (judgment.weaknesses.length > 0) {
            feedback.push(...judgment.weaknesses.map(w => `QUALITÄT: ${w}`));
        }

        // R1: Fluff-Feedback injected into iteration loop (moved from async Inngest)
        // Runs BEFORE the next generation so Claude can correct in-place.
        const iterFluff = scanForFluff(generatedText);
        if (iterFluff.found) {
            for (const m of iterFluff.matches) {
                const msg = m.feedback ?? `Entferne die Phrase "${m.pattern}" — ${m.reason}`;
                feedback.push(`FLUFF: ${msg}`);
            }
            console.warn(`⚠️ [Anti-Fluff] ${iterFluff.matches.length} pattern(s) found in iteration ${iteration + 1} — injecting feedback`);
        }

        // §Fix Defect #2 (position-corrected): Author check AFTER feedback reset so hint survives into next iteration
        const selectedAuthor = setupContext?.selectedQuote?.author;
        if (selectedAuthor && !generatedText.includes(selectedAuthor)) {
            feedback.push(`QUOTE_AUTHOR_MISSING: Das Zitat-Autor "${selectedAuthor}" fehlt im generierten Text. Das Zitat MUSS IMMER mit der Signatur "– ${selectedAuthor}" unter dem Zitat formatiert werden. Füge die Autor-Signatur hinzu.`);
            console.warn(`⚠️ [MasterPrompt] Quote author "${selectedAuthor}" not found — adding to feedback for next iteration`);
        }

        iteration++;

        if (iteration === MAX_ITERATIONS) {
            console.warn('⚠️ Max iterations reached. Picking best valid version.');
            const validAttempts = iterationLog.filter(log => log.validation.isValid);
            if (validAttempts.length > 0) {
                // Prefer passed attempts, otherwise take the last valid one
                const passedAttempts = validAttempts.filter(log => log.judgePassed);
                const best = passedAttempts.length > 0
                    ? passedAttempts[passedAttempts.length - 1]
                    : validAttempts[validAttempts.length - 1];
                coverLetter = best.letterVersion;
                judgePassed = best.judgePassed;
                judgeFailReasons = best.judgeFailReasons;
                validation = best.validation;
                console.log(`✅ Best-of-N: Iteration ${best.iteration} (Judge: ${judgePassed ? 'PASS' : 'FAIL'})`);
            } else {
                console.error(`❌ No valid cover letter after ${MAX_ITERATIONS} iterations — returning last attempt.`);
                coverLetter = generatedText;
            }
        }
    }

    // ─── Post-Generation Fluff Scan (final audit, fluff was also checked in-loop) ──
    const fluffScan = scanForFluff(coverLetter);
    const fluffWarning = fluffScan.found;
    if (fluffWarning) {
        console.warn(`⚠️ [Anti-Fluff] ${fluffScan.matches.length} patterns survived ${MAX_ITERATIONS} iterations`);
    }

    // ─── VUL-Tag Stripper (UNCONDITIONAL — always strip before output) ──────
    // WHY: Prompt-Builder injiziert [VUL]...[/VUL] Tags als Tracking-Marker.
    // Diese Tags MÜSSEN vor der Ausgabe entfernt werden.
    // Der Text INNERHALB der Tags bleibt erhalten (authentischer Bewerbungstext).
    // CONFLICTS RESOLVED: VUL-Tag Leak (Blind Spot #2, QA Report 2026-02-28)
    if (coverLetter.includes('[VUL]')) {
        const vulMatches = coverLetter.match(/\[VUL\][\s\S]*?\[\/VUL\]/g) || [];
        console.log(`[VUL-Check] Found ${vulMatches.length} vulnerability tags — stripping all`);

        if (setupContext?.optInModules?.vulnerabilityInjector && vulMatches.length > 2) {
            console.warn(`⚠️ [VUL-Check] ${vulMatches.length} > 2 — removing excess before stripping`);
            let vulCount = 0;
            coverLetter = coverLetter.replace(/\[VUL\][\s\S]*?\[\/VUL\]/g, (match) => {
                vulCount++;
                if (vulCount > 2) return '';
                return match;
            });
        }

        coverLetter = coverLetter.replace(/\[VUL\](.*?)\[\/VUL\]/gs, '$1');
        coverLetter = coverLetter.replace(/\n{3,}/g, '\n\n').trim();
    }

    // Cost tracking (sync-only costs — pipeline costs tracked in Inngest polish job)
    const judgeCallCount = iterationLog.filter(l => l.validation.isValid).length;
    const costCents = iterationLog.length * 2.5 + judgeCallCount * 0.3;

    return {
        coverLetter,
        judgePassed,
        judgeFailReasons,
        finalValidation: validation,
        iterations: iterationLog.length,
        iterationLog,
        costCents,
        fluffWarning,
        generationWarnings: (incomingWarnings?.length ?? 0) > 0 ? incomingWarnings : undefined,
    };
}
