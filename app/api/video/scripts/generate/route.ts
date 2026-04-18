import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logging';
import { rateLimiters, checkUpstashLimit } from '@/lib/api/rate-limit-upstash';
import Anthropic from '@anthropic-ai/sdk';
import { withCreditGate, handleBillingError } from '@/lib/middleware/credit-gate';
import { CREDIT_COSTS } from '@/lib/services/credit-types';

const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

// Vercel Serverless: Video script generation calls Claude + multiple DB ops
export const maxDuration = 60;



interface CategorizedKeywords {
    mustHave: string[];
    niceToHave: string[];
    companySpecific: string[];
}

interface GeneratedBlock {
    id: string;
    templateId: string | null;
    title: string;
    durationSeconds: number;
    isRequired: boolean;
    content: string;
    sortOrder: number;
}

// ── Fixed Vorstellung Script — T2 style (short, authentic, ~10s) ───────────────────────────────
// These are shown as editable defaults. [Name] = Hiring Manager, [Dein Name] = Applicant.
const INTRO_DEFAULTS: Record<string, string> = {
    de: 'Hallo [Name], ich bin [Dein Name]. Ein kurzes Video sagt oft mehr als ein langes Anschreiben. Ich stelle mich kurz vor, damit ihr einen besseren Eindruck habt, wer hinter dem Lebenslauf steckt.',
    en: 'Hi [Name], I am [Your Name]. A short video often says more than a long cover letter. Let me quickly introduce myself so you get a better sense of who is behind the CV.',
    es: 'Hola [Nombre], soy [Tu Nombre]. Un video corto dice mas que una larga carta. Me presento brevemente para que tengan una mejor idea de quien esta detras del CV.',
};
// Localized title of the intro block (must match TITLE_MAPS)
const INTRO_TITLES: Record<string, string> = {
    de: 'Vorstellung',
    en: 'Introduction',
    es: 'Introducción',
};

/**
 * POST /api/video/scripts/generate
 * 
 * Generates a structured video script with categorized keywords.
 * 1 Claude Haiku call: categorize keywords + generate example content per block.
 * 
 * Contracts: §8 (Auth Guard), §3 (user-scoped), §1 (Double-Assurance)
 */
