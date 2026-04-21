/**
 * Production-Ready Rate Limiter — Upstash Redis Sliding Window
 *
 * Replaces `lib/api/rate-limit.ts` (in-memory, breaks on Vercel cold starts).
 * Uses Upstash Redis for distributed, serverless-safe rate limiting.
 *
 * FALLBACK: When UPSTASH_REDIS_URL is not set (local dev), all rate checks
 * pass through with a console warning — matching old in-memory behavior.
 *
 * LAZY INIT: Redis connection and rate limiters are created on first use,
 * not at module import time — prevents Vercel build failures.
 *
 * Usage:
 *   import { rateLimiters, checkUpstashLimit } from '@/lib/api/rate-limit-upstash';
 *   const blocked = await checkUpstashLimit(rateLimiters.coverLetter, user.id);
 *   if (blocked) return blocked;
 */

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// ── Lazy Singleton — created on first access ──────────────────────────────
let _redis: Redis | null | undefined;
let _limiters: Record<string, Ratelimit | null> | undefined;

/** Strip accidental quotes from env var values (common copy-paste error) */
function cleanEnv(val: string | undefined): string {
    return (val ?? '').trim().replace(/^["']|["']$/g, '');
}

function getRedis(): Redis | null {
    if (_redis !== undefined) return _redis;

    const url = cleanEnv(process.env.UPSTASH_REDIS_URL);
    const token = cleanEnv(process.env.UPSTASH_REDIS_TOKEN);

    if (!url || !token) {
        if (process.env.NODE_ENV !== 'test') {
            console.warn(
                '[rate-limit-upstash] ⚠️ UPSTASH_REDIS_URL/TOKEN not set — rate limiting DISABLED. ' +
                'This is OK for local dev but MUST be configured on Vercel.'
            );
        }
        _redis = null;
        return null;
    }

    _redis = new Redis({ url, token });
    return _redis;
}

// ── Rate Limiter Factory ───────────────────────────────────────────────────
function createLimiter(prefix: string, requests: number, window: string): Ratelimit | null {
    const redis = getRedis();
    if (!redis) return null;
    return new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(requests, window as Parameters<typeof Ratelimit.slidingWindow>[1]),
        prefix,
        analytics: true,
    });
}

// ── Rate Limiter Registry (lazy — built on first property access) ──────────
function getLimiters() {
    if (_limiters) return _limiters;
    _limiters = {
        // AI-powered endpoints (protect API spend)
        cvMatch: createLimiter('rl:cv-match', 5, '1 m'),
        cvOptimize: createLimiter('rl:cv-optimize', 3, '1 m'),
        cvBullet: createLimiter('rl:cv-bullet', 10, '1 m'),
        coverLetter: createLimiter('rl:cover-letter', 3, '1 m'),
        videoScript: createLimiter('rl:video-script', 3, '1 m'),

        // User interaction endpoints
        feedback: createLimiter('rl:feedback', 3, '10 m'),
        transcribe: createLimiter('rl:transcribe', 20, '10 m'),
        jobSearch: createLimiter('rl:job-search', 10, '1 m'),

        // Public endpoints (keyed by IP hash, not user ID)
        waitlist: createLimiter('rl:waitlist', 3, '1 m'),

        // Coaching endpoints (previously unprotected — cost protection)
        coachingMessage: createLimiter('rl:coaching-msg', 15, '1 m'),
        coachingTranscribe: createLimiter('rl:coaching-transcribe', 20, '10 m'),

        // Job ingest (time-based, complements max-5-active guard)
        jobIngest: createLimiter('rl:job-ingest', 5, '1 m'),

        // DSGVO self-service endpoints (abuse protection)
        accountDelete: createLimiter('rl:account-delete', 1, '10 m'),
        dataExport: createLimiter('rl:data-export', 3, '10 m'),

        // ── Trial Hardening (2026-04-21) ──────────────────────────────
        // Previously unprotected AI-calling routes — cost-spike protection
        quotes: createLimiter('rl:quotes', 5, '1 m'),
        roleResearch: createLimiter('rl:role-research', 5, '1 m'),
        resolvePersonas: createLimiter('rl:resolve-personas', 5, '1 m'),
        briefing: createLimiter('rl:briefing', 5, '1 m'),
        jobExtract: createLimiter('rl:job-extract', 5, '1 m'),
        jobEnrich: createLimiter('rl:job-enrich', 5, '1 m'),
        suggestTitles: createLimiter('rl:suggest-titles', 5, '1 m'),
        talkingPoints: createLimiter('rl:talking-points', 5, '1 m'),
        jobSearchProcess: createLimiter('rl:job-search-process', 10, '1 m'),
    };
    return _limiters;
}

/** Lazy proxy — `rateLimiters.coverLetter` triggers init on first access */
export const rateLimiters = new Proxy({} as Record<string, Ratelimit | null>, {
    get(_target, prop: string) {
        return getLimiters()[prop] ?? null;
    },
});

// ── Helper — Drop-in replacement for old `checkRateLimit()` ────────────────
/**
 * Returns a 429 Response if the rate limit is exceeded, or null if allowed.
 * When Redis is unavailable (null limiter), allows ALL requests (dev mode).
 *
 * Drop-in compatible with the old `checkRateLimit()` call pattern:
 *   const blocked = await checkUpstashLimit(rateLimiters.coverLetter, user.id);
 *   if (blocked) return blocked;
 */
export async function checkUpstashLimit(
    limiter: Ratelimit | null,
    identifier: string,
): Promise<Response | null> {
    // Graceful degradation: no Redis → allow all (local dev)
    if (!limiter) return null;

    const { success, limit, reset, remaining } = await limiter.limit(identifier);

    if (!success) {
        const retryAfterSeconds = Math.max(1, Math.ceil((reset - Date.now()) / 1000));

        return new Response(
            JSON.stringify({
                error: 'rate_limit_exceeded',
                code: 'RATE_LIMIT_EXCEEDED',
                retryAfterSeconds,
            }),
            {
                status: 429,
                headers: {
                    'Content-Type': 'application/json',
                    'Retry-After': String(retryAfterSeconds),
                    'X-RateLimit-Limit': String(limit),
                    'X-RateLimit-Remaining': String(remaining),
                    'X-RateLimit-Reset': String(reset),
                },
            },
        );
    }

    return null;
}

