# 🤖 AGENT PROMPT: PHASE 3.4 — CACHE MANAGEMENT

## MISSION
Verify and enhance the 7-day TTL caching system for company research data. Implement cache hit rate monitoring and ensure the automatic cleanup (via `pg_cron`) is properly configured.

## PREREQUISITES — READ FIRST! 🚨

1. **`database/schema.sql`** (Lines 237-268) — `company_research` table + `cleanup_expired_research()` function
2. **`CLAUDE.md`** — "Reduce Complexity!" — Cache is already partially built, just verify and monitor
3. **`lib/services/company-enrichment.ts`** (Lines 23-60) — Existing `checkCache()` function
4. **`directives/MASTER_PROMPT_TEMPLATE.md`** — Follow all 7 Execution Principles

## CURRENT STATE
- ✅ `company_research.expires_at` column exists (DEFAULT NOW() + 7 days)
- ✅ `cleanup_expired_research()` SQL function exists
- ✅ `pg_cron` job scheduled: `'0 2 * * *'` (daily at 02:00)
- ✅ `checkCache()` in `company-enrichment.ts` checks `expires_at > NOW()`
- ✅ `saveToCache()` uses `upsert` on `company_name` (unique constraint)
- ⚠️ No cache hit rate monitoring
- ⚠️ No manual cache invalidation endpoint
- ⚠️ No cache statistics for admin dashboard

## YOUR TASK

### 3.4.1: Cache TTL Verification
**Goal:** Ensure the 7-day TTL works end-to-end.

**Implementation:**
1. Verify `expires_at` is set correctly on insert (NOW() + 7 days)
2. Verify `checkCache()` correctly filters expired entries
3. Verify `cleanup_expired_research()` deletes expired rows
4. Add logging to cache operations:
   ```typescript
   console.log(`✅ Cache HIT: ${companyName} (expires in ${daysUntilExpiry} days)`)
   console.log(`❌ Cache MISS: ${companyName}`)
   console.log(`💾 Cache WRITE: ${companyName} (TTL: 7 days)`)
   ```

### 3.4.2: Cache Hit Rate Monitoring
**Goal:** Track how often the cache saves API calls to Perplexity.

**Implementation:**
1. Create `lib/services/cache-monitor.ts`:
   ```typescript
   // In-memory counters (reset on server restart)
   let cacheHits = 0
   let cacheMisses = 0

   export function recordCacheHit() { cacheHits++ }
   export function recordCacheMiss() { cacheMisses++ }

   export function getCacheStats() {
     const total = cacheHits + cacheMisses
     return {
       hits: cacheHits,
       misses: cacheMisses,
       total,
       hitRate: total > 0 ? (cacheHits / total * 100).toFixed(1) + '%' : 'N/A',
       estimatedSavings: `€${(cacheHits * 0.02).toFixed(2)}` // €0.02 per Perplexity call
     }
   }
   ```
2. Integrate into `company-enrichment.ts`:
   - Call `recordCacheHit()` on cache hit
   - Call `recordCacheMiss()` on cache miss
3. Expose via existing `api/admin/cost-report` route

### 3.4.3: Manual Cache Invalidation
**Goal:** Allow admins to force-refresh company data.

**Implementation:**
1. Add optional `forceRefresh` parameter to `enrichCompany()`:
   ```typescript
   export async function enrichCompany(
     companySlug: string,
     companyName: string,
     forceRefresh: boolean = false
   ): Promise<EnrichmentResult> {
     if (!forceRefresh) {
       const cached = await checkCache(companyName)
       if (cached) return cached
     }
     // ... fetch fresh data
   }
   ```
2. Optionally: Add `DELETE /api/admin/cache/:company` route (low priority)

### 3.4.4: Cache Cleanup Verification
**Goal:** Confirm `pg_cron` job works and expired data is removed.

**Implementation:**
1. Verify `pg_cron` extension is enabled in Supabase
2. Document the cron schedule in `.env.example` or `docs/`
3. Add a note about running `SELECT cleanup_expired_research()` manually if pg_cron is unavailable

## VERIFICATION CHECKLIST
- [ ] Cache TTL confirmed: data expires after 7 days
- [ ] `checkCache()` correctly filters expired entries
- [ ] Cache hit/miss monitoring implemented
- [ ] `forceRefresh` parameter added to `enrichCompany()`
- [ ] Cache stats exposed in admin cost report
- [ ] `pg_cron` cleanup documented
- [ ] `npx tsc --noEmit` passes
- [ ] No breaking changes to `enrichCompany()` signature (backward compatible)

## SUCCESS CRITERIA
✅ 7-day TTL works correctly (verified with test data)
✅ Cache hit rate tracked and visible to admins
✅ Manual cache refresh possible for individual companies
✅ Cleanup runs automatically daily at 02:00
✅ Estimated API cost savings calculated

## EXECUTION ORDER
1. Read schema.sql cache-related sections
2. Verify TTL logic (3.4.1)
3. Implement cache monitoring (3.4.2)
4. Add `forceRefresh` parameter (3.4.3)
5. Verify cleanup (3.4.4)
6. Integrate stats into admin report
7. Run `npx tsc --noEmit`

## ⚠️ PARALLELISIERUNG
✅ **Can run PARALLEL with 3.2 and 3.3**
⚠️ **Light dependency on 3.1** — If 3.1 changes `enrichCompany()` signature, adjust accordingly
