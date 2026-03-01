import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { complete } from '@/lib/ai/model-router';

const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);
const Schema = z.object({ jobId: z.string().uuid() });

/**
 * Robust JSON parser: handles markdown blocks, truncated arrays, etc.
 */
function safeParseJSON(raw: string): Record<string, unknown> {
    // Step 1: Strip markdown code blocks
    let cleaned = raw.trim();
    const mdMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (mdMatch && mdMatch[1]) {
        cleaned = mdMatch[1].trim();
    }

    // Step 2: Try direct parse
    try {
        return JSON.parse(cleaned);
    } catch {
        // Step 3: Extract first { ... } block
        const firstOpen = cleaned.indexOf('{');
        const lastClose = cleaned.lastIndexOf('}');
        if (firstOpen !== -1 && lastClose > firstOpen) {
            try {
                return JSON.parse(cleaned.substring(firstOpen, lastClose + 1));
            } catch {
                // Step 4: Fix truncated arrays by closing them
                let fixable = cleaned.substring(firstOpen, lastClose + 1);
                // Close unclosed arrays: count [ vs ]
                const opens = (fixable.match(/\[/g) || []).length;
                const closes = (fixable.match(/\]/g) || []).length;
                if (opens > closes) {
                    // Remove trailing comma if present, then close arrays
                    fixable = fixable.replace(/,\s*$/, '');
                    for (let i = 0; i < opens - closes; i++) {
                        fixable = fixable.replace(/}\s*$/, ']}');
                    }
                    try {
                        return JSON.parse(fixable);
                    } catch { /* fall through */ }
                }
            }
        }
    }

    console.error('❌ [Extract] All JSON parse attempts failed. Raw:', raw.substring(0, 200));
    return {};
}

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

        const { jobId } = Schema.parse(await request.json());

        const { data: job } = await supabaseAdmin
            .from('job_queue')
            .select('id, description')
            .eq('id', jobId)
            .eq('user_id', user.id)
            .single();

        if (!job?.description || job.description.length < 100)
            return NextResponse.json({ success: false, error: 'Beschreibung zu kurz' }, { status: 400 });

        if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY)
            return NextResponse.json({ success: false, error: 'KI nicht konfiguriert' }, { status: 503 });

        const response = await complete({
            taskType: 'parse_html',
            systemPrompt: `Extrahiere aus der Stellenbeschreibung diese JSON-Struktur. NUR JSON zurückgeben, kein Markdown, keine Erklärungen:
{"summary":"2-3 Sätze auf Deutsch","responsibilities":["max 8 Aufgaben"],"qualifications":["max 8 Anforderungen"],"benefits":["max 5"],"location":"string oder null","seniority":"junior|mid|senior|lead|unknown","buzzwords":["max 12 ATS Keywords"]}`,
            prompt: job.description,
            temperature: 0,
            maxTokens: 1500,
        });

        const extracted = safeParseJSON(response.text);

        await supabaseAdmin.from('job_queue').update({
            summary: (extracted.summary as string) || null,
            responsibilities: Array.isArray(extracted.responsibilities) && extracted.responsibilities.length > 0 ? extracted.responsibilities : null,
            requirements: Array.isArray(extracted.qualifications) && extracted.qualifications.length > 0 ? extracted.qualifications : null,
            benefits: Array.isArray(extracted.benefits) ? extracted.benefits : [],
            location: (extracted.location as string) || null,
            seniority: (extracted.seniority as string) || 'unknown',
            buzzwords: Array.isArray(extracted.buzzwords) ? extracted.buzzwords : null,
        }).eq('id', jobId);

        return NextResponse.json({ success: true });

    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return NextResponse.json(
            { success: false, error: msg.includes('abort') ? 'Timeout – bitte erneut versuchen' : msg },
            { status: msg.includes('abort') ? 504 : 500 }
        );
    }
}
