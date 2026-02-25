export const dynamic = 'force-dynamic';

/**
 * POST /api/mood/checkin
 * Stores a mood check-in and updates last_mood_checkin_at in user_settings.
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

        const { mood, context, note } = await request.json();

        if (!mood || mood < 1 || mood > 5) {
            return NextResponse.json({ error: 'Invalid mood (1-5)' }, { status: 400 });
        }

        // 1. Insert into mood_checkins
        const { error: insertError } = await supabaseAdmin
            .from('mood_checkins')
            .insert({
                user_id: user.id,
                mood,
                context: context || 'midday',
                note: note || null,
            });

        if (insertError) {
            console.error('[mood/checkin] Insert error:', insertError);
            return NextResponse.json({ error: insertError.message }, { status: 500 });
        }

        // 2. Update last_mood_checkin_at in user_settings (upsert)
        const { error: upsertError } = await supabaseAdmin
            .from('user_settings')
            .upsert(
                {
                    user_id: user.id,
                    last_mood_checkin_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                },
                { onConflict: 'user_id' }
            );

        if (upsertError) {
            console.error('[mood/checkin] Upsert user_settings error:', upsertError);
            // Non-critical — check-in was already saved
        }

        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        console.error('[mood/checkin] Fatal:', error);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
