export const dynamic = 'force-dynamic';

/**
 * POST /api/pomodoro/complete
 * Fire-and-forget session persistence. Never blocks Timer UI.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { started_at, duration_min, completed, aborted_at_pct, energy_level } = body;

        if (!started_at || !duration_min) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const { error } = await supabaseAdmin
            .from('pomodoro_sessions')
            .insert({
                user_id: user.id,
                started_at,
                completed_at: completed ? new Date().toISOString() : null,
                duration_min,
                completed: completed ?? false,
                aborted_at_pct: aborted_at_pct ?? null,
                energy_level: energy_level ?? null,
            });

        if (error) {
            console.error('❌ [Pomodoro] Insert error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true }, { status: 201 });
    } catch (error: unknown) {
        console.warn('⚠️ Pomodoro session could not be saved:', error);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
