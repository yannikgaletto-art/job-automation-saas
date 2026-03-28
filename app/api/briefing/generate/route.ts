export const dynamic = 'force-dynamic';

/**
 * GET /api/briefing/generate
 * KI-generiertes Morning Briefing. Cached in daily_briefings table.
 * Fallback-Text wenn Anthropic nicht verfügbar.
 *
 * MIGRATION NOTE (2026-03-28): Replaced GPT-4o-mini with Claude 4.5 Haiku via model-router
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { complete } from '@/lib/ai/model-router';

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
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const today = new Date().toISOString().split('T')[0];
        const userName = user.user_metadata?.full_name?.split(' ')[0] || 'Hey';

        // Check cache first
        const { data: cached } = await supabaseAdmin
            .from('daily_briefings')
            .select('message')
            .eq('user_id', user.id)
            .eq('date', today)
            .maybeSingle();

        if (cached) {
            return NextResponse.json({
                message: cached.message,
                completedYesterday: 0,
                firstBlockTime: null,
                userName,
            });
        }

        // Gather context
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];

        const { data: completedTasks } = await supabaseAdmin
            .from('tasks')
            .select('title')
            .eq('user_id', user.id)
            .eq('status', 'completed')
            .gte('completed_at', yesterdayStr);

        const { data: todayTasks } = await supabaseAdmin
            .from('tasks')
            .select('title, scheduled_start')
            .eq('user_id', user.id)
            .gte('scheduled_start', `${today}T00:00:00`)
            .lte('scheduled_start', `${today}T23:59:59`)
            .order('scheduled_start', { ascending: true })
            .limit(1);

        const { data: pendingJobs } = await supabaseAdmin
            .from('job_queue')
            .select('id')
            .eq('user_id', user.id)
            .in('status', ['pending', 'processing']);

        const completedCount = completedTasks?.length ?? 0;
        const firstBlock = todayTasks?.[0];
        const pendingCount = pendingJobs?.length ?? 0;

        // Generate with Claude 4.5 Haiku
        let message: string;
        try {
            const firstBlockText = firstBlock
                ? `${firstBlock.title} um ${new Date(firstBlock.scheduled_start).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`
                : 'noch kein Block geplant';

            const response = await complete({
                taskType: 'briefing_generate',
                prompt: `Du bist ein motivierender, empathischer Pathly-Assistent.
Schreibe 2 kurze, persönliche Sätze für das Morning Briefing.
Kontext:
- Gestern abgeschlossene Tasks: ${completedCount}
- Erster Fokus-Block heute: ${firstBlockText}
- Offene Bewerbungen: ${pendingCount}
Ton: kurz, klar, motivierend. Kein Corporate-Sprech. Kein übertriebenes Lob.
Antworte nur mit den 2 Sätzen, nichts anderes.`,
                maxTokens: 100,
                temperature: 0.8,
            });

            message = response.text.trim() || 'Starte deinen Tag mit Fokus und Intention.';
        } catch {
            message = completedCount > 0
                ? `Gestern hast du ${completedCount} Task${completedCount > 1 ? 's' : ''} erledigt. Mach weiter so — Schritt für Schritt.`
                : 'Ein neuer Tag, eine neue Chance. Fokussiere dich auf das Wesentliche.';
        }

        // Cache the briefing (best-effort)
        try {
            await supabaseAdmin.from('daily_briefings').upsert({
                user_id: user.id,
                date: today,
                message,
            }, { onConflict: 'user_id,date' });
        } catch { /* ignore cache errors */ }

        return NextResponse.json({
            message,
            completedYesterday: completedCount,
            firstBlockTime: firstBlock?.scheduled_start ?? null,
            userName,
        });
    } catch (error: unknown) {
        console.error('[briefing/generate] Error:', error);
        return NextResponse.json({
            message: 'Starte deinen Tag mit Fokus und Intention.',
            completedYesterday: 0,
            firstBlockTime: null,
            userName: 'Hey',
        });
    }
}

