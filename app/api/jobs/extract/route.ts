import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';

const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || '' });
const Schema = z.object({ jobId: z.string().uuid() });

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

        if (!process.env.ANTHROPIC_API_KEY)
            return NextResponse.json({ success: false, error: 'KI nicht konfiguriert' }, { status: 503 });

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 45000);

        let extracted: Record<string, unknown> = {};
        try {
            const msg = await anthropic.messages.create({
                model: 'claude-3-haiku-20240307',
                max_tokens: 1500,
                temperature: 0,
                system: `Extrahiere aus der Stellenbeschreibung diese JSON-Struktur. NUR JSON zurückgeben, kein Markdown, keine Erklärungen:
{"summary":"2-3 Sätze auf Deutsch","responsibilities":["max 8 Aufgaben"],"qualifications":["max 8 Anforderungen"],"benefits":["max 5"],"location":"string oder null","seniority":"junior|mid|senior|lead|unknown","buzzwords":["max 12 ATS Keywords"]}`,
                messages: [{ role: 'user', content: job.description }],
            }, { signal: controller.signal });

            if (msg.content[0].type === 'text') {
                const raw = msg.content[0].text.trim().replace(/^```json?\n?/i, '').replace(/\n?```$/i, '').trim();
                extracted = JSON.parse(raw);
            }
        } finally {
            clearTimeout(timeout);
        }

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
