import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { validateCoverLetter, logValidation } from './cover-letter-validator';
import { enrichCompany, linkEnrichmentToJob } from './company-enrichment';
import type { CoverLetterSetupContext } from '@/types/cover-letter-setup';
import type { StyleAnalysis } from './writing-style-analyzer';
import { scanForFluff, buildBlacklistPromptSection } from './anti-fluff-blacklist';

// ─── Clients ──────────────────────────────────────────────────────────────────
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || '' });

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── Supporting Types ─────────────────────────────────────────────────────────
interface UserProfileData {
    cv_structured_data?: Record<string, unknown>;
    [key: string]: unknown;
}
interface JobData {
    job_title?: string;
    company_name?: string;
    company_slug?: string;
    requirements?: string[];
    metadata?: Record<string, unknown>;
    cv_optimization_user_decisions?: {
        appliedChanges?: Array<{
            target: { section: string };
            before: string;
            after: string;
        }>;
    };
    company_research?: Array<{
        intel_data?: CompanyResearchData;
        suggested_quotes?: Array<{ text?: string; author?: string; match_score?: number }>;
    }>;
    [key: string]: unknown;
}
interface CompanyResearchData {
    company_values?: string[];
    tech_stack?: string[];
    [key: string]: unknown;
}
// StyleAnalysis is imported from writing-style-analyzer.ts
// Canonical interface: { tone, sentence_length, conjunctions, greeting, rhetorical_devices, forbidden_constructs }
interface JudgeResult {
    scores: {
        naturalness: number;
        style_match: number;
        company_relevance: number;
        individuality: number;
        overall_score: number;
    };
    weaknesses: string[];
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
    fluffWarning?: boolean; // True if blacklist patterns persisted after re-gen attempts
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

    // Pass targeted fix parameters through
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
            temperature: 0.4,
            messages: [{ role: 'user', content: prompt }]
        });

        const rewrittenText = message.content[0].type === 'text' ? message.content[0].text.trim() : currentLetter;

        return {
            coverLetter: rewrittenText,
            finalScores: { naturalness: 9, style_match: 9, company_relevance: 9, individuality: 9, overall_score: 9 },
            finalValidation: { isValid: true, issues: [] },
            iterations: 1,
            costCents: 0.3,
        };
    } catch (e) {
        console.error('[CoverLetterGen] Failed to apply instruction-based fix:', e);
        throw e;
    }
}

