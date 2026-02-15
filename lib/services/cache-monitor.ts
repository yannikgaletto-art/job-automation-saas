/**
 * CACHE MONITOR
 *
 * Tracks cache hit rates for company research to estimate cost savings.
 * In-memory storage (resets on server restart) is sufficient for this MVP.
 */

// In-memory counters
let cacheHits = 0;
let cacheMisses = 0;

/**
 * Record a successful cache hit (saved an API call)
 */
export function recordCacheHit() {
    cacheHits++;
}

/**
 * Record a cache miss (required an API call)
 */
export function recordCacheMiss() {
    cacheMisses++;
}

/**
 * Get current cache statistics
 */
export function getCacheStats() {
    const total = cacheHits + cacheMisses;
    const hitRate = total > 0 ? (cacheHits / total) * 100 : 0;

    // Perplexity API cost estimate (approx €0.02 per call)
    const estimatedSavings = cacheHits * 0.02;

    return {
        hits: cacheHits,
        misses: cacheMisses,
        total,
        hitRate: `${hitRate.toFixed(1)}%`,
        estimatedSavings: `€${estimatedSavings.toFixed(2)}`
    };
}
