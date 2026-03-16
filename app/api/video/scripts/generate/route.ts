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
        const { jobId, force } = await request.json() as { jobId: string; force?: boolean };
        if (!jobId) {
            return NextResponse.json({ error: 'Missing jobId', requestId }, { status: 400 });
        }

        const userId = user.id;
        log.info('Generating video script', { jobId, force: !!force });

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

        // Claude Haiku: categorize keywords + generate block content
        const prompt = `Du bist ein Karriere-Coach. Erstelle ein strukturiertes Video-Skript für ein 1-minütiges Bewerbungsvideo.

Firma: ${job.company_name}
Position: ${job.job_title}
Keywords aus der Stelle: ${uniqueKeywords.join(', ')}
${coverLetterContext ? `\nAnschreiben-Kontext:\n${coverLetterContext}` : ''}

Aufgabe 1: Kategorisiere die Keywords in 3 Gruppen:
- "mustHave": Keywords die im Video UNBEDINGT erwähnt werden sollten (max 5)
- "niceToHave": Keywords die hilfreich wären, aber nicht zwingend (max 5)
- "companySpecific": Unternehmens-spezifische Begriffe/Werte (max 3)

Aufgabe 2: Erstelle für jeden der folgenden Blöcke einen kurzen Beispiel-Stichpunkt (max 20 Wörter):
${(templates || []).map(t => `- ${t.name} (${t.default_duration_seconds}s)`).join('\n')}

Antworte NUR mit folgendem JSON (kein anderer Text):
{
  "keywords": {
    "mustHave": ["..."],
    "niceToHave": ["..."],
    "companySpecific": ["..."]
  },
  "blocks": [
    { "title": "Vorstellung", "content": "Beispiel-Stichpunkt hier" },
    { "title": "Motivation", "content": "..." },
    { "title": "Erfahrung", "content": "..." },
    { "title": "Abschluss", "content": "..." }
  ]
}`;

        const aiResponse = await anthropic.messages.create({
            model: 'claude-3-haiku-20240307',
            max_tokens: 600,
            messages: [{ role: 'user', content: prompt }],
        });

        const aiText = aiResponse.content[0].type === 'text' ? aiResponse.content[0].text : '';

        let categorizedKeywords: CategorizedKeywords = { mustHave: [], niceToHave: [], companySpecific: [] };
        let aiBlocks: { title: string; content: string }[] = [];

        try {
            const jsonMatch = aiText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                categorizedKeywords = parsed.keywords || categorizedKeywords;
                aiBlocks = parsed.blocks || [];
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
                    categorized_keywords: categorizedKeywords,
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
            categorizedKeywords,
            templates: templates || [],
        });

    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error(`[${requestId}] ❌ video/scripts/generate error=${errMsg}`);
        return NextResponse.json({ error: errMsg || 'Generation failed', requestId }, { status: 500 });
    }
}