export async function POST(request: NextRequest) {
    const requestId = crypto.randomUUID();

    try {
        // §8: Auth Guard
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized', requestId }, { status: 401 });
        }

        // Rate limit check (Upstash Redis)
        const rateLimited = await checkUpstashLimit(rateLimiters.videoScript, user.id);
        if (rateLimited) return rateLimited;

        const log = logger.forRequest(requestId, user.id, '/api/video/scripts/generate');
        const {
            jobId,
            force,
            applicant_archetype,
            tone_mode,
            locale: requestLocale,
        } = await request.json() as {
            jobId: string;
            force?: boolean;
            applicant_archetype?: string;
            tone_mode?: 'standard' | 'direct' | 'initiative';
            locale?: string;
        };
        if (!jobId) {
            return NextResponse.json({ error: 'Missing jobId', requestId }, { status: 400 });
        }

        const userId = user.id;

        // Resolve locale: request param → user_settings.language (i18n_protocol §1) → 'de'
        let locale = requestLocale;
        if (!locale || !['de', 'en', 'es'].includes(locale)) {
            const { data: settings } = await supabaseAdmin
                .from('user_settings')
                .select('language')
                .eq('user_id', userId)
                .maybeSingle();
            locale = settings?.language || 'de';
        }

        log.info('Generating video script', { jobId, force: !!force, applicant_archetype, tone_mode, locale });

        // Fix 1: Check for existing script before overwriting
        const { data: existingScript } = await supabaseAdmin
            .from('video_scripts')
            .select('id, blocks, categorized_keywords')
            .eq('user_id', userId)
            .eq('job_id', jobId)
            .maybeSingle();

        const hasExistingContent = existingScript?.blocks && 
            Array.isArray(existingScript.blocks) && 
            existingScript.blocks.some((b: { content?: string }) => b.content?.trim());

        // Load job data
        const { data: job } = await supabaseAdmin
            .from('job_queue')
            .select('job_title, company_name, ats_keywords, buzzwords, hard_requirements, description')
            .eq('id', jobId)
            .eq('user_id', userId)
            .single();

        if (!job) {
            return NextResponse.json({ error: 'Job not found', requestId }, { status: 404 });
        }

        // Load system block templates
        const { data: templates } = await supabaseAdmin
            .from('script_block_templates')
            .select('id, name, is_required, default_duration_seconds, sort_order')
            .eq('is_system', true)
            .order('sort_order', { ascending: true });

        // Fix 7: EARLY RETURN — if existing content and no force, return cached data (no AI call)
        if (hasExistingContent && !force) {
            log.info('Existing script found — returning early (no AI call)', { scriptId: existingScript.id });
            return NextResponse.json({
                success: true,
                requestId,
                existingScript: true,
                preview: true,
                categorizedKeywords: existingScript.categorized_keywords || { mustHave: [], niceToHave: [], companySpecific: [] },
                templates: templates || [],
            });
        }

        // Collect all raw keywords
        const allKeywords = [
            ...(job.ats_keywords || []),
            ...(job.buzzwords || []),
            ...(job.hard_requirements || []),
        ];
        const uniqueKeywords = [...new Set(allKeywords.map((k: string) => k.trim()).filter(Boolean))];

        // --- 3-Tier Applicant Context Fallback ---
        // Tier 1: Cover Letter for THIS specific job
        let applicantContext = '';
        let contextSource: 'cover_letter' | 'cv_data' | 'none' = 'none';

        const { data: jobCl } = await supabaseAdmin
            .from('documents')
            .select('metadata')
            .eq('user_id', userId)
            .eq('document_type', 'cover_letter')
            .filter('metadata->>job_id', 'eq', jobId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (jobCl?.metadata?.generated_content) {
            applicantContext = (jobCl.metadata.generated_content as string).substring(0, 2000);
            contextSource = 'cover_letter';
        }

        // Tier 2: CV Structured Data from user_profiles
        if (!applicantContext) {
            const { data: profile } = await supabaseAdmin
                .from('user_profiles')
                .select('cv_structured_data')
                .eq('id', userId)
                .maybeSingle();

            if (profile?.cv_structured_data) {
                let cvData: Record<string, unknown> | null = null;
                try {
                    cvData = typeof profile.cv_structured_data === 'string'
                        ? JSON.parse(profile.cv_structured_data)
                        : profile.cv_structured_data as Record<string, unknown>;
                } catch {
                    log.error('Failed to parse cv_structured_data JSON — Tier 2 skipped');
                }

                const experienceLines: string[] = [];
                if (Array.isArray(cvData?.experience)) {
                    for (const exp of cvData.experience.slice(0, 5)) {
                        const company = exp.company || exp.organization || '';
                        const role = exp.role || exp.title || exp.position || '';
                        const bullets = Array.isArray(exp.description)
                            ? exp.description.map((d: { text?: string }) => d.text || d).join('; ')
                            : '';
                        if (company || role) {
                            experienceLines.push(`${role} @ ${company}${bullets ? ': ' + bullets.substring(0, 150) : ''}`);
                        }
                    }
                }
                if (Array.isArray(cvData?.skills) && cvData.skills.length > 0) {
                    experienceLines.push(`Skills: ${cvData.skills.slice(0, 15).join(', ')}`);
                }
                if (experienceLines.length > 0) {
                    applicantContext = experienceLines.join('\n');
                    contextSource = 'cv_data';
                }
            }
        }

        // Tier 3: No context available — prompt will enforce placeholders
        log.info('Applicant context resolved', { contextSource, contextLength: applicantContext.length });

        // --- Locale-aware prompt generation ---
        const { prompt: aiPrompt, titleMap } = getPromptByLocale(
            locale!,
            job,
            uniqueKeywords,
            applicantContext,
            contextSource,
            applicant_archetype,
            tone_mode,
            templates || [],
        );

        // §BILLING: Credit Gate — debit 0.5 credits, auto-refund on AI failure
        const aiResponse = await withCreditGate(
            user.id,
            CREDIT_COSTS.video_script,
            'video_script',
            () => anthropic.messages.create({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 950,
                messages: [{ role: 'user', content: aiPrompt }],
            }),
            jobId
        );

        const aiText = aiResponse.content[0].type === 'text' ? aiResponse.content[0].text : '';

        let categorizedKeywords: CategorizedKeywords = { mustHave: [], niceToHave: [], companySpecific: [] };
        let aiBlocks: { title: string; content: string }[] = [];
        let mirrorPhrases: string[] = [];

        try {
            const jsonMatch = aiText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                categorizedKeywords = parsed.keywords || categorizedKeywords;
                aiBlocks = parsed.blocks || [];
                mirrorPhrases = parsed.mirror_phrases || [];
            }
        } catch {
            log.error('Failed to parse generate response', { raw: aiText });
        }

        // Build blocks from templates + AI content (locale title-map matching)
        const blocks: GeneratedBlock[] = (templates || []).map((tmpl, i) => {
            const localizedTitle = titleMap[tmpl.name] || tmpl.name;
            const aiBlock = aiBlocks.find(b => b.title === localizedTitle) || aiBlocks.find(b => b.title === tmpl.name);
            return {
                id: crypto.randomUUID(),
                templateId: tmpl.id,
                title: localizedTitle,
                durationSeconds: tmpl.default_duration_seconds,
                isRequired: tmpl.is_required,
                content: aiBlock?.content || '',
                sortOrder: i,
            };
        });

        // ── Always override Vorstellung with the fixed default script ────────────────
        // The user requested a fixed, personal intro template — AI generates only the
        // other blocks (Erfahrung, Motivation, Abschluss). The intro placeholders
        // [Name] and [Dein Name] are filled in by the user before recording.
        const introTitle = INTRO_TITLES[locale!] || INTRO_TITLES.de;
        const introDefault = INTRO_DEFAULTS[locale!] || INTRO_DEFAULTS.de;
        const introBlock = blocks.find(b => b.title === introTitle);
        if (introBlock) {
            introBlock.content = introDefault;
        }
        // Upsert video_scripts row
        const { error: upsertError } = await supabaseAdmin
            .from('video_scripts')
            .upsert(
                {
                    user_id: userId,
                    job_id: jobId,
                    mode: 'bullets',
                    blocks,
                    keywords_covered: [],
                    categorized_keywords: { ...categorizedKeywords, mirrorPhrases },
                    updated_at: new Date().toISOString(),
                },
                { onConflict: 'user_id,job_id', ignoreDuplicates: false }
            );

        if (upsertError) {
            log.error('Failed to upsert video_scripts', { error: upsertError.message });
            return NextResponse.json({ error: 'script_save_failed', requestId }, { status: 500 });
        }

        // Double-Assurance: Read-back (§1)
        const { data: verify } = await supabaseAdmin
            .from('video_scripts')
            .select('id, blocks')
            .eq('user_id', userId)
            .eq('job_id', jobId)
            .single();

        if (!verify) {
            log.error('Double-Assurance failed — script not found after upsert');
            return NextResponse.json({ error: 'script_verify_failed', requestId }, { status: 500 });
        }

        // AI Audit Log (PFLICHT)
        const inputTokens = aiResponse.usage?.input_tokens || 0;
        const outputTokens = aiResponse.usage?.output_tokens || 0;
        await supabaseAdmin.from('generation_logs').insert({
            user_id: userId,
            job_id: jobId,
            model_name: 'claude-haiku-4-5-20251001',
            iteration: 1,
            prompt_tokens: inputTokens,
            completion_tokens: outputTokens,
            generated_text: null,
        });

        log.info('Video script generated', { blockCount: blocks.length, keywordCount: uniqueKeywords.length });

        return NextResponse.json({
            success: true,
            requestId,
            script: {
                id: verify.id,
                blocks,
                mode: 'bullets',
                keywordsCovered: [],
                wpmSpeed: 130,
            },
            categorizedKeywords: { ...categorizedKeywords, mirrorPhrases },
            templates: templates || [],
        });

    } catch (error: unknown) {
        const billingResponse = handleBillingError(error);
        if (billingResponse) return billingResponse;

        const errMsg = error instanceof Error ? error.message : String(error);
        console.error(`[${requestId}] ❌ video/scripts/generate error=${errMsg}`);
        return NextResponse.json({ error: errMsg || 'Generation failed', requestId }, { status: 500 });
    }
}

