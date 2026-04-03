/**
 * GET /api/health
 * 
 * Public healthcheck endpoint for uptime monitoring.
 * No authentication required — designed for UptimeRobot / Vercel Monitoring.
 * 
 * Response: { status: "ok" | "degraded", version, timestamp }
 * HTTP 200 = healthy, HTTP 503 = degraded
 * 
 * DB result is cached for 30s to avoid connection-pool exhaustion from
 * high-frequency monitor pings.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Simple in-memory cache for DB ping result (30s TTL)
let dbCacheResult: { ok: boolean; checkedAt: number } | null = null;
const DB_CACHE_TTL_MS = 30_000;

async function checkDbConnection(): Promise<boolean> {
    const now = Date.now();
    if (dbCacheResult && (now - dbCacheResult.checkedAt) < DB_CACHE_TTL_MS) {
        return dbCacheResult.ok;
    }

    try {
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );
        // Lightweight query — counts 0 rows, no full table scan
        const { error } = await supabase
            .from('user_profiles')
            .select('id', { count: 'exact', head: true })
            .limit(0);

        const ok = !error;
        dbCacheResult = { ok, checkedAt: now };
        return ok;
    } catch {
        dbCacheResult = { ok: false, checkedAt: now };
        return false;
    }
}

export async function GET() {
    const dbOk = await checkDbConnection();
    const version = process.env.npm_package_version || '2.0.0';

    const body = {
        status: dbOk ? 'ok' : 'degraded',
        version,
        timestamp: new Date().toISOString(),
        checks: {
            database: dbOk ? 'connected' : 'unreachable',
        },
    };

    return NextResponse.json(body, {
        status: dbOk ? 200 : 503,
        headers: {
            'Cache-Control': 'no-store, max-age=0',
        },
    });
}
