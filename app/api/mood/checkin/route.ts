export const dynamic = 'force-dynamic';

/**
 * /api/mood/checkin
 *
 * GET  — Returns today's mood score (if any) and show_checkin status.
 * POST — Stores a mood check-in, resets skip streak.
 * PATCH — Handles skip increment and reactivation.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

// ─── GET — Today's mood + visibility status ────────────────────────
export async function GET() {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // 1. Check if user did a check-in today (UTC date)
        const todayStart = new Date();
        todayStart.setUTCHours(0, 0, 0, 0);

        const { data: checkin } = await supabaseAdmin
            .from('mood_checkins')
            .select('mood')
            .eq('user_id', user.id)
            .gte('created_at', todayStart.toISOString())
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        // 2. Get show_checkin from user_profiles
        const { data: profile } = await supabaseAdmin
            .from('user_profiles')
            .select('show_checkin')
            .eq('user_id', user.id)
            .single();

        return NextResponse.json({
            todayMood: checkin?.mood ?? null,
            showCheckin: profile?.show_checkin ?? true,
        });
    } catch (error: unknown) {
        console.error('[mood/checkin] GET error:', error);
        // Fail-open: show overlay, no mood message
        return NextResponse.json({ todayMood: null, showCheckin: true });
    }
}

// ─── POST — Submit mood check-in ──────────────────────────────────
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { mood, context } = await request.json();

        if (!mood || mood < 1 || mood > 5) {
            return NextResponse.json({ error: 'Invalid mood (1-5)' }, { status: 400 });
        }

        // 1. Insert into mood_checkins (note: null — textarea removed in V2)
        const { error: insertError } = await supabaseAdmin
            .from('mood_checkins')
            .insert({
                user_id: user.id,
                mood,
                context: context || 'midday',
                note: null,
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

        // 3. Reset skip streak after successful check-in
        await supabaseAdmin
            .from('user_profiles')
            .update({ checkin_skip_streak: 0 })
            .eq('user_id', user.id);

        return NextResponse.json({ success: true, mood });
    } catch (error: unknown) {
        console.error('[mood/checkin] POST Fatal:', error);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}

// ─── PATCH — Skip or reactivate ───────────────────────────────────
export async function PATCH(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { action } = await request.json();

        if (action === 'skip') {
            // Get current streak
            const { data: profile } = await supabaseAdmin
                .from('user_profiles')
                .select('checkin_skip_streak')
                .eq('user_id', user.id)
                .single();

            const newStreak = (profile?.checkin_skip_streak ?? 0) + 1;
            const shouldHide = newStreak >= 5;

            await supabaseAdmin
                .from('user_profiles')
                .update({
                    checkin_skip_streak: newStreak,
                    ...(shouldHide ? { show_checkin: false } : {}),
                })
                .eq('user_id', user.id);

            return NextResponse.json({ hidden: shouldHide, streak: newStreak });
        }

        if (action === 'disable_forever') {
            await supabaseAdmin
                .from('user_profiles')
                .update({ show_checkin: false, checkin_skip_streak: 99 })
                .eq('user_id', user.id);

            return NextResponse.json({ hidden: true });
        }

        if (action === 'reactivate') {
            await supabaseAdmin
                .from('user_profiles')
                .update({ show_checkin: true, checkin_skip_streak: 0 })
                .eq('user_id', user.id);

            return NextResponse.json({ reactivated: true });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    } catch (error: unknown) {
        console.error('[mood/checkin] PATCH Fatal:', error);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
