/**
 * Production-Ready Rate Limiter — Upstash Redis Sliding Window
 *
 * Replaces `lib/api/rate-limit.ts` (in-memory, breaks on Vercel cold starts).
 * Uses Upstash Redis for distributed, serverless-safe rate limiting.
 *
 * FALLBACK: When UPSTASH_REDIS_URL is not set (local dev), all rate checks
 * pass through with a console warning — matching old in-memory behavior.
 *
 * Usage:
 *   import { rateLimiters, checkUpstashLimit } from '@/lib/api/rate-limit-upstash';
 *   const blocked = await checkUpstashLimit(rateLimiters.coverLetter, user.id);
 *   if (blocked) return blocked;
 */

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// ── Guard: Only create Redis if env vars present ───────────────────────────
const hasRedis = !!(process.env.UPSTASH_REDIS_URL?.trim() && process.env.UPSTASH_REDIS_TOKEN?.trim());

if (!hasRedis && process.env.NODE_ENV !== 'test') {
    console.warn(
        '[rate-limit-upstash] ⚠️ UPSTASH_REDIS_URL/TOKEN not set — rate limiting DISABLED. ' +
        'This is OK for local dev but MUST be configured on Vercel.'
    );
}

const redis = hasRedis
    ? new Redis({
        url: process.env.UPSTASH_REDIS_URL!,
        token: process.env.UPSTASH_REDIS_TOKEN!,
    })
    : null;

// ── Rate Limiter Factory ───────────────────────────────────────────────────
function createLimiter(prefix: string, requests: number, window: string): Ratelimit | null {
    if (!redis) return null;
    return new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(requests, window as Parameters<typeof Ratelimit.slidingWindow>[1]),
        prefix,
        analytics: true,
    });
}

// ── Rate Limiter Registry ──────────────────────────────────────────────────
// Each limiter has its own prefix → no key collisions.
// Limits match the previous in-memory values to avoid behavioral changes.

export const rateLimiters = {
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
};

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

