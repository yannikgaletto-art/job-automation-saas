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
import type { CoverLetterSetupContext, AuditTrailCard } from '@/types/cover-letter-setup';
import type { StyleAnalysis } from './writing-style-analyzer';
import { scanForFluff } from './anti-fluff-blacklist';
import { runMultiAgentPipeline } from './multi-agent-pipeline';
import { buildSystemPrompt, type UserProfileData, type JobData, type CompanyResearchData } from './cover-letter-prompt-builder';
import { judgeCoverLetter, type JudgeResult } from './cover-letter-judge';

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
    pipelineWarnings?: string[];
    pipelineImproved?: boolean;
    auditTrail?: AuditTrailCard[];
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

    // ─── Style Analysis: Route based on toneSource ─────────────────────────
    let styleAnalysis: StyleAnalysis | null = null;
    if (setupContext?.tone?.toneSource === 'custom-style' && setupContext.tone.selectedStyleDocId) {
        // Load the user-selected document's style analysis
        const { data: selectedDoc } = await supabaseAdmin
            .from('documents')
            .select('metadata')
            .eq('id', setupContext.tone.selectedStyleDocId)
            .eq('user_id', userId) // RLS defense-in-depth
            .single();
        styleAnalysis = selectedDoc?.metadata?.style_analysis ?? null;
        console.log(`[CoverLetterGen] Using custom style from doc ${setupContext.tone.selectedStyleDocId}: ${styleAnalysis ? 'found' : 'not found'}`);
    } else {
        // Legacy: latest cover letter style
        const { data: docs } = await supabaseAdmin
            .from('documents')
            .select('metadata')
            .eq('user_id', userId)
            .eq('document_type', 'cover_letter')
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
                    website: jobData.metadata?.company_url || undefined,
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

        return {
            coverLetter: fixedText,
            judgePassed: true,
            judgeFailReasons: [],
            finalValidation: { isValid: true, issues: [] },
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
    const { userId, jobId, setupContext, userProfile, jobData, companyResearch, styleAnalysis } = params;

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

    // ─── X-Ray Audit Trail (after pipeline, before return) ───────────────
    let auditTrail: AuditTrailCard[] | undefined;
    if (coverLetter.length > 0 && setupContext) {
        try {
            auditTrail = await generateAuditTrail(coverLetter, setupContext);
            console.log(`✅ [AuditTrail] Generated ${auditTrail?.length ?? 0} cards`);
        } catch (auditErr) {
            console.warn('⚠️ [AuditTrail] Generation failed — returning without audit trail:', auditErr);
            auditTrail = undefined;
        }
    }

    // Cost tracking
    const judgeCallCount = iterationLog.filter(l => l.validation.isValid).length;
    const gptCost = process.env.OPENAI_API_KEY ? 0.5 : 0;
    const perplexityCost = process.env.PERPLEXITY_API_KEY ? 0.3 : 0;
    const auditCost = auditTrail ? 0.1 : 0;
    const costCents = iterationLog.length * 2.5 + judgeCallCount * 0.3 + fluffRetries * 2.5 + gptCost + perplexityCost + auditCost;

    return {
        coverLetter,
        judgePassed,
        judgeFailReasons,
        finalValidation: validation,
        iterations: iterationLog.length,
        iterationLog,
        costCents,
        fluffWarning,
        pipelineWarnings,
        pipelineImproved,
        auditTrail,
    };
}

// ─── X-Ray Audit Trail Generator (separate Haiku call) ────────────────────────
async function generateAuditTrail(
    coverLetter: string,
    ctx: CoverLetterSetupContext
): Promise<AuditTrailCard[]> {
    if (!process.env.ANTHROPIC_API_KEY) {
        console.warn('⚠️ [AuditTrail] No API Key — skipping');
        return [];
    }

    // Build module context for the prompt
    const activeModules: string[] = [];
    if (ctx.optInModules?.vulnerabilityInjector) activeModules.push('Vulnerability Injector (strategische Schwäche)');
    if (ctx.optInModules?.first90DaysHypothesis) activeModules.push('Erste-90-Tage-Plan');
    if (ctx.optInModules?.pingPong) activeModules.push('Ping-Pong (Zitatkontrast in Einleitung)');
    if (ctx.selectedNews) activeModules.push(`News-Einbau: "${ctx.selectedNews.title}"`);
    if (ctx.selectedQuote) activeModules.push(`Zitat: "${ctx.selectedQuote.quote}" — ${ctx.selectedQuote.author}`);

    const modulesBlock = activeModules.length > 0
        ? `\nAKTIVE MODULE (vom User gewählt — erstelle für JEDES Modul eine eigene module_trace Karte):\n${activeModules.map((m, i) => `${i + 1}. ${m}`).join('\n')}`
        : '';

    const stationsBlock = ctx.cvStations?.length > 0
        ? `\nGEWÄHLTE CV-STATIONEN:\n${ctx.cvStations.map(s => `- ${s.company} (${s.role}): "${s.keyBullet}" → gematcht mit: "${s.matchedRequirement}"`).join('\n')}`
        : '';

    const prompt = `Analysiere dieses Anschreiben und erstelle einen "Audit Trail" — eine Erklärung, WARUM jeder Teil des Briefes so geschrieben wurde.

ANSCHREIBEN:
---
${coverLetter}
---
${stationsBlock}
${modulesBlock}

Erstelle GENAU diese Karten (JSON-Array):

1. PFLICHT: Eine "user_voice" Karte — Welcher Schreibstil-Aspekt wurde beibehalten? (z.B. kurze Sätze, analytischer Ton, lockere Sprache)
2. PFLICHT: Eine "company_insight" Karte — Welche Firmen-Information (News, Werte, Zitat) wurde wo eingebaut?
3. PFLICHT: Eine "job_fit" Karte — Welche Job-Anforderung wurde mit welcher CV-Station gematcht?
${activeModules.length > 0 ? `4. PFLICHT: Für JEDES aktive Modul oben eine "module_trace" Karte — Wo genau im Brief wurde es eingebaut?` : ''}

Format — NUR valides JSON-Array:
[
  { "category": "user_voice", "title": "Schreibstil beibehalten", "detail": "Dein analytischer, direkter Satzbau wurde durchgängig beibehalten.", "reference": "Gesamter Brief" },
  { "category": "company_insight", "title": "Firmen-News integriert", "detail": "Der Fokus auf Life Sciences wurde in Absatz 2 eingebaut.", "reference": "Absatz 2" },
  { "category": "job_fit", "title": "Job-Anforderung gematcht", "detail": "Die Anforderung 'Stakeholder Management' wurde mit deinem KPMG-Praktikum gematcht.", "reference": "Absatz 3" }
]

Für module_trace Karten zusätzlich: "moduleName": "vulnerabilityInjector" (exakter Key)

Kein Freitext, nur das JSON-Array.`;

    console.log('🔍 [AuditTrail] Generating audit trail via Haiku...');

    const message = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        temperature: 0.1,
        system: 'You are a text analysis assistant. Respond ONLY with a valid JSON array.',
        messages: [{ role: 'user', content: prompt }]
    });

    const content = message.content[0].type === 'text' ? message.content[0].text : '';

    let parsed: AuditTrailCard[];
    try {
        const jsonMatch = content.match(/\[\s*\{[\s\S]*\}\s*\]/);
        if (!jsonMatch) throw new Error('No JSON array found in audit trail response');
        parsed = JSON.parse(jsonMatch[0]);
    } catch {
        console.warn('⚠️ [AuditTrail] Could not parse JSON response — returning empty');
        return [];
    }

    const validCategories = ['user_voice', 'company_insight', 'job_fit', 'module_trace'];
    const iconMap: Record<string, AuditTrailCard['icon']> = {
        user_voice: '🟢',
        company_insight: '🔵',
        job_fit: '🟣',
        module_trace: '🟠',
    };

    return parsed
        .filter(c => c.category && c.title && c.detail)
        .map(c => ({
            category: (validCategories.includes(c.category) ? c.category : 'job_fit') as AuditTrailCard['category'],
            icon: iconMap[c.category] || '🟣',
            title: c.title,
            detail: c.detail,
            reference: c.reference,
            moduleName: c.moduleName,
        }));
}
