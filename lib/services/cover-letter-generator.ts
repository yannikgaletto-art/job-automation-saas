/**
 * Cover Letter Generator — Orchestrator
 *
 * Slim orchestrator: DB fetch → Claude generation loop → Fluff scan → VUL enforcement → Pipeline → Return.
 * buildSystemPrompt() and judgeCoverLetter() are extracted to their own services.
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { validateCoverLetter, logValidation } from './cover-letter-validator';
import { enrichCompany, linkEnrichmentToJob } from './company-enrichment';
import type { CoverLetterSetupContext } from '@/types/cover-letter-setup';
import type { StyleAnalysis } from './writing-style-analyzer';
import { scanForFluff } from './anti-fluff-blacklist';
import { runMultiAgentPipeline } from './multi-agent-pipeline';
import { buildSystemPrompt, type UserProfileData, type JobData, type CompanyResearchData } from './cover-letter-prompt-builder';
import { judgeCoverLetter, type JudgeResult } from './cover-letter-judge';
import type { SentenceAnnotation } from '@/types/cover-letter-setup';
import type { HiringPersona } from './hiring-manager-resolver';

// ─── Clients ──────────────────────────────────────────────────────────────────
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || '' });

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
}

export interface CoverLetterResult {
    coverLetter: string;
    finalScores: {
        naturalness: number;
        style_match: number;
        company_relevance: number;
        individuality: number;
        overall_score: number;
    };
    finalValidation: {
        isValid: boolean;
        issues: string[];
    };
    iterations: number;
    iterationLog?: Array<{
        iteration: number;
        letterVersion: string;
        scores: JudgeResult['scores'];
        validation: { isValid: boolean; issues: string[] };
        timestamp: string;
    }>;
    costCents: number;
    fluffWarning?: boolean;
    pipelineWarnings?: string[];
    pipelineImproved?: boolean;
    // TODO Batch 4: Persist xray_annotations in draft metadata
    annotatedSentences?: SentenceAnnotation[];  // B3.1: Only in live response, not persisted
    hiringPersonas?: HiringPersona[];           // B3.2: Available personas for frontend panel
}

const MAX_ITERATIONS = 3;

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
        .select(`*, company_research(intel_data, suggested_quotes)`)
        .eq('id', jobId)
        .single();

    if (jobError || !jobData) throw new Error(`Job not found: ${jobError?.message}`);

    const { data: profileData, error: profileError } = await supabaseAdmin
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();

    if (profileError || !profileData) throw new Error(`Profile not found: ${profileError?.message}`);

    const { data: docs } = await supabaseAdmin
        .from('documents')
        .select('metadata')
        .eq('user_id', userId)
        .eq('document_type', 'cover_letter')
        .order('created_at', { ascending: false })
        .limit(1);

    const styleAnalysis: StyleAnalysis | null = docs?.[0]?.metadata?.style_analysis ?? null;

    let research: CompanyResearchData | undefined = jobData.company_research?.[0]?.intel_data;

    // Inline enrichment fallback if company research was skipped
    if (!research || Object.keys(research).length === 0) {
        console.log(`[CoverLetterGen] No company research — triggering inline enrichment...`);
        try {
            const enrichment = await enrichCompany(
                jobData.company_slug || jobData.company_name,
                jobData.company_name,
                false
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
    });
}

// ─── Targeted Fix Logic ───────────────────────────────────────────────────────
async function fixParagraph(
    currentLetter: string,
    targetFix: string,
    setupContext?: CoverLetterSetupContext
): Promise<CoverLetterResult> {
    const lang = setupContext?.tone?.targetLanguage === 'en' ? 'English' : 'Deutsch';
    console.log(`[CoverLetterGen] Applying instruction-based fix: "${targetFix}"`);

    const prompt = `Du bist ein professioneller Senior-Karriereberater und Experte für Copywriting.
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
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: 1500,
            temperature: 0.5,
            messages: [{ role: 'user', content: prompt }]
        });

        const fixedText = message.content[0].type === 'text' ? message.content[0].text.trim() : currentLetter;

        return {
            coverLetter: fixedText,
            finalScores: { naturalness: 0, style_match: 0, company_relevance: 0, individuality: 0, overall_score: 0 },
            finalValidation: { isValid: true, issues: [] },
            iterations: 1,
            costCents: 2.5,
        };
    } catch (err) {
        console.error('[CoverLetterGen] Targeted fix failed:', err);
        return {
            coverLetter: currentLetter,
            finalScores: { naturalness: 0, style_match: 0, company_relevance: 0, individuality: 0, overall_score: 0 },
            finalValidation: { isValid: false, issues: ['Targeted fix failed'] },
            iterations: 0,
            costCents: 0,
        };
    }
}

// ─── Main Generation Loop ────────────────────────────────────────────────────
async function generateCoverLetter(params: CoverLetterGenerationParams): Promise<CoverLetterResult> {
    const { userId, jobId, setupContext, userProfile, jobData, companyResearch, styleAnalysis } = params;

    const companyName = jobData?.company_name || setupContext?.companyName || 'das Unternehmen';
    let coverLetter = '';
    let iteration = 0;
    let scores: JudgeResult['scores'] = { naturalness: 0, style_match: 0, company_relevance: 0, individuality: 0, overall_score: 0 };
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
            scores = { naturalness: 5, style_match: 5, company_relevance: 5, individuality: 5, overall_score: 5 };
            validation = { isValid: true, issues: [] };
            break;
        }

        const message = await anthropic.messages.create({
            model: 'claude-sonnet-4-5',
            max_tokens: 2000,
            temperature: 0.7,
            system: 'You are a senior career advisor and expert cover letter writer. Output ONLY the letter body. No explanations, no markdown, no preamble.',
            messages: [{ role: 'user', content: prompt }]
        });

        generatedText = message.content[0].type === 'text' ? message.content[0].text : '';
        generatedText = generatedText.replace(/\*\*/g, '').replace(/\*/g, '').replace(/^#+\s/gm, '');

        const words = generatedText.trim().split(/\s+/);
        lastWordCount = words.length;

        const validationResult = validateCoverLetter(generatedText, companyName);
        await logValidation(jobId, userId, iteration + 1, validationResult);

        console.log(`✅ [MasterPrompt] Validation ${iteration + 1}: ${validationResult.isValid ? 'PASSED' : 'FAILED'} (${validationResult.errors.length} errors)`);

        let judgment: JudgeResult;
        if (validationResult.isValid) {
            judgment = await judgeCoverLetter(generatedText, jobData ?? {}, setupContext, styleAnalysis ?? null);
            scores = judgment.scores;
            validation = { isValid: true, issues: judgment.weaknesses };
        } else {
            judgment = { scores: { naturalness: 0, style_match: 0, company_relevance: 0, individuality: 0, overall_score: 0 }, weaknesses: [] };
            scores = judgment.scores;
            validation = { isValid: false, issues: validationResult.errors };
            console.log(`❌ Iteration ${iteration + 1}: Validation failed, skipping judge`);
        }

        iterationLog.push({
            iteration: iteration + 1,
            letterVersion: generatedText,
            scores,
            validation,
            timestamp: new Date().toISOString()
        });

        if (validationResult.isValid && scores.overall_score >= 8.0) {
            coverLetter = generatedText;
            console.log(`✅ Quality target reached! Score: ${scores.overall_score}/10`);
            break;
        }

        feedback = [];
        if (!validationResult.isValid) {
            feedback.push(...validationResult.errors.map(e => `VALIDATION ERROR: ${e}`));
        }
        if (validationResult.warnings.length > 0) {
            feedback.push(...validationResult.warnings.map(w => `WARNING: ${w}`));
        }
        if (judgment.weaknesses.length > 0) {
            feedback.push(...judgment.weaknesses.map(w => `QUALITÄT: ${w}`));
        }

        iteration++;

        if (iteration === MAX_ITERATIONS) {
            console.warn('⚠️ Max iterations reached. Picking best valid version.');
            const validAttempts = iterationLog.filter(log => log.validation.isValid);
            if (validAttempts.length > 0) {
                const best = validAttempts.reduce((a, b) =>
                    b.scores.overall_score > a.scores.overall_score ? b : a
                );
                coverLetter = best.letterVersion;
                scores = best.scores;
                validation = best.validation;
                console.log(`✅ Best-of-N: Iteration ${best.iteration} (Score: ${scores.overall_score}/10)`);
            } else {
                console.error('❌ No valid cover letter after 3 iterations — returning last attempt.');
                coverLetter = generatedText;
            }
        }
    }

    // ─── Post-Generation Fluff Scan (B1.2) ───────────────────────────────
    let fluffWarning = false;
    const MAX_FLUFF_RETRIES = 2;
    let fluffRetries = 0;

    const fluffScan = scanForFluff(coverLetter);
    if (fluffScan.found && coverLetter.length > 0) {
        console.warn(`⚠️ [Anti-Fluff] ${fluffScan.matches.length} patterns found. Starting re-gen loop (max ${MAX_FLUFF_RETRIES})...`);

        while (fluffRetries < MAX_FLUFF_RETRIES) {
            fluffRetries++;
            console.log(`🛠️ [Anti-Fluff] Re-gen attempt ${fluffRetries}/${MAX_FLUFF_RETRIES}...`);

            const fluffFeedback = fluffScan.matches.map(m => `BLACKLIST-TREFFER: "${m.pattern}" — Ersetze durch konkrete, belegbare Aussage aus dem User-Profil.`);

            const fixPrompt = `Du bist ein Senior-Karriereberater. Das folgende Anschreiben enthält generische KI-Phrasen die erkannt wurden.

AKTUELLES ANSCHREIBEN:
---
${coverLetter}
---

ERKANNTE PROBLEME:
${fluffFeedback.join('\n')}

AUFGABE: Ersetze ALLE markierten Passagen durch konkrete, belegbare Aussagen. Behalte Struktur und Länge bei.
GIB NUR DEN ÜBERARBEITETEN TEXT ZURÜCK! Keine Einleitungen, kein Markdown, keine Kommentare.`;

            try {
                const fixMessage = await anthropic.messages.create({
                    model: 'claude-sonnet-4-5',
                    max_tokens: 2000,
                    temperature: 0.5,
                    messages: [{ role: 'user', content: fixPrompt }]
                });

                const fixedText = fixMessage.content[0].type === 'text' ? fixMessage.content[0].text.trim() : coverLetter;
                const reScan = scanForFluff(fixedText);

                if (!reScan.found) {
                    console.log(`✅ [Anti-Fluff] Clean after ${fluffRetries} re-gen(s).`);
                    coverLetter = fixedText;
                    break;
                } else {
                    coverLetter = fixedText;
                    if (fluffRetries >= MAX_FLUFF_RETRIES) {
                        console.warn(`⚠️ [Anti-Fluff] Max retries reached. ${reScan.matches.length} patterns remain. Setting fluffWarning.`);
                        fluffWarning = true;
                    }
                }
            } catch (fluffErr) {
                console.error('❌ [Anti-Fluff] Re-gen failed:', fluffErr);
                fluffWarning = true;
                break;
            }
        }
    }

    // ─── B2.2: VUL-Tag Enforcement (Vulnerability Injector Post-Gen) ───────
    if (setupContext?.optInModules?.vulnerabilityInjector && coverLetter.includes('[VUL]')) {
        const vulMatches = coverLetter.match(/\[VUL\][\s\S]*?\[\/VUL\]/g) || [];
        console.log(`[VUL-Check] Found ${vulMatches.length} vulnerability tags`);

        if (vulMatches.length > 2) {
            console.warn(`⚠️ [VUL-Check] ${vulMatches.length} > 2 — removing excess`);
            let vulCount = 0;
            coverLetter = coverLetter.replace(/\[VUL\][\s\S]*?\[\/VUL\]/g, (match) => {
                vulCount++;
                if (vulCount > 2) return '';
                return match;
            });
        }

        coverLetter = coverLetter.replace(/\[VUL\]/g, '').replace(/\[\/VUL\]/g, '');
        coverLetter = coverLetter.replace(/\n{3,}/g, '\n\n').trim();
    }

    // ─── B2.1: Multi-Agent Pipeline (after Fluff + VUL, before return) ───────
    let pipelineWarnings: string[] | undefined;
    let pipelineImproved = false;

    if (coverLetter.length > 0 && process.env.ANTHROPIC_API_KEY) {
        try {
            const pipelineResult = await runMultiAgentPipeline(
                coverLetter,
                jobData,
                companyResearch
            );
            coverLetter = pipelineResult.finalText;
            pipelineImproved = pipelineResult.pipelineImproved;
            if (pipelineResult.pipelineWarnings.length > 0) {
                pipelineWarnings = pipelineResult.pipelineWarnings;
            }
        } catch (pipelineErr) {
            console.error('❌ [Pipeline] Multi-agent pipeline failed entirely:', pipelineErr);
            pipelineWarnings = ['Multi-Agent-Pipeline komplett fehlgeschlagen. Original-Text wird beibehalten.'];
        }
    }

    // ─── B3.1: X-Ray Annotations (after pipeline, before return) ─────────
    // Correction #2: Separate Haiku call outside generation loop
    // TODO Batch 4: Persist xray_annotations in draft metadata
    let annotatedSentences: SentenceAnnotation[] | undefined;
    if (setupContext?.xRayMode && coverLetter.length > 0) {
        try {
            annotatedSentences = await generateXRayAnnotations(coverLetter, setupContext);
            console.log(`✅ [X-Ray] Generated ${annotatedSentences?.length ?? 0} annotations`);
        } catch (xrayErr) {
            console.warn('⚠️ [X-Ray] Annotation generation failed — returning without annotations:', xrayErr);
            annotatedSentences = undefined;
        }
    }

    // Cost tracking
    const judgeCallCount = iterationLog.filter(l => l.validation.isValid).length;
    const gptCost = process.env.OPENAI_API_KEY ? 0.5 : 0;
    const perplexityCost = process.env.PERPLEXITY_API_KEY ? 0.3 : 0;
    const xrayCost = setupContext?.xRayMode ? 0.1 : 0; // Haiku ~$0.001
    const costCents = iterationLog.length * 2.5 + judgeCallCount * 0.3 + fluffRetries * 2.5 + gptCost + perplexityCost + xrayCost;

    return {
        coverLetter,
        finalScores: scores,
        finalValidation: validation,
        iterations: iterationLog.length,
        iterationLog,
        costCents,
        fluffWarning,
        pipelineWarnings,
        pipelineImproved,
        annotatedSentences,
    };
}

