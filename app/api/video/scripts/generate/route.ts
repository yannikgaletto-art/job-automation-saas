import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logging';
import { createRateLimiter, checkRateLimit } from '@/lib/api/rate-limit';
import Anthropic from '@anthropic-ai/sdk';

const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

// Rate limit: 3 script generations per minute per user
const scriptGenLimiter = createRateLimiter({ maxRequests: 3, windowMs: 60_000 });

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

        // Rate limit check
        const rateLimited = checkRateLimit(scriptGenLimiter, user.id, 'video/scripts/generate');
        if (rateLimited) return rateLimited;

        const log = logger.forRequest(requestId, user.id, '/api/video/scripts/generate');
        const {
            jobId,
            force,
            applicant_archetype,
            tone_mode,
        } = await request.json() as {
            jobId: string;
            force?: boolean;
            applicant_archetype?: string;
            tone_mode?: 'standard' | 'direct' | 'initiative';
        };
        if (!jobId) {
            return NextResponse.json({ error: 'Missing jobId', requestId }, { status: 400 });
        }

        const userId = user.id;
        log.info('Generating video script', { jobId, force: !!force, applicant_archetype, tone_mode });

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

        // Fetch latest cover letter for context (optional)
        const { data: clDraft } = await supabaseAdmin
            .from('documents')
            .select('metadata')
            .eq('user_id', userId)
            .eq('document_type', 'cover_letter')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        const coverLetterContext = clDraft?.metadata?.generated_content
            ? (clDraft.metadata.generated_content as string).substring(0, 500)
            : '';

        // --- Human Voice Directive ---
        const toneCalibration = {
            standard: `TONE_MODE: standard
- "Sie"-Anrede im Abschluss erlaubt
- Eröffnung mit Namen + Position (aber KEIN "bewerbe mich"-Satz)
- Geeignet für: Konzern, Kanzlei, klassische Industrie`,
            direct: `TONE_MODE: direct
- "du/ihr"-Anrede im Abschluss
- Erfahrungs-Block mit einer konkreten Zahl oder einem Datum
- Geeignet für: Tech, Startup, Scale-up`,
            initiative: `TONE_MODE: initiative
- Vorstellung beginnt mit einer Beobachtung über die Firma (mirror_phrases nutzen), NICHT mit dem Namen
- Abschluss schlägt einen konkreten nächsten Schritt vor
- Name kommt erst in Satz 2 der Vorstellung
- Geeignet für: wenn Stellenanzeige "ownership", "proaktiv", "self-starter" enthält
- WICHTIG: Wenn keine konkreten Firmen-Infos, formuliere Beobachtung über Branche/Rolle. Erfinde NICHTS.`,
        }[tone_mode ?? 'direct'] || '';

        const archetypeHint = applicant_archetype ? {
            builder: 'ARCHETYPE: Builder — Ergebnisse, Zahlen, gebaute Dinge betonen.',
            strategist: 'ARCHETYPE: Stratege — Analyse, Denkweise, Klarheit betonen.',
            teamplayer: 'ARCHETYPE: Teamplayer — Zusammenarbeit, gemeinsame Erfolge betonen.',
            specialist: 'ARCHETYPE: Spezialist — Fachtiefe, technisches Wissen betonen.',
        }[applicant_archetype] || '' : '';

        // Claude Haiku: categorize keywords + generate block content + extract mirror phrases
        const prompt = `Du schreibst Stichpunkte für ein 60-Sekunden-Video-Pitch.
Kein Essay. Keine Präsentation. Jemand schaut in eine Kamera und redet.

KONTEXT:
- Der User liest diese Stichpunkte als Teleprompter
- Jeder Block wird laut gesprochen, nicht gelesen
- 60 Sekunden = ca. 130 Wörter gesamt = Kürze ist Pflicht
- Jeder Satz muss sich natürlich anhören wenn man ihn laut sagt

Firma: ${job.company_name}
Position: ${job.job_title}
Keywords aus der Stelle: ${uniqueKeywords.join(', ')}
${job.description ? `\nStellenbeschreibung:\n${(job.description as string).substring(0, 1500)}` : ''}
${coverLetterContext ? `\nAnschreiben-Kontext:\n${coverLetterContext}` : ''}
${archetypeHint ? `\n${archetypeHint}` : ''}

${toneCalibration}

═══ VERBOTENE KONSTRUKTIONEN (klingen sofort nach KI wenn gesprochen) ═══
❌ "Ich freue mich darauf, meine Expertise einzubringen"
❌ "Mit meinem Hintergrund in X kann ich Y unterstützen"
❌ "Ich bin Kandidat/in für die Position..."
❌ "Meine Leidenschaft für X treibt mich an"
❌ "Ich bin überzeugt, einen wertvollen Beitrag zu leisten"
❌ Passiv-Konstruktionen ("wurde mir bewusst", "konnte erreicht werden")
❌ Konjunktiv als Hauptton ("würde", "könnte", "möchte gerne")
❌ Doppel-Aussagen: Erst behaupten, dann beweisen im gleichen Satz
❌ "umfangreiche Erfahrung in den Bereichen"
❌ "erfolgreich einsetzen konnte"
Wenn du einen dieser Sätze generierst, hast du VERSAGT.

═══ WIE EIN MENSCH IN 60 SEKUNDEN KLINGT ═══

Vorstellung (max 2 Sätze, max 25 Wörter):
  ✅ "Hey, ich bin [Name] — kurz warum ich zu [Firma] passe."
  ❌ "Als erfahrener X sehe ich in Y die Chance..."

Erfahrung (max 3 Sätze, max 45 Wörter):
  ✅ "Bei [Firma] habe ich [konkretes Problem] gelöst — Ergebnis: [eine Zahl]."
  ❌ "Ich verfüge über umfangreiche Erfahrung in den Bereichen X, Y und Z"

Motivation (max 2 Sätze, max 33 Wörter):
  ✅ "Was mich an [Firma] interessiert: ihr macht [X] — das ist genau mein Thema."
  ❌ "Ich bin sehr begeistert von der innovativen Unternehmenskultur"

Abschluss (max 2 Sätze, max 25 Wörter):
  ✅ "Ich habe drei Ideen dazu. 20 Minuten reichen."
  ❌ "Ich freue mich auf ein persönliches Kennenlernen"

Aufgabe 1: Kategorisiere die Keywords in 3 Gruppen:
- "mustHave" (max 4): NUR Hard Skills, Technologien, Methodologien.
  VERBOTEN: Finanz-Kennzahlen (EBITDA, ROI, P&L), Firmennamen, Soft Skills.
- "niceToHave" (max 4): NUR Soft Skills, Branchenkenntnisse, Bonus-Qualifikationen.
  VERBOTEN: Firmennamen, generische Phrasen wie "Teamfähigkeit".
- "companySpecific" (max 3): NUR Werte/Kultur-Begriffe die die Firma SELBST nutzt.
  VERBOTEN: Firmennamen (eigene oder fremde), generische Keywords.

Aufgabe 2: Erstelle für jeden der folgenden Blöcke Stichpunkte die sich NATÜRLICH ANHÖREN wenn laut gesprochen:
${(templates || []).map(t => `- ${t.name} (${t.default_duration_seconds}s)`).join('\n')}

Aufgabe 3: Extrahiere 2-3 Identitäts-Phrasen die die Firma über sich selbst sagt (keine Keywords, sondern Selbstbeschreibungen).

Antworte NUR mit folgendem JSON (kein anderer Text):
{
  "keywords": {
    "mustHave": ["..."],
    "niceToHave": ["..."],
    "companySpecific": ["..."]
  },
  "mirror_phrases": ["...", "..."],
  "blocks": [
    { "title": "Vorstellung", "content": "..." },
    { "title": "Motivation", "content": "..." },
    { "title": "Erfahrung", "content": "..." },
    { "title": "Abschluss", "content": "..." }
  ]
}`;

        const aiResponse = await anthropic.messages.create({
            model: 'claude-3-haiku-20240307',
            max_tokens: 950,
            messages: [{ role: 'user', content: prompt }],
        });

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
            // Continue with empty AI suggestions — don't fail the entire flow
        }

        // Build blocks from templates + AI content
        const blocks: GeneratedBlock[] = (templates || []).map((t, i) => {
            const aiBlock = aiBlocks.find(b => b.title === t.name);
            return {
                id: crypto.randomUUID(),
                templateId: t.id,
                title: t.name,
                durationSeconds: t.default_duration_seconds,
                isRequired: t.is_required,
                content: aiBlock?.content || '',
                sortOrder: i,
            };
        });

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
            return NextResponse.json({ error: 'Script konnte nicht gespeichert werden', requestId }, { status: 500 });
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
            return NextResponse.json({ error: 'Verifikation fehlgeschlagen', requestId }, { status: 500 });
        }

        // AI Audit Log (PFLICHT)
        const inputTokens = aiResponse.usage?.input_tokens || 0;
        const outputTokens = aiResponse.usage?.output_tokens || 0;
        await supabaseAdmin.from('generation_logs').insert({
            user_id: userId,
            job_id: jobId,
            model_name: 'claude-3-haiku-20240307',
            iteration: 1,
            prompt_tokens: inputTokens,
            completion_tokens: outputTokens,
            generated_text: aiText,
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
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error(`[${requestId}] ❌ video/scripts/generate error=${errMsg}`);
        return NextResponse.json({ error: errMsg || 'Generation failed', requestId }, { status: 500 });
    }
}
