export const dynamic = 'force-dynamic';

/**
 * /api/mood/checkin
 *
 * GET  — Returns today's mood score (if any), show_checkin status,
 *         AND last_checkin_interaction_at (V2.3 — server-side once-per-day guard).
 * POST — Stores a mood check-in, resets skip streak, sets interaction timestamp.
 * PATCH — Handles skip, dismiss, disable_forever, and reactivate.
 *          All mutating actions set last_checkin_interaction_at = NOW().
 *
 * V2.3 Change:
 *   The 'dismiss' action has been added to PATCH. Previously, a backdrop-click
 *   dismiss only called setShowOverlay(false) on the client with NO server update.
 *   This meant logging out and back in would show the overlay again.
 *   Now, every interaction (including a silent dismiss) is persisted to the DB.
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

        // 2. Get show_checkin + last_checkin_interaction_at from user_profiles
        const { data: profile } = await supabaseAdmin
            .from('user_profiles')
            .select('show_checkin, last_checkin_interaction_at')
            .eq('user_id', user.id)
            .single();

        return NextResponse.json({
            todayMood: checkin?.mood ?? null,
            showCheckin: profile?.show_checkin ?? true,
            // V2.3: Returned to frontend for server-side once-per-day guard.
            // Frontend performs the local-timezone comparison (toDateString())
            // to avoid UTC/Europe timezone mismatches.
            lastInteractionAt: profile?.last_checkin_interaction_at ?? null,
        });
    } catch (error: unknown) {
        console.error('[mood/checkin] GET error:', error);
        // Fail-open: show overlay, no mood message
        return NextResponse.json({ todayMood: null, showCheckin: true, lastInteractionAt: null });
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

        // 1. Insert into mood_checkins
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

        // 3. Reset skip streak + set interaction timestamp (V2.3)
        await supabaseAdmin
            .from('user_profiles')
            .update({
                checkin_skip_streak: 0,
                last_checkin_interaction_at: new Date().toISOString(),
            })
            .eq('user_id', user.id);

        return NextResponse.json({ success: true, mood });
    } catch (error: unknown) {
        console.error('[mood/checkin] POST Fatal:', error);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}

// ─── PATCH — Skip, dismiss, disable_forever, reactivate ───────────
export async function PATCH(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { action } = await request.json();
        const now = new Date().toISOString();

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
                    last_checkin_interaction_at: now, // V2.3
                    ...(shouldHide ? { show_checkin: false } : {}),
                })
                .eq('user_id', user.id);

            return NextResponse.json({ hidden: shouldHide, streak: newStreak });
        }

        // V2.3: New 'dismiss' action — backdrop click or silent close.
        // Does NOT increment skip_streak (user didn't explicitly refuse).
        // Sets last_checkin_interaction_at so the overlay stays hidden all day.
        if (action === 'dismiss') {
            await supabaseAdmin
                .from('user_profiles')
                .update({ last_checkin_interaction_at: now })
                .eq('user_id', user.id);

            return NextResponse.json({ success: true });
        }

        if (action === 'disable_forever') {
            await supabaseAdmin
                .from('user_profiles')
                .update({
                    show_checkin: false,
                    checkin_skip_streak: 99,
                    last_checkin_interaction_at: now, // V2.3
                })
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