// ─── B3.1: X-Ray Annotation Generator (separate Haiku call) ──────────────────
async function generateXRayAnnotations(
    coverLetter: string,
    ctx: CoverLetterSetupContext
): Promise<SentenceAnnotation[]> {
    if (!process.env.ANTHROPIC_API_KEY) {
        console.warn('⚠️ [X-Ray] No API Key — skipping annotations');
        return [];
    }

    const prompt = `Analysiere dieses fertige Anschreiben und zerlege es in Sätze mit Quellenangabe.

Anschreiben:
---
${coverLetter}
---

Für JEDEN Satz: Bestimme die Hauptquelle:
- "user_style": Satz stammt primär aus dem Schreibstil/der Persönlichkeit des Kandidaten
- "company_research": Satz bezieht sich auf Firmendaten, News, Zitate, Werte des Unternehmens
- "job_fit": Satz verbindet CV-Erfahrung mit einer Job-Anforderung

Antwort NUR als valides JSON-Array:
[
  { "text": "Der erste Satz.", "source": "company_research", "reference": "Firmenwerte: Innovation" },
  { "text": "Der zweite Satz.", "source": "job_fit", "reference": "Anforderung: Python-Erfahrung" }
]

Kein Freitext, nur das JSON-Array.`;

    console.log('🔍 [X-Ray] Generating annotations via Haiku...');

    const message = await anthropic.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 2000,
        temperature: 0.1,
        system: 'You are a text analysis assistant. Respond ONLY with a valid JSON array.',
        messages: [{ role: 'user', content: prompt }]
    });

    const content = message.content[0].type === 'text' ? message.content[0].text : '';

    // Try to parse JSON — graceful degradation on failure
    let parsed: SentenceAnnotation[];
    try {
        const jsonMatch = content.match(/\[\s*\{[\s\S]*\}\s*\]/);
        if (!jsonMatch) throw new Error('No JSON array found in X-Ray response');
        parsed = JSON.parse(jsonMatch[0]);
    } catch {
        console.warn('⚠️ [X-Ray] Could not parse JSON response — skipping annotations');
        return [];
    }

    // Validate each entry
    return parsed
        .filter(s => s.text && s.source && s.reference)
        .map(s => ({
            text: s.text,
            source: (['user_style', 'company_research', 'job_fit'].includes(s.source)
                ? s.source
                : 'job_fit') as SentenceAnnotation['source'],
            reference: s.reference,
        }));
}