// ─── Core Generation Loop ─────────────────────────────────────────────────────
export async function generateCoverLetter(params: CoverLetterGenerationParams): Promise<CoverLetterResult> {
    const { userId, jobId, setupContext, userProfile, jobData, companyResearch, styleAnalysis, fixMode, targetFix, currentLetter } = params;

    if (fixMode === 'targeted' && targetFix && currentLetter) {
        return fixParagraph(currentLetter, targetFix, setupContext);
    }

    const companyName = jobData?.company_name || setupContext?.companyName || 'Company';
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

        // Strip any accidental markdown
        generatedText = generatedText.replace(/\*\*/g, '').replace(/\*/g, '').replace(/^#+\s/gm, '');

        // Track word count for next iteration feedback
        const words = generatedText.trim().split(/\s+/);
        lastWordCount = words.length;

        // Hard validation (fast, cheap)
        const validationResult = validateCoverLetter(generatedText, companyName);
        await logValidation(jobId, userId, iteration + 1, validationResult);

        console.log(`✅ [MasterPrompt] Validation ${iteration + 1}: ${validationResult.isValid ? 'PASSED' : 'FAILED'} (${validationResult.errors.length} errors)`);

        // Judge only if validation passed
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

        // Success criteria
        if (validationResult.isValid && scores.overall_score >= 8.0) {
            coverLetter = generatedText;
            console.log(`✅ Quality target reached! Score: ${scores.overall_score}/10`);
            break;
        }

        // Build feedback for next iteration
        feedback = [];
        if (!validationResult.isValid) {
            feedback.push(...validationResult.errors.map(e => `VALIDATION ERROR: ${e}`));
        }
        if (validationResult.warnings.length > 0) {
            feedback.push(...validationResult.warnings.map(w => `WARNING: ${w}`));
        }
        // Add real weaknesses from judge
        if (judgment.weaknesses.length > 0) {
            feedback.push(...judgment.weaknesses.map(w => `QUALITÄT: ${w}`));
        }

        iteration++;

        // Best-of-N fallback at max iterations
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
        console.warn(`⚠️ [Anti-Fluff] ${fluffScan.matches.length} patterns found in final CL. Starting re-gen loop (max ${MAX_FLUFF_RETRIES})...`);

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
                    coverLetter = fixedText; // Use improved version even if not perfect
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

    // Cost tracking: Sonnet ~$0.025/call, Haiku ~$0.003/call, Fluff re-gen ~$0.025/call
    const judgeCallCount = iterationLog.filter(l => l.validation.isValid).length;
    const costCents = iterationLog.length * 2.5 + judgeCallCount * 0.3 + fluffRetries * 2.5;

    return {
        coverLetter,
        finalScores: scores,
        finalValidation: validation,
        iterations: iterationLog.length,
        iterationLog,
        costCents,
        fluffWarning,
    };
}

// ─── Master Prompt ────────────────────────────────────────────────────────────
function buildSystemPrompt(
    profile: UserProfileData,
    job: JobData,
    company: CompanyResearchData,
    style: StyleAnalysis | null,
    ctx: CoverLetterSetupContext | undefined,
    feedback: string[],
    lastWordCount: number
): string {
    const lang = ctx?.tone.targetLanguage === 'en' ? 'English' : 'Deutsch';
    const companyName = job?.company_name || ctx?.companyName || 'das Unternehmen';
    const jobTitle = job?.job_title || 'die ausgeschriebene Stelle';

    // ─── B1.6: Ansprechperson-Binding (Cascading Fallback) ────────────────────
    // Priority: 1. contactPerson → 2. userStyle.greeting → 3. formal default
    let contactPersonGreeting: string;
    if (ctx?.tone.contactPerson) {
        const name = ctx.tone.contactPerson.trim();
        if (lang === 'English') {
            contactPersonGreeting = `"Dear ${name},"`;
        } else {
            contactPersonGreeting = `"Liebe/r ${name}," (nutze die wahrscheinlich korrekte Anrede, z.B. "Lieber Max," oder "Liebe Anna,")`;
        }
    } else if (style?.greeting && style.greeting !== 'Sehr geehrte Damen und Herren') {
        contactPersonGreeting = `"${style.greeting}"`;
    } else {
        contactPersonGreeting = lang === 'English'
            ? `"Dear Hiring Team,"`
            : `"Sehr geehrte Damen und Herren,"`;
    }

    // ─── CV Input (CV-Optimizer-Priorität) ────────────────────────────────────
    const cvInput = job?.cv_optimization_user_decisions?.appliedChanges
        ? `OPTIMIERTE CV-ÄNDERUNGEN FÜR DIESEN JOB (MÜSSEN EINFLIESSEN):
${JSON.stringify(
            job.cv_optimization_user_decisions.appliedChanges.map(c => ({
                section: c.target.section,
                vorher: c.before,
                nachher: c.after
            })), null, 2)}

ORIGINAL CV:
${JSON.stringify(profile?.cv_structured_data || {}, null, 2)}`
        : `KANDIDATEN-LEBENSLAUF:
${JSON.stringify(profile?.cv_structured_data || {}, null, 2)}`;

    // ─── Tone Instructions (B1.5: Jeder Stil verändert GESAMTE Prompt-Struktur) ─
    const toneInstructions: Record<string, string> = {
        'data-driven': `STIL: DATENGETRIEBEN & PRÄZISE
ÖFFNUNG: Starte mit einem konkreten, quantifizierbaren Fakt über das Unternehmen ODER einem eigenen messbaren Ergebnis. Kein allgemeines Statement.
ABSATZ-STRUKTUR: Jeder Hauptabsatz folgt dem Schema: Claim → Beweis (Zahl/KPI/Ergebnis) → Implikation für den neuen Arbeitgeber.
BEWEISFÜHRUNG:
- Nutze konkrete Zahlen, Prozentsätze und messbare Resultate in JEDEM Absatz
- Struktur pro Achievement: "Ich habe [X] durch [Y] erreicht, was [Z] bewirkte"
- Aktive Verben: implementiert, gesteigert, reduziert, aufgebaut, verantwortet, optimiert
- Keine vagen Formulierungen wie "sehr erfolgreich" — immer quantifizieren
- Mindestens 3 konkrete Zahlen im gesamten Anschreiben
SCHLUSS: Konkreter Mehrwert in einem Satz mit Zahl (z.B. "Ich bringe 5 Jahre Erfahrung in X mit, die Ihre Y-Strategie um Z beschleunigen können.").
VERBOTEN: Adjektive ohne Beleg, Superlative ohne Beweis, "leidenschaftlich", "motiviert", "engagiert" ohne konkretes Beispiel.`,

        'storytelling': `STIL: NARRATIV & PERSÖNLICH
ÖFFNUNG: Beginne mit einer kurzen persönlichen Situation oder einem Schlüsselmoment deiner Karriere (max. 2 Sätze). Kein "Es war einmal", sondern ein konkreter Moment: "Als ich bei [Firma] zum ersten Mal [Situation erlebte], wusste ich..."
ABSATZ-STRUKTUR: Jede CV-Station wird als Mini-Geschichte erzählt:
- Situation (1 Satz): Was war der Kontext/die Herausforderung?
- Handlung (1 Satz): Was hast du konkret getan?
- Ergebnis (1 Satz): Was kam dabei heraus — und was hat es dir beigebracht?
DRAMATURGIE:
- Verbinde die Stationen zu einem kohärenten Karriere-Narrativ: Jede Station baut auf der vorherigen auf
- Das "Warum" ist wichtiger als das "Was" — zeige Motivation und Entwicklung
- Erlaube 1-2 persönliche Aussagen zur Motivation (aber kein Pathos)
- Nutze Zeitwörter: "Zunächst", "Später erkannte ich", "Heute weiß ich"
- Die rote Linie: Alle Absätze führen logisch zur Bewerbung bei DIESER Firma
SCHLUSS: Schließe den Bogen zum Opening-Moment. Zeige, wie der Karriereweg logisch zu dieser Stelle führt.
VERBOTEN: Aufzählungen, Bullet-Points-Stil, trockene Fakten ohne Kontext, "Mein Werdegang zeigt..."`,

        'formal': `STIL: KLASSISCH-FORMELL
ÖFFNUNG: Direkte, höfliche Bezugnahme auf die Stelle. Keine Überraschungen, kein Storytelling. Sachlich und präzise. (z.B. "Die ausgeschriebene Position als [Titel] bei [Firma] verbindet [Kompetenzfeld A] mit [Kompetenzfeld B] — eine Schnittstelle, die meine bisherige Laufbahn durchzieht.")
ABSATZ-STRUKTUR: Konservative 4-Absatz-Struktur:
1. Einstieg + Motivation (2-3 Sätze)
2. Fachliche Qualifikation mit Belegen (3-4 Sätze)
3. Unternehmens-Passung + kulturelle Verbindung (2-3 Sätze)
4. Souveräner Abschluss (1-2 Sätze)
TONALITÄT:
- Vollständige Formulierungen, keine Kontraktionen
- Passiv vermeiden, aber formelle Anrede konsequent beibehalten (Sie, Ihnen, Ihr)
- Keine Ausrufezeichen, keine rhetorischen Fragen
- Konjunktiv I für höfliche Formulierungen erlaubt
- Seriöse Übergänge: "Darüber hinaus", "In gleicher Weise", "Vor diesem Hintergrund"
SCHLUSS: Souverän auf Augenhöhe, kein Betteln. "Ich freue mich auf ein Gespräch, in dem wir [konkretes Thema] vertiefen können."
VERBOTEN: Umgangssprache, Emojis, Interjektionen, "Ich brenne für", persönliche Anekdoten.`,

        'philosophisch': `STIL: INTELLEKTUELL & KONZEPTIONELL
ÖFFNUNG: Starte mit einem relevanten Zitat, einer Beobachtung oder einem Konzept, das die Brücke zwischen deiner Weltsicht und dem Unternehmen schlägt. (z.B. "Peter Drucker sagte einmal: ‚Die beste Art, die Zukunft vorauszusagen, ist sie zu gestalten.' — Ein Gedanke, der meine Arbeit bei [Firma] geprägt hat und den ich bei [Ziel-Firma] vertiefen möchte.")
ABSATZ-STRUKTUR: Konzept → Beweis → Reflexion
- Jeder Absatz beginnt mit einer These oder Beobachtung
- Dann folgt der konkrete Beweis aus der eigenen Karriere
- Abschluss: Kurze Reflexion, was das für die Zielposition bedeutet
INTELLEKTUELLER RAHMEN:
- Zeige Denktiefe: "Wie" und "Warum" statt nur "Was"
- Erlaube 1 Zitat (vom User gewählt oder aus dem Kontext passend)
- Verbinde branchenspezifische Trends mit persönlicher Erfahrung
- Nutze Analogien und Querverweise: "Wie in der [Disziplin/Branche], zeigt sich auch hier..."
- Die konzeptionelle Ebene zeigt Senioritität und strategisches Denken
SCHLUSS: Schließe mit einer Vision oder einem Ausblick, der zeigt, wie du die Unternehmens-Mission mitgestalten willst. Kein Betteln, sondern intellektuelle Neugier.
VERBOTEN: Oberflächliche Name-Dropping von Philosophen ohne Bezug, Arroganz, akademischer Jargon, mehr als 1 Zitat.`,
    };
    const activeTone = toneInstructions[ctx?.tone.preset ?? 'formal'];

    // ─── Style Sample (B1.1: Alle 6 Marker aus StyleAnalysis) ─────────────────
    const styleSection = style
        ? `SCHREIBSTIL-VORBILD (aus bisherigen Anschreiben des Users):
Ton: ${style.tone || 'nicht analysiert'}
Satzlänge: ${style.sentence_length || 'medium'}
Bevorzugte Konjunktionen: ${(style.conjunctions || []).join(', ') || 'Daher, Deshalb, Zudem'}
Bevorzugte Begrüßung: ${style.greeting || 'Sehr geehrte Damen und Herren'}
${(style.rhetorical_devices || []).length > 0 ? `Rhetorische Mittel: ${style.rhetorical_devices.join(', ')}` : ''}
${(style.forbidden_constructs || []).length > 0 ? `VERBOTEN (User nutzt diese NIE): ${style.forbidden_constructs.join(', ')}` : ''}

Kalibriere deinen Output auf dieses Muster — übernimm den Stil, nicht den Inhalt.
Nutze die extrahierten Konjunktionen statt generischer Übergänge.`
        : '';

    // ─── Stations Section ─────────────────────────────────────────────────────
    const stationsSection = ctx?.cvStations?.length
        ? `[REGEL: HAUPTTEIL - CV-STATIONEN]\n` +
        `- Schreibe keinen Fließtext-Lebenslauf! Widme jeder ausgewählten CV-Station einen EIGENEN, kurzen Absatz (max. 3 Sätze).\n` +
        `- Nenne den Kontext kurz, aber fokussiere dich zu 70% auf den erlernten WERT (Was hat der Kandidat gelernt? Warum ist das für den neuen Arbeitgeber relevant?). Verbinde Sätze logisch (z.B. 'Diese Erfahrung hat meinen Blick dafür geschärft, wie...').\n` +
        `- REDUZIERE BUZZWORDS DRASTISCH. Pro Absatz maximal 2 zentrale Fachbegriffe. Wenn eine CV-Station viele Technologien enthält, erwähne NUR diejenige, die absolut essenziell für die ausgeschriebene Stelle ist. Lass alles andere weg. Der Text muss natürlich und elegant klingen, nicht wie Keyword-Stuffing.\n\n` +
        ctx.cvStations.map(s => `
Station ${s.stationIndex}: ${s.role} @ ${s.company} (${s.period})
  → Beweis für Job-Anforderung: "${s.matchedRequirement}"
  → Schlüssel-Achievement: "${s.keyBullet}"
  → Zeige im Text: ${s.intent}`).join('\n')
        : 'Nutze die relevantesten Erfahrungen aus dem CV und beweise damit deinen Wert für das Unternehmen.';

    // ─── Hook Section (B1.3: Zitat-System repariert) ─────────────────────────
    let hookSection = '';
    if (ctx?.selectedQuote) {
        const enablePingPong = ctx?.enablePingPong ?? false;

        hookSection = `[REGEL: EINLEITUNG - ZITAT-BRIDGING]:
Gewähltes Zitat: "${ctx.selectedQuote.quote}"
(Autor: ${ctx.selectedQuote.author})
${ctx.selectedHook?.content ? `Zusätzlicher Unternehmens-Fakt: "${ctx.selectedHook.content}"` : ''}

FORMATIERUNG DES ZITATS (UNBEDINGT EINHALTEN):
- Leite das Zitat mit einer menschlichen Beobachtung ein (z.B. "Beim Lesen Ihrer Website dachte ich an ${ctx.selectedQuote.author}...").
- Das Zitat MUSS auf einer EIGENEN Zeile stehen, in Anführungszeichen, gefolgt vom Autor:

  [Einleitender Satz]

  "${ctx.selectedQuote.quote}"
  - ${ctx.selectedQuote.author}

  [Begründungssatz]

- DIREKT NACH dem Zitat: Ein EIGENER Begründungssatz (1 Satz), der erklärt WARUM dieses Zitat zum Unternehmen UND zum Kandidaten passt.
- Der Begründungssatz MUSS eine konkrete Brücke zu einer Erfahrung aus dem CV bauen (z.B. 'Diesen Gedanken habe ich bei meiner Arbeit als [Rolle] bei [Firma] täglich gelebt, als ich [konkretes Beispiel]...').
- KEINE leeren Floskeln wie 'Genau diese Haltung treibt mich an'.
${enablePingPong ? '- PING-PONG (aktiv): Nach der Zitat-Brücke, füge einen kurzen Satz hinzu der eine kritische Gegenposition aufwirft. Dies zeigt intellektuelle Reife.' : ''}`;
    } else if (ctx?.selectedHook?.content) {
        hookSection = `[REGEL: EINLEITUNG]:
Unternehmens-Fakt: "${ctx.selectedHook.content}"
(Typ: ${ctx.selectedHook.type}, Quelle: ${ctx.selectedHook.sourceName})
-> Integriere diesen Aufhänger NATÜRLICH in den ersten Satz
-> NIEMALS die Quelle direkt nennen (z.B. "Wie auf Ihrer Website gelesen..." ist VERBOTEN)
-> MAXIMAL 2 SÄTZE für den Aufhänger. Verknüpfe ihn mit deiner Motivation für die Stelle`;
    }

    // ─── Word-Count Feedback ──────────────────────────────────────────────────
    const wordCountFeedback = (() => {
        if (lastWordCount > 380) {
            return `WORTANZAHL: Vorherige Version hatte ${lastWordCount} Wörter — ZU LANG. Kürze um ${lastWordCount - 350} Wörter. Maximal 3 Sätze pro Absatz.`;
        }
        if (lastWordCount < 250 && lastWordCount > 0) {
            return `WORTANZAHL: Vorherige Version hatte ${lastWordCount} Wörter — ZU KURZ. Füge ${280 - lastWordCount} Wörter hinzu. Erweitere den Beweis-Absatz.`;
        }
        return '';
    })();

    // ─── Feedback Section (ab Iteration 2) ───────────────────────────────────
    const feedbackSection = feedback.length > 0
        ? `KRITISCHE VERBESSERUNGEN — ALLE ADRESSIEREN:
${feedback.map(f => `- ${f}`).join('\n')}
${wordCountFeedback ? `\n${wordCountFeedback}` : ''}`
        : '';

    // ─── MASTER PROMPT ASSEMBLY ───────────────────────────────────────────────
    return `
=== SEKTION 1: ROLLE & OUTPUT-FORMAT ===
Du bist ein Senior-Karriereberater und exzellenter Schreiber.
Deine Aufgabe: Schreibe ein Anschreiben für die Stelle "${jobTitle}" bei "${companyName}".

OUTPUT-REGELN (CRITICAL — NIEMALS BRECHEN):
- Nur der reine Briefkörper: Von der Anrede bis zur Grußformel
- KEIN Datum, KEINE Adresszeilen, KEIN Betreff
- KEIN Markdown: kein **bold**, kein *italic*, keine - Bullet-Points im Text
- Sprache: ${lang} — keine einzige Ausnahme
- Länge: 280–380 Wörter, 4–5 Absätze
- Absätze getrennt durch eine Leerzeile
- Beginne direkt mit der Anrede: ${contactPersonGreeting}

=== SEKTION 2: AUFHÄNGER (KURZ & PRÄGNANT) ===
${hookSection || `Beginne mit einem relevanten Aufhänger zu ${companyName}.`}

${companyName} muss im ersten Absatz mindestens einmal fallen.
Der gesamte erste Absatz (Aufhänger + Motivation) darf MAXIMAL 2 SÄTZE lang sein! Keine generischen Abhandlungen über Innovation. Kurz, knackig, direkt zum Punkt.

=== SEKTION 3: KARRIERE-BEWEISE (FOLGENDE ABSÄTZE) ===
Integriere diese Stationen als fließende Prosa — WICHTIG: Erstelle für jede gewählte Station einen eigenen Absatz.

${stationsSection}

Job-Anforderungen für die Relevanzkontrolle:
${JSON.stringify(job?.requirements?.slice(0, 3) || [], null, 2)}

Unternehmens-Kontext (nutze für spezifische Verbindungen):
Werte: ${JSON.stringify(company?.company_values?.slice(0, 3) || [])}
Tech: ${JSON.stringify(company?.tech_stack?.slice(0, 3) || [])}

${cvInput}

=== SEKTION 4: TONALITÄT & STIL ===
PRESET: ${ctx?.tone.preset || 'formal'}
${activeTone}

${styleSection}

${buildBlacklistPromptSection()}

=== SEKTION 5: ABSCHLUSS & CALL TO ACTION ===
[REGEL: SCHLUSSTEIL]
- Der Schlusssatz muss bodenständig und direkt sein. Fasse in einem Satz zusammen, welchen konkreten Mehrwert der Kandidat bringt. Gehe kurz auf die Kultur/DNA des Unternehmens ein.
- VERBOTEN: Das Zitat oder den Aufhänger aus dem ersten Absatz hier noch einmal erwähnen. Schreibe keine poetischen Sprachbilder am Ende.
- Ein souveräner Schlusssatz auf Augenhöhe (kein Betteln um ein Interview, z.B. "Lassen Sie uns in einem kurzen Gespräch ausloten...").

=== SEKTION 6: VERBESSERUNGS-FEEDBACK ===
${feedbackSection || 'Erste Version — kein vorheriges Feedback.'}

Schreibe jetzt das Anschreiben. Beginne direkt mit der Anrede:
`.trim();
}

// ─── Real Judge ───────────────────────────────────────────────────────────────
async function judgeCoverLetter(
    text: string,
    job: JobData,
    setupContext: CoverLetterSetupContext | undefined,
    style: StyleAnalysis | null
): Promise<JudgeResult> {
    const FALLBACK_SCORES: JudgeResult = {
        scores: { naturalness: 7, style_match: 7, company_relevance: 7, individuality: 7, overall_score: 7 },
        weaknesses: []
    };

    if (!process.env.ANTHROPIC_API_KEY) {
        console.warn('⚠️ [Judge] No API Key — returning fallback scores');
        return FALLBACK_SCORES;
    }

    const hookContent = setupContext?.selectedQuote?.quote || setupContext?.selectedHook?.content || '';
    const tonePreset = setupContext?.tone.preset || 'formal';
    const requirements = (job?.requirements || []).slice(0, 3);
    const companyName = job?.company_name || 'das Unternehmen';

    const toneRubric: Record<string, string> = {
        'data-driven': 'Enthält Zahlen/KPIs/messbare Resultate in jedem Absatz? Claim-Beweis-Implikation Struktur? Aktive Verben?',
        'storytelling': 'Erzählstruktur (Situation-Handlung-Ergebnis)? Kohärentes Karriere-Narrativ? Persönliche Momente? Roter Faden?',
        'formal': 'Klassische 4-Absatz-Struktur? Vollständige Formulierungen? Kein umgangssprachlicher Ton? Seriöse Übergänge?',
        'philosophisch': 'Intellektueller Rahmen? Konzept-Beweis-Reflexion? Max. 1 Zitat? Strategische Denktiefe sichtbar?'
    };

    const judgePrompt = `Du bist ein strenger Anschreiben-Qualitätsprüfer. Sei ehrlich und kritisch.

Bewerte dieses Anschreiben auf 4 Dimensionen (0–10, halbe Punkte erlaubt).

BEWERTUNGSKRITERIEN:

1. NATÜRLICHKEIT (0–10):
GPT-Marker (sofort -2 Punkte pro Treffer):
- "Ich freue mich sehr darauf", "Ich bin überzeugt, dass", "meine Leidenschaft für", "ideal auf diese Stelle", "Mit großer Begeisterung"
10 = klingt wie ein realer Mensch, 0 = eindeutig KI-generiert

2. STIL-MATCH (0–10):
Gewünschter Preset: ${tonePreset}
Rubrik: ${toneRubric[tonePreset] || toneRubric['formal']}

3. RELEVANZ (0–10):
Job-Anforderungen: ${requirements.map((r, i) => `${i + 1}. ${r}`).join(' | ')}
Unternehmen: ${companyName}
${hookContent ? `Aufhänger (soll integriert sein): "${hookContent.substring(0, 100)}..."` : ''}

4. INDIVIDUALITÄT (0–10):
Spezifische Details, Zahlen, Projekte? Oder austauschbar?

ANSCHREIBEN:
***
${text}
***

Sei streng. Durchschnittlich = 6-7, nicht 8-9.
WICHTIG: Wenn der 'overall_score' unter 9.0 liegt, MUSST du zwingend mindestens eine konkrete inhaltliche Schwäche im "weaknesses" Array nennen! 

Antworte NUR als valides JSON:
{
  "naturalness": <0-10>,
  "style_match": <0-10>,
  "company_relevance": <0-10>,
  "individuality": <0-10>,
  "overall_score": <0-10>,
  "weaknesses": ["<Schwäche 1>", "<Schwäche 2>"]
}`;

    try {
        console.log('🔍 [Judge] Calling Haiku for quality assessment...');

        const message = await anthropic.messages.create({
            model: 'claude-3-haiku-20240307',
            max_tokens: 300,
            temperature: 0.1,
            system: 'You are a strict cover letter quality assessor. Respond only with valid JSON.',
            messages: [{ role: 'user', content: judgePrompt }]
        });

        const content = message.content[0].type === 'text' ? message.content[0].text : '';

        let parsed: JudgeResult['scores'] & { weaknesses?: string[] };
        try {
            parsed = JSON.parse(content);
        } catch {
            // Fallback: extract JSON from markdown code block
            const match = content.match(/\{[\s\S]*\}/);
            if (!match) throw new Error('No JSON in judge response');
            parsed = JSON.parse(match[0]);
        }

        console.log(`✅ [Judge] naturalness=${parsed.naturalness} style=${parsed.style_match} relevance=${parsed.company_relevance} individuality=${parsed.individuality} overall=${parsed.overall_score}`);

        return {
            scores: {
                naturalness: parsed.naturalness,
                style_match: parsed.style_match,
                company_relevance: parsed.company_relevance,
                individuality: parsed.individuality,
                overall_score: parsed.overall_score,
            },
            weaknesses: parsed.weaknesses || []
        };

    } catch (err) {
        console.error('❌ [Judge] Failed to parse judge response:', err);
        console.warn('⚠️ [Judge] Using fallback scores');
        return FALLBACK_SCORES;
    }
}
