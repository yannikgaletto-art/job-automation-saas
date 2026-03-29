export const dynamic = 'force-dynamic';

/**
 * GET /api/jobs/search/suggest-titles
 * Analyzes user's CV and suggests 3-5 job titles.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function GET() {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        // Fetch user's CV text
        const { data: doc } = await supabaseAdmin
            .from('documents')
            .select('text_content, metadata')
            .eq('user_id', user.id)
            .eq('document_type', 'cv')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (!doc?.text_content) {
            return NextResponse.json({
                success: true,
                titles: ['Projektmanager', 'Consultant', 'Business Development'],
                source: 'default',
            });
        }

        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
            return NextResponse.json({
                success: true,
                titles: ['Projektmanager', 'Consultant', 'Business Development'],
                source: 'default',
            });
        }

        const anthropic = new Anthropic({ apiKey });

        const message = await anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 200,
            temperature: 0,
            system: 'Du bist ein Karriereberater. Analysiere den Lebenslauf und schlage die 5 passendsten Jobtitel vor. Antworte NUR mit einem JSON-Array von Strings, kein Markdown.',
            messages: [{
                role: 'user',
                content: `CV-Text (gekürzt):\n${doc.text_content.slice(0, 3000)}\n\nAntwort: ["Titel 1", "Titel 2", ...]`,
            }],
        });

        const text = message.content[0].type === 'text' ? message.content[0].text.trim() : '[]';
        let titles: string[];
        try {
            const match = text.match(/\[[\s\S]*\]/);
            titles = JSON.parse(match ? match[0] : text);
        } catch {
            titles = ['Projektmanager', 'Consultant', 'Business Development'];
        }

        return NextResponse.json({
            success: true,
            titles: titles.slice(0, 5),
            source: 'cv',
        });
    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error('❌ [SuggestTitles]', errMsg);
        return NextResponse.json({ error: errMsg }, { status: 500 });
    }
}
