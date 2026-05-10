export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
    aggregateInitiativTriggers,
    persistTriggersToDB,
    INITIATIV_RSS_SOURCES,
} from '@/lib/services/initiativ-rss-aggregator';

/**
 * Manual-Trigger für den Initiativ-RSS-Aggregator (Dev/Bootstrap).
 *
 * Auth: Header `X-Pathly-Admin-Secret` muss `INITIATIV_AGGREGATE_TRIGGER_SECRET`
 * matchen. Kein User-Login erforderlich — dev-only Endpoint zum manuellen
 * Befüllen der `initiativ_triggers`-Tabelle ohne 24h Cron-Wartezeit.
 *
 * Im Production-Cron (`initiativRssAggregator`) läuft täglich 07:00 Berlin
 * automatisch. Diese Route ist nur als Bootstrap-Helper.
 */

const SECRET_HEADER = 'x-pathly-admin-secret';

function unauthorized() {
    return NextResponse.json(
        { error: 'unauthorized', hint: 'set X-Pathly-Admin-Secret header' },
        { status: 401 },
    );
}

export async function POST(request: NextRequest) {
    const expectedSecret = process.env.INITIATIV_AGGREGATE_TRIGGER_SECRET;
    if (!expectedSecret) {
        return NextResponse.json(
            { error: 'not_configured', hint: 'set INITIATIV_AGGREGATE_TRIGGER_SECRET in env' },
            { status: 503 },
        );
    }

    const providedSecret = request.headers.get(SECRET_HEADER);
    if (!providedSecret || providedSecret !== expectedSecret) {
        return unauthorized();
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
        return NextResponse.json(
            { error: 'supabase_not_configured' },
            { status: 503 },
        );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

    try {
        const start = Date.now();
        const triggers = await aggregateInitiativTriggers();
        const persistResult = await persistTriggersToDB(triggers, supabaseAdmin);
        const ms = Date.now() - start;

        return NextResponse.json({
            success: true,
            sources: INITIATIV_RSS_SOURCES.length,
            fetched: triggers.length,
            ...persistResult,
            elapsedMs: ms,
        });
    } catch (error) {
        console.error('[initiativ/aggregate] failed:', error);
        return NextResponse.json(
            { error: 'aggregate_failed', detail: (error as Error).message },
            { status: 500 },
        );
    }
}
