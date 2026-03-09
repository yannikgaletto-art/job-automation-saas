/**
 * API Rate Limiter — Per-User Sliding Window
 *
 * In-memory implementation suitable for single-instance dev/staging.
 * For production on Vercel (serverless): replace with Upstash Redis
 * (@upstash/ratelimit) since in-memory state resets per cold start.
 *
 * Usage:
 *   const limiter = createRateLimiter({ maxRequests: 5, windowMs: 60_000 });
 *   const { allowed, remaining, retryAfterMs } = limiter.check(userId);
 */

interface RateLimitConfig {
    /** Max requests allowed in the window */
    maxRequests: number;
    /** Sliding window size in ms (default: 60_000 = 1 min) */
    windowMs: number;
}

interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    /** If blocked, ms until next window opens. 0 if allowed. */
    retryAfterMs: number;
}

interface RateLimiter {
    check: (userId: string) => RateLimitResult;
    /** Manual cleanup — prevents unbounded memory growth */
    cleanup: () => void;
}

// Store: userId → array of timestamps
const stores = new Map<string, Map<string, number[]>>();

// Auto-cleanup interval (every 5 min, prune expired entries)
let cleanupInterval: NodeJS.Timeout | null = null;

function ensureCleanup() {
    if (cleanupInterval) return;
    cleanupInterval = setInterval(() => {
        const now = Date.now();
        for (const [, store] of stores) {
            for (const [key, timestamps] of store) {
                const pruned = timestamps.filter(t => now - t < 300_000); // keep last 5 min
                if (pruned.length === 0) {
                    store.delete(key);
                } else {
                    store.set(key, pruned);
                }
            }
        }
    }, 300_000);
    // Don't keep process alive for cleanup
    if (cleanupInterval.unref) cleanupInterval.unref();
}

export function createRateLimiter(config: RateLimitConfig): RateLimiter {
    const { maxRequests, windowMs } = config;

    // Each limiter gets its own store (separate windows for different endpoints)
    const store = new Map<string, number[]>();
    const storeId = `limiter_${Date.now()}_${Math.random()}`;
    stores.set(storeId, store);
    ensureCleanup();

    return {
        check(userId: string): RateLimitResult {
            const now = Date.now();
            const windowStart = now - windowMs;

            // Get existing timestamps, prune expired
            const existing = store.get(userId) || [];
            const valid = existing.filter(t => t > windowStart);

            if (valid.length >= maxRequests) {
                // Blocked — calculate when the oldest entry in the window expires
                const oldestInWindow = valid[0];
                const retryAfterMs = (oldestInWindow + windowMs) - now;
                return {
                    allowed: false,
                    remaining: 0,
                    retryAfterMs: Math.max(0, retryAfterMs),
                };
            }

            // Allowed — record this request
            valid.push(now);
            store.set(userId, valid);

            return {
                allowed: true,
                remaining: maxRequests - valid.length,
                retryAfterMs: 0,
            };
        },

        cleanup() {
            store.clear();
            stores.delete(storeId);
        },
    };
}

/**
 * Helper: Apply rate limit check and return 429 response if blocked.
 * Returns null if allowed, or a Response object if blocked.
 *
 * Usage in API route:
 *   const blocked = checkRateLimit(cvMatchLimiter, user.id, 'cv/match');
 *   if (blocked) return blocked;
 */
export function checkRateLimit(
    limiter: RateLimiter,
    userId: string,
    endpointName: string
): Response | null {
    const { allowed, remaining, retryAfterMs } = limiter.check(userId);

    if (!allowed) {
        const retryAfterSeconds = Math.ceil(retryAfterMs / 1000);
        console.warn(`⚠️ [RateLimit] ${endpointName}: User ${userId.substring(0, 8)}… blocked (retry in ${retryAfterSeconds}s)`);

        return new Response(
            JSON.stringify({
                error: 'Zu viele Anfragen. Bitte warte kurz und versuche es erneut.',
                code: 'RATE_LIMIT_EXCEEDED',
                retryAfterSeconds,
            }),
            {
                status: 429,
                headers: {
                    'Content-Type': 'application/json',
                    'Retry-After': String(retryAfterSeconds),
                    'X-RateLimit-Remaining': '0',
                },
            }
        );
    }

    // Allowed — no response needed
    return null;
}
