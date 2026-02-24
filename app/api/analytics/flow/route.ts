export const dynamic = 'force-dynamic';

/**
 * GET /api/analytics/flow
 * Single endpoint for all analytics data: heatmap, momentum, funnel, energy timeline.
 * Returns partial data on errors (200, not 500).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const days = parseInt(searchParams.get('days') ?? '30');
        const since = new Date(Date.now() - days * 86400000).toISOString();

        // 1. Heatmap (aggregated view — all time for better patterns)
        const { data: heatmap, error: heatmapErr } = await supabaseAdmin
            .from('pomodoro_heatmap')
            .select('day_of_week, hour_of_day, session_count, completed_count, avg_energy')
            .eq('user_id', user.id);

        if (heatmapErr) console.error('[analytics/flow] Heatmap error:', heatmapErr);

        // 2. Momentum (sessions in range, for sparkline + score)
        const { data: momentum, error: momErr } = await supabaseAdmin
            .from('pomodoro_sessions')
            .select('started_at, completed, duration_min, energy_level')
            .eq('user_id', user.id)
            .gte('started_at', since)
            .order('started_at', { ascending: true });

        if (momErr) console.error('[analytics/flow] Momentum error:', momErr);

        // 3. Funnel (job status distribution)
        const { data: funnel, error: funnelErr } = await supabaseAdmin
            .from('job_queue')
            .select('status')
            .eq('user_id', user.id);

        if (funnelErr) console.error('[analytics/flow] Funnel error:', funnelErr);

        // 4. Energy timeline (sessions with energy, for resonance chart)
        const { data: energyTimeline, error: energyErr } = await supabaseAdmin
            .from('pomodoro_sessions')
            .select('started_at, energy_level, completed')
            .eq('user_id', user.id)
            .not('energy_level', 'is', null)
            .gte('started_at', since)
            .order('started_at', { ascending: true })
            .limit(200);

        if (energyErr) console.error('[analytics/flow] Energy error:', energyErr);

        return NextResponse.json({
            heatmap: heatmap ?? [],
            momentum: momentum ?? [],
            funnel: funnel ?? [],
            energyTimeline: energyTimeline ?? [],
        });
    } catch (error: unknown) {
        console.error('[analytics/flow] Fatal:', error);
        return NextResponse.json({
            heatmap: [], momentum: [], funnel: [], energyTimeline: [],
            _error: 'Partial data — check server logs',
        }, { status: 200 });
    }
}
