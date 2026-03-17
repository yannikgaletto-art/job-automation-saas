/**
 * Coaching Session Complete API Route
 * Feature-Silo: coaching
 * 
 * POST: Mark session as ended and trigger report generation.
 * PRIMARY: Direct synchronous generation (works in localhost without Inngest dev server)
 * FALLBACK: Inngest async pipeline on direct generation failure
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { inngest } from '@/lib/inngest/client';
import { generateAndSaveReport } from '@/lib/services/coaching-report-generator';
import { getUserLocale } from '@/lib/i18n/get-user-locale';

const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        // Auth check (Contract 8)
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id: sessionId } = await params;

        // Verify session belongs to user (single query for all fields)
        const { data: session, error: sessionError } = await supabaseAdmin
            .from('coaching_sessions')
            .select('id, session_status, turn_count, created_at, feedback_report')
            .eq('id', sessionId)
            .eq('user_id', user.id)
            .single();

        if (sessionError || !session) {
            return NextResponse.json({ error: 'Session nicht gefunden' }, { status: 404 });
        }

        // Race condition fix: ?regenerate=true allows re-triggering for broken reports.
        const url = new URL(request.url);
        const regenerate = url.searchParams.get('regenerate') === 'true';

        if (session.session_status === 'completed' && session.feedback_report && !regenerate) {
            return NextResponse.json({
                success: true,
                message: 'Report ist bereits vorhanden.',
            });
        }

        // If regenerating, clear the old broken report
        if (regenerate && session.feedback_report) {
            await supabaseAdmin
                .from('coaching_sessions')
                .update({ feedback_report: null, coaching_score: null })
                .eq('id', sessionId);
        }

        if (session.session_status !== 'active' && session.session_status !== 'completed') {
            return NextResponse.json({
                error: 'Session ist bereits beendet',
                session_status: session.session_status,
            }, { status: 400 });
        }

        // Calculate duration
        const durationSeconds = Math.round(
            (Date.now() - new Date(session.created_at).getTime()) / 1000
        );

        // Update session status to prevent double-completion
        await supabaseAdmin
            .from('coaching_sessions')
            .update({
                session_status: 'completed',
                duration_seconds: durationSeconds,
            })
            .eq('id', sessionId);

        console.log(`✅ [Coaching] Session ${sessionId} completed (${durationSeconds}s) — starting report generation`);

        // PRIMARY PATH: Generate report directly (fire-and-forget).
        // Works in localhost dev (no Inngest dev server) and production.
        const userId = user.id;
        const userLocale = await getUserLocale(userId);
        generateAndSaveReport(sessionId, userId).catch((err) => {
            console.error('❌ [Coaching] Direct report generation failed — falling back to Inngest:', err);
            // FALLBACK: Inngest async pipeline
            inngest.send({
                name: 'coaching/generate-report',
                data: { sessionId, userId, locale: userLocale },
            }).catch((inngestErr) => {
                console.error('❌ [Coaching] Inngest fallback also failed:', inngestErr);
            });
        });

        return NextResponse.json({
            success: true,
            message: 'Interview beendet. Dein Feedback-Report wird erstellt...',
        });

    } catch (error) {
        console.error('❌ [Coaching] Complete error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
