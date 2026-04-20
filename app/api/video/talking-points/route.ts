import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { logger } from '@/lib/logging';
import Anthropic from '@anthropic-ai/sdk';

const supabaseAdmin = getSupabaseAdmin();

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export async function POST(request: NextRequest) {
    const requestId = crypto.randomUUID();

    try {
        // §8: Auth Guard
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized', requestId }, { status: 401 });
        }

        const log = logger.forRequest(requestId, user.id, '/api/video/talking-points');
        const { jobId } = await request.json() as { jobId: string };
        if (!jobId) {
            return NextResponse.json({ error: 'Missing jobId', requestId }, { status: 400 });
        }

        const userId = user.id;
        log.info('Generating talking points', { jobId });

        // Load job data + latest cover letter draft
        const { data: jobData } = await supabaseAdmin
            .from('job_queue')
            .select('company_name, job_title, metadata')
            .eq('id', jobId)
            .eq('user_id', userId)
            .single();

        if (!jobData) {
            return NextResponse.json({ error: 'Job not found', requestId }, { status: 404 });
        }

        // Fetch latest cover letter draft for context
        const { data: clDraft } = await supabaseAdmin
            .from('documents')
            .select('metadata')
            .eq('user_id', userId)
            .eq('document_type', 'cover_letter')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        const coverLetterText = clDraft?.metadata?.generated_content || '';

        // Claude Haiku: 3 concise talking points
        const prompt = `Du bist ein Karriere-Coach. Erstelle genau 3 kurze Talking Points für ein 1-minütiges Video.

Firma: ${jobData.company_name}
Position: ${jobData.job_title}
${coverLetterText ? `\nAnschreiben-Kontext:\n${coverLetterText.substring(0, 500)}` : ''}

Regeln:
- Genau 3 Punkte
- Jeder Punkt max 15 Wörter
- Deutsch
- Format: JSON Array mit { "label": "Kurztitel", "text": "Stichpunkt-Text" }
- Nur das JSON Array, kein anderer Text`;

        const aiResponse = await anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 300,
            messages: [{ role: 'user', content: prompt }],
        });

        const aiText = aiResponse.content[0].type === 'text' ? aiResponse.content[0].text : '';
        let talkingPoints: { label: string; text: string }[] = [];

        try {
            // Extract JSON from response (handle potential markdown wrapping)
            const jsonMatch = aiText.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                talkingPoints = JSON.parse(jsonMatch[0]);
            }
        } catch {
            log.error('Failed to parse talking points JSON', { raw: aiText });
            return NextResponse.json({ error: 'AI response parsing failed', requestId }, { status: 500 });
        }

        // Self-upsert: create/update video_approaches entry with talking points (V3 fix — single write)
        await supabaseAdmin
            .from('video_approaches')
            .upsert(
                {
                    user_id: userId,
                    job_id: jobId,
                    talking_points: { items: talkingPoints },
                    status: 'prompts_ready',
                    updated_at: new Date().toISOString(),
                },
                { onConflict: 'user_id,job_id', ignoreDuplicates: false }
            );

        // Cost tracking via generation_logs (column names match schema)
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

        log.info('Talking points generated', { count: talkingPoints.length });

        return NextResponse.json({
            success: true,
            requestId,
            talkingPoints,
        });

    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error(`[${requestId}] ❌ video/talking-points error=${errMsg}`);
        return NextResponse.json({ error: errMsg || 'Generation failed', requestId }, { status: 500 });
    }
}