// --- Locale-aware prompt + title-map ---

interface PromptResult {
    prompt: string;
    titleMap: Record<string, string>;
}

function getPromptByLocale(
    locale: string,
    job: { company_name: string; job_title: string; description?: string | unknown },
    uniqueKeywords: string[],
    applicantContext: string,
    contextSource: 'cover_letter' | 'cv_data' | 'none',
    applicantArchetype: string | undefined,
    toneMode: 'standard' | 'direct' | 'initiative' | undefined,
    templates: { name: string; default_duration_seconds: number }[],
): PromptResult {
    const TITLE_MAPS: Record<string, Record<string, string>> = {
        de: { Vorstellung: 'Vorstellung', Erfahrung: 'Erfahrung', Motivation: 'Motivation', Abschluss: 'Abschluss' },
        en: { Vorstellung: 'Introduction', Erfahrung: 'Experience', Motivation: 'Motivation', Abschluss: 'Closing' },
        es: { Vorstellung: 'Introducción', Erfahrung: 'Experiencia', Motivation: 'Motivación', Abschluss: 'Cierre' },
    };
    const titleMap = TITLE_MAPS[locale] || TITLE_MAPS.de;
    const blockList = templates.map(t => `- ${titleMap[t.name] || t.name} (${t.default_duration_seconds}s)`).join('\n');
    const descSnippet = job.description ? (job.description as string).substring(0, 1500) : '';
    const tm = toneMode ?? 'direct';

    // Tone calibration per locale
    const toneCalibrations: Record<string, Record<string, string>> = {
        de: {
            standard: 'TONE_MODE: standard\n- "Sie"-Anrede im Abschluss erlaubt\n- Eröffnung mit Namen + Position',
            direct: 'TONE_MODE: direct\n- "du/ihr"-Anrede\n- Erfahrungs-Block mit konkreter Zahl',
            initiative: 'TONE_MODE: initiative\n- Vorstellung beginnt mit Beobachtung über die Firma, NICHT mit dem Namen\n- Abschluss schlägt konkreten nächsten Schritt vor',
        },
        en: {
            standard: 'TONE_MODE: standard\n- Formal "you" address\n- Open with name + position',
            direct: 'TONE_MODE: direct\n- Casual "you" address\n- Experience block with a concrete number or date',
            initiative: 'TONE_MODE: initiative\n- Introduction starts with an observation about the company, NOT with your name\n- Closing proposes a concrete next step',
        },
        es: {
            standard: 'TONE_MODE: standard\n- Tratamiento formal "usted"\n- Apertura con nombre + puesto',
            direct: 'TONE_MODE: direct\n- Tratamiento informal "tú"\n- Bloque de experiencia con número concreto',
            initiative: 'TONE_MODE: initiative\n- Introducción comienza con observación sobre la empresa, NO con tu nombre\n- Cierre propone un siguiente paso concreto',
        },
    };
    const toneCalibration = (toneCalibrations[locale] || toneCalibrations.de)[tm] || '';

    // Archetype hints per locale
    const archetypeHints: Record<string, Record<string, string>> = {
        de: {
            builder: 'ARCHETYPE: Builder — Ergebnisse, Zahlen, gebaute Dinge betonen.',
            strategist: 'ARCHETYPE: Stratege — Analyse, Denkweise, Klarheit betonen.',
            teamplayer: 'ARCHETYPE: Teamplayer — Zusammenarbeit, gemeinsame Erfolge betonen.',
            specialist: 'ARCHETYPE: Spezialist — Fachtiefe, technisches Wissen betonen.',
        },
        en: {
            builder: 'ARCHETYPE: Builder — Emphasize results, numbers, things built.',
            strategist: 'ARCHETYPE: Strategist — Emphasize analysis, thinking, clarity.',
            teamplayer: 'ARCHETYPE: Team Player — Emphasize collaboration, shared wins.',
            specialist: 'ARCHETYPE: Specialist — Emphasize depth, technical expertise.',
        },
        es: {
            builder: 'ARCHETYPE: Builder — Enfatizar resultados, números, cosas construidas.',
            strategist: 'ARCHETYPE: Estratega — Enfatizar análisis, pensamiento, claridad.',
            teamplayer: 'ARCHETYPE: Team Player — Enfatizar colaboración, logros compartidos.',
            specialist: 'ARCHETYPE: Especialista — Enfatizar profundidad, conocimiento técnico.',
        },
    };
    const archetypeHint = applicantArchetype
        ? (archetypeHints[locale] || archetypeHints.de)[applicantArchetype] || ''
        : '';

    // Build locale-specific prompt
    if (locale === 'en') {
        return {
            titleMap,
            prompt: `You are writing bullet points for a 60-second video pitch spoken by the APPLICANT.
No essay. No presentation. A real person looks into a camera and talks about THEMSELVES.

═══ PERSPECTIVE — CRITICAL ═══
You are writing FROM the applicant's point of view.
✅ "I built...", "I worked at...", "I want to join..."
❌ NEVER write as the company: "We're...", "Our mission...", "Join us..."
❌ NEVER copy company marketing copy or job description sentences verbatim
Every sentence must be in first-person singular ("I").
If you write a single sentence from the company's perspective, you have FAILED.

CONTEXT:
- Each block is read aloud on camera — must sound natural when spoken
- 60 seconds ≈ 130 words total — zero filler
- The applicant is speaking TO the hiring manager

Company: ${job.company_name}
Position: ${job.job_title}
Keywords from the job: ${uniqueKeywords.join(', ')}
${descSnippet ? `\nJob description (for context only — do NOT copy verbatim):\n${descSnippet}` : ''}
${applicantContext ? `\nApplicant background (source: ${contextSource}):\n${applicantContext}` : ''}

═══ FACTS RULE — CRITICAL ═══
You may ONLY mention experience, technologies, and companies that appear in the "Applicant background" section above.
DO NOT invent technologies, companies, or projects.
${!applicantContext ? 'No background was provided. Use the station names from the job and write generic talking points the applicant can personalize later.' : 'Match the applicant\'s stations to the job requirements. Stay factual.'}
${archetypeHint ? `\n${archetypeHint}` : ''}

${toneCalibration}

═══ FORBIDDEN CONSTRUCTIONS ═══
❌ "I look forward to bringing my expertise"
❌ "With my background in X, I can support Y"
❌ "I am a candidate for the position of..."
❌ "My passion for X drives me"
❌ "We're...", "Our team...", "Our mission..." (company voice — NEVER)
❌ Passive voice, subjunctive as main tone
If you generate any of these, you have FAILED.

Task 1: Categorize keywords into 3 groups:
- "mustHave" (max 4): hard skills, technologies
- "niceToHave" (max 4): soft skills, industry knowledge
- "companySpecific" (max 3): company self-description terms

Task 2: Create bullet points for each block (spoken aloud, first-person applicant):
${blockList}

Task 3: Extract 2-3 identity phrases the company uses about itself (for the sidebar only).

Respond ONLY with JSON:
{
  "keywords": { "mustHave": ["..."], "niceToHave": ["..."], "companySpecific": ["..."] },
  "mirror_phrases": ["..."],
  "blocks": [
    { "title": "Introduction", "content": "..." },
    { "title": "Experience", "content": "..." },
    { "title": "Motivation", "content": "..." },
    { "title": "Closing", "content": "..." }
  ]
}`,
        };
    }

    if (locale === 'es') {
        return {
            titleMap,
            prompt: `Estás escribiendo viñetas para un video-pitch de 60 segundos hablado por el CANDIDATO.
No es un ensayo. Una persona real mira a la cámara y habla de SÍ MISMA.

═══ PERSPECTIVA — CRÍTICO ═══
Escribes DESDE el punto de vista del candidato.
✅ "Construí...", "Trabajé en...", "Quiero unirme..."
❌ NUNCA escribas como la empresa: "Somos...", "Nuestra misión...", "Únete a nosotros..."
❌ NUNCA copies literalmente el lenguaje de marketing de la empresa
Cada frase debe estar en primera persona singular ("yo").
Si escribes una sola frase desde la perspectiva de la empresa, has FRACASADO.

CONTEXTO:
- Cada bloque se habla en voz alta mirando a la cámara
- 60 segundos ≈ 130 palabras — cero relleno
- El candidato habla AL responsable de selección

Empresa: ${job.company_name}
Puesto: ${job.job_title}
Palabras clave del puesto: ${uniqueKeywords.join(', ')}
${descSnippet ? `\nDescripción del puesto (solo contexto — NO copiar literalmente):\n${descSnippet}` : ''}
${applicantContext ? `\nPerfil del candidato (fuente: ${contextSource}):\n${applicantContext}` : ''}

═══ REGLA DE HECHOS — CRÍTICO ═══
Solo puedes mencionar experiencia, tecnologías y empresas que aparezcan en el "Perfil del candidato" de arriba.
NO inventes tecnologías, empresas ni proyectos.
${!applicantContext ? 'No se proporcionó perfil. Usa los nombres de las estaciones del puesto y escribe puntos genéricos que el candidato pueda personalizar.' : 'Conecta las estaciones del candidato con los requisitos del puesto. Mantente factual.'}
${archetypeHint ? `\n${archetypeHint}` : ''}

${toneCalibration}

═══ CONSTRUCCIONES PROHIBIDAS ═══
❌ "Espero con ilusión aportar mi experiencia"
❌ "Con mi trayectoria en X, puedo apoyar Y"
❌ "Soy candidato/a para el puesto de..."
❌ "Somos...", "Nuestro equipo...", "Nuestra misión..." (voz empresa — NUNCA)
❌ Voz pasiva, condicional como tono principal
Si generas alguna de estas, has FRACASADO.

Tarea 1: Categoriza palabras clave en 3 grupos:
- "mustHave" (máx. 4): hard skills, tecnologías
- "niceToHave" (máx. 4): soft skills, conocimiento sectorial
- "companySpecific" (máx. 3): autodescripciones de la empresa

Tarea 2: Crea viñetas para cada bloque (primera persona, hablado en voz alta):
${blockList}

Tarea 3: Extrae 2-3 frases de identidad de la empresa (solo para el panel lateral).

Responde SOLO con JSON:
{
  "keywords": { "mustHave": ["..."], "niceToHave": ["..."], "companySpecific": ["..."] },
  "mirror_phrases": ["..."],
  "blocks": [
    { "title": "Introducción", "content": "..." },
    { "title": "Experiencia", "content": "..." },
    { "title": "Motivación", "content": "..." },
    { "title": "Cierre", "content": "..." }
  ]
}`,
        };
    }

    // Default: DE
    return {
        titleMap,
        prompt: `Du schreibst Stichpunkte fuer ein 60-Sekunden-Video-Pitch, gesprochen vom BEWERBER.
Kein Essay. Eine echte Person schaut in die Kamera und redet locker ueber SICH SELBST.

=== PERSPEKTIVE ===
Du schreibst AUS der Perspektive des Bewerbers. Erste Person Singular.
"Ich habe...", "Ich moechte...", "Mich hat abgeholt..."
NIEMALS Firmenperspektive: "Wir sind...", "Unsere Mission..."
Ein Satz aus Firmenperspektive = VERSAGT.

=== TONFALL: UMGANGSSPRACHE ===
- Schreibe so, wie ein selbstsicherer Mensch frei in die Kamera spricht
- Kurze Saetze. Max 20 Woerter pro Satz. Ideal 12-15.
- KEINE Floskelsprache: "Ich freue mich darauf...", "meine Expertise einzubringen"
- Stattdessen: "Mich hat euer Ansatz direkt abgeholt", "Dort habe ich gelernt..."
- Nutze erzaehlende Sprache: "Zum Beispiel", "Konkret", "Dabei habe ich gelernt"
- KONJUNKTIONEN als Ueberleitung zwischen Saetzen: "Und daher", "Denn gerade dort", "Dabei", "Und genau das"
  Beispiel: "Eure Arbeit bei X hat mich abgeholt. Denn gerade dort sehe ich in meiner Arbeit, dass..."

KONTEXT:
- 60 Sekunden = ca. 130 Woerter gesamt
- Jeder Block wird laut gesprochen -- muss natuerlich klingen
- Der Bewerber spricht MIT dem Hiring Manager, nicht UEBER sich

Firma: ${job.company_name}
Position: ${job.job_title}
Keywords: ${uniqueKeywords.join(', ')}
${descSnippet ? `\nStellenbeschreibung (NUR Kontext -- NICHT woertlich uebernehmen):\n${descSnippet}` : ''}
${applicantContext ? `\nBewerber-Hintergrund (Quelle: ${contextSource}):\n${applicantContext}` : ''}

=== FAKTEN-REGEL ===
NUR Erfahrungen, Technologien und Firmen nennen, die im Bewerber-Hintergrund stehen.
ERFINDE NICHTS.
${!applicantContext ? 'Kein Hintergrund vorhanden. Nutze Platzhalter wie [CV-Station 1], [Konkrete Handlung], die der Bewerber personalisieren kann.' : 'Matche die Stationen des Bewerbers mit den Job-Anforderungen.'}
${archetypeHint ? `\n${archetypeHint}` : ''}

${toneCalibration}

=== BLOCK-STRUKTUR (T2-Format) ===
Generiere genau diese 4 Bloecke mit dem angegebenen Timing:

1. Vorstellung (10s, ~20 Woerter): NICHT generieren -- wird vom System vorgefuellt.

2. Motivation (15s, ~33 Woerter):
   - Beginne mit: Was hat mich an dieser Firma abgeholt?
   - Ueberleitung: Parallele zur eigenen Arbeit
   - Endet mit: Was will ich bei denen methodisch lernen?
   - Bescheidener Ton -- "ich moechte von euch lernen"

3. Erfahrung (10s, ~25 Woerter):
   - EINE konkrete Station, EINE Erkenntnis -- 2 Saetze max
   - Schema: "Bei [Station] habe ich gelernt: [Umgangssprachliche Erkenntnis]."
   - Kuerzer ist besser. KEINE Aufzaehlung von 3+ Stationen

4. Abschluss (10s, ~20 Woerter):
   - Entspannter CTA, KEIN "Hochachtungsvoll"
   - Tenor: "Wenn das fuer euch nach einem guten Match klingt, freue ich mich auf ein kurzes Kennenlernen."

=== VERBOTENE KONSTRUKTIONEN ===
- "Ich freue mich darauf, meine Expertise einzubringen"
- "Mit meinem Hintergrund in X kann ich Y unterstuetzen"
- "Ich bin Kandidat/in fuer die Position..."
- "Beiden Erfahrungen zeigen mir..."
- Aufzaehlung von 3+ Buzzwords in einem Satz
- Passiv, Konjunktiv als Hauptton
Ein Verstoss = VERSAGT.

Aufgabe 1: Kategorisiere Keywords in 3 Gruppen:
- "mustHave" (max 4): Hard Skills, Technologien
- "niceToHave" (max 4): Soft Skills, Branchenkenntnisse
- "companySpecific" (max 3): Firmen-Selbstbeschreibungen

Aufgabe 2: Erstelle Stichpunkte fuer Bloecke 2-4 (Vorstellung wird automatisch gefuellt).
Beachte: MAX 33 Woerter pro Block. Umgangssprache. Erste Person.

Aufgabe 3: Extrahiere 2-3 Identitaets-Phrasen der Firma (nur Seitenleiste).

Antworte NUR mit JSON:
{
  "keywords": { "mustHave": ["..."], "niceToHave": ["..."], "companySpecific": ["..."] },
  "mirror_phrases": ["..."],
  "blocks": [
    { "title": "Vorstellung", "content": "" },
    { "title": "Motivation", "content": "..." },
    { "title": "Erfahrung", "content": "..." },
    { "title": "Abschluss", "content": "..." }
  ]
}`,
    };
}

