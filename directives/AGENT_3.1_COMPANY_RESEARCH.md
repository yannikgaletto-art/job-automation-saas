# 🤖 AGENT PROMPT: PHASE 3.1 — COMPANY RESEARCH SERVICE (Backend)

## MISSION
Verify, harden, and enhance the existing Company Research Service (`lib/services/company-enrichment.ts`) to ensure production-readiness: proper error handling, schema alignment, Perplexity Sonar Pro integration, and robust caching.

## PREREQUISITES — READ FIRST! 🚨

1. **`docs/ARCHITECTURE.md`** — Study "STEP 3: Company Intelligence" section
2. **`docs/DESIGN_SYSTEM.md`** — Not directly relevant (backend), but understand data flow
3. **`CLAUDE.md`** — "Reduce Complexity!" — Don't over-engineer the enrichment
4. **`database/schema.sql`** (Lines 237-268) — `company_research` table structure
5. **`directives/company_research.md`** — Original directive for this service
6. **`directives/MASTER_PROMPT_TEMPLATE.md`** — Follow all 7 Execution Principles

## CURRENT STATE
- ✅ `lib/services/company-enrichment.ts` EXISTS (264 lines) — Core logic implemented
- ✅ `lib/services/quote-matcher.ts` EXISTS (156 lines) — Quote suggestion logic done
- ✅ Perplexity Sonar Pro integration working
- ✅ 7-day cache with `expires_at` column
- ⚠️ Schema mismatch: code references `company_name`/`company_slug` but `job_queue` only has `company`
- ⚠️ `linkedin_activity` extraction prompt could be more specific
- ⚠️ No rate limiting on Perplexity calls
- ⚠️ Confidence scoring is basic (binary 0.2-0.3 per field)

## YOUR TASK

### 3.1.1: Schema Alignment Audit
**Goal:** Ensure `company-enrichment.ts` queries match `database/schema.sql` exactly.

**Implementation:**
1. Verify `company_research` table columns match code:
   ```typescript
   // Schema has:
   // company_name TEXT NOT NULL
   // intel_data JSONB
   // suggested_quotes JSONB[]
   // recent_news JSONB[]
   // linkedin_activity JSONB[]
   // perplexity_citations JSONB[]
   // researched_at TIMESTAMPTZ
   // expires_at TIMESTAMPTZ (DEFAULT NOW() + 7 days)
   ```
2. Fix any column name mismatches between `job_queue.company` and code's `company_name`/`company_slug` references.

### 3.1.2: Error Handling Hardening
**Goal:** Make the service resilient to API failures without crashing the pipeline.

**Implementation:**
1. Add timeout to Perplexity fetch (max 15 seconds)
2. Add retry logic (max 2 retries with exponential backoff)
3. Graceful degradation: If Perplexity fails, return empty enrichment with `confidence_score: 0`
4. Log all API calls with cost tracking

### 3.1.3: Perplexity Prompt Refinement
**Goal:** Improve data quality from Perplexity responses.

**Implementation:**
1. Be more explicit about LinkedIn post format
2. Ask for `citations` array from Perplexity
3. Store citations in `perplexity_citations` column
4. Add German-language company detection (many users are DACH region)

### 3.1.4: Rate Limiting
**Goal:** Prevent exceeding Perplexity API limits.

**Implementation:**
1. Check if Upstash Redis is available (it's in `package.json`)
2. If available: Use `@upstash/ratelimit` (max 10 calls/minute)
3. If not: Use simple in-memory counter as fallback

## VERIFICATION CHECKLIST
- [ ] All `company_research` column references match schema.sql
- [ ] `enrichCompany()` handles Perplexity timeout gracefully
- [ ] `enrichCompany()` retries on transient errors (max 2x)
- [ ] Confidence scoring is accurate (not all-or-nothing)
- [ ] Citations are extracted and stored
- [ ] `npx tsc --noEmit` passes
- [ ] Rate limiting prevents API abuse

## SUCCESS CRITERIA
✅ Schema alignment verified (no column mismatches)
✅ Service handles API failures without crashing
✅ Perplexity citations stored for transparency
✅ Rate limiting active
✅ No breaking changes to `api/jobs/process` route

## EXECUTION ORDER
1. Read all prerequisite documents
2. Audit schema alignment (3.1.1)
3. Harden error handling (3.1.2)
4. Refine Perplexity prompt (3.1.3)
5. Add rate limiting (3.1.4)
6. Run `npx tsc --noEmit`
7. Test via `api/jobs/process` endpoint

## ⚠️ PARALLELISATION
✅ **Can run PARALLEL with 3.3 and 3.4** — Backend changes don't affect frontend rendering.
❌ **Cannot run parallel with 3.2** — `quote-matcher.ts` imports depend on enrichment output types.
