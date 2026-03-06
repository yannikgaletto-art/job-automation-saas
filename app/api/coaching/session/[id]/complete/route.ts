/**
 * Coaching Session Complete API Route
 * Feature-Silo: coaching
 * 
 * POST: Mark session as ended and trigger report generation via Inngest
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { inngest } from '@/lib/inngest/client';

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

        // Verify session belongs to user and is active
        const { data: session, error: sessionError } = await supabaseAdmin
            .from('coaching_sessions')
            .select('id, session_status, turn_count')
            .eq('id', sessionId)
            .eq('user_id', user.id)
            .single();

        if (sessionError || !session) {
            return NextResponse.json({ error: 'Session nicht gefunden' }, { status: 404 });
        }

        if (session.session_status !== 'active') {
            return NextResponse.json({
                error: 'Session ist bereits beendet',
                session_status: session.session_status,
            }, { status: 400 });
        }

        // Calculate duration
        const { data: sessionFull } = await supabaseAdmin
            .from('coaching_sessions')
            .select('created_at')
            .eq('id', sessionId)
            .single();

        const durationSeconds = sessionFull
            ? Math.round((Date.now() - new Date(sessionFull.created_at).getTime()) / 1000)
            : 0;

        // Update session status to prevent double-completion
        await supabaseAdmin
            .from('coaching_sessions')
            .update({
                session_status: 'completed',
                duration_seconds: durationSeconds,
            })
            .eq('id', sessionId);

        // Trigger report generation via Inngest
        await inngest.send({
            name: 'coaching/generate-report',
            data: {
                sessionId,
                userId: user.id,
            },
        });

        console.log(`✅ [Coaching] Session ${sessionId} completed (${durationSeconds}s) — report generation triggered`);

        return NextResponse.json({
            success: true,
            message: 'Interview beendet. Dein Feedback-Report wird erstellt...',
        });

    } catch (error) {
        console.error('❌ [Coaching] Complete error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
