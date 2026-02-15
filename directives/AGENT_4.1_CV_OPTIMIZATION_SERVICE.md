# 🤖 AGENT PROMPT: PHASE 4.1 — CV OPTIMIZATION SERVICE (Backend)

## MISSION
Verify, harden, and enhance the existing CV Optimization Service (`lib/services/cv-optimizer.ts`) and API route (`app/api/cv/optimize/route.ts`) to ensure production-readiness with proper error handling, database integration, cost tracking, and schema alignment.

---

## PREREQUISITES — READ FIRST! 🚨

**Before starting ANY work, you MUST read AND cross-reference these documents:**

1. **`docs/ARCHITECTURE.md`** — Study "STEP 4: CV Optimization" section and document processing pipeline
   - Understand how CV text is extracted and stored
   - Check data flow from document upload to optimization

2. **`docs/DESIGN_SYSTEM.md`** — Not directly relevant (backend service), but understand overall system

3. **`CLAUDE.md`** — **CRITICAL: "Reduce Complexity!"**
   - MVP-first: Focus on 3-5 high-impact improvements per CV
   - No over-engineering: Reuse existing patterns from company-enrichment
   - Keep prompt focused and deterministic

4. **`docs/MASTER_PLAN.md`** — Overall Roadmap
   - Phase 4 is marked as "Optional für MVP"
   - Check that Phase 1.3 (Document Processing) is complete
   - Verify Phase 5 dependencies

5. **`database/schema.sql`** — Database Schema
   - Lines 71-99: `documents` table structure
   - Check if `content` column exists for plain CV text
   - Verify `metadata` JSONB column for storing optimization results
   - Lines 142-174: `job_queue` table for job requirements integration

6. **`lib/services/document-processor.ts`** — Existing document extraction patterns

7. **`lib/services/cover-letter-generator.ts`** — Existing Claude integration patterns

8. **`lib/ai/model-router.ts`** — Model routing and cost tracking implementation

---

## EXECUTION PRINCIPLES

### 1. 🔍 Cross-Reference (Abgleich)
Before writing ANY code:
- Read ALL prerequisite docs listed above
- Check existing `cv-optimizer.ts` (113 lines) — Service EXISTS but needs hardening
- Check existing `app/api/cv/optimize/route.ts` (92 lines) — Route EXISTS but has schema issues
- Verify `documents` table has `content` field (or determine how to access CV text)
- Check `model-router.ts` for cost tracking patterns to reuse

### 2. 🧹 Reduce Complexity
- **MVP first** — Focus on: ATS keywords, bullet reordering, quantifications (already implemented!)
- **No premature optimization** — Don't add ML scoring; Claude analysis is sufficient
- **Reuse existing patterns** — Use same model-router as cover-letter-generator
- **Max 200 lines per file** — Current files are within limits

### 3. 📁 Proper Filing
- Service: `lib/services/cv-optimizer.ts` (✅ EXISTS — needs enhancement)
- API route: `app/api/cv/optimize/route.ts` (✅ EXISTS — needs fixes)
- Types: Export `CVOptimizationResult` interface for frontend reuse
- Update `docs/MASTER_PLAN.md` to mark Phase 4.1 complete

### 4. 🎖️ Senior Engineer Autonomy
- Fix schema issues in API route independently
- Add proper error handling without asking
- Implement cost tracking following existing patterns
- Document prompt engineering decisions with inline comments

### 5. 🧪 Interoperability Testing
After implementation, verify:
- [ ] `npx tsc --noEmit` passes (no new TypeScript errors)
- [ ] API route fetches CV text correctly from `documents` table
- [ ] Claude prompt generates structured output reliably
- [ ] Cost tracking logs to `generation_logs` table
- [ ] Error handling returns graceful fallbacks

### 6. ⚡ Efficiency
- Reuse existing Supabase client patterns
- Batch operations where possible
- Store optimization results in `documents.metadata` (no new table needed)
- Use temperature 0.2 for deterministic results (already set!)

### 7. 📝 Additional Standards
- **TypeScript strict** — No `any` types; properly type all functions
- **Error handling** — `try/catch` with graceful degradation
- **Logging** — Console logs with emoji prefixes (✅ ❌ ⚠️ 💾)
- **Cost tracking** — Log token usage to `generation_logs`
- **Imports** — Use `@/` path aliases consistently

---

## CURRENT STATE

### ✅ Already Exists
- `lib/services/cv-optimizer.ts` (113 lines) — **Core optimization logic implemented**
- `app/api/cv/optimize/route.ts` (92 lines) — **API route exists but has issues**
- Claude Sonnet 4.5 prompt engineering complete
- ATS scoring logic (0-100 scale) implemented
- Response parsing with metadata extraction works

### ⚠️ Issues to Fix
1. **Schema Mismatch in API Route:**
   - Code assumes `documents.content` exists for plain CV text
   - Schema shows `pii_encrypted` (BYTEA) and `metadata` (JSONB)
   - Need to verify: Does `content` column exist? If not, how to decrypt/access CV text?
   - Line 54 comment shows confusion about this

2. **No Cost Tracking:**
   - Service calls `complete()` from model-router but doesn't log to `generation_logs`
   - Should follow pattern from `cover-letter-generator.ts`

3. **No Storage of Results:**
   - API route returns result but doesn't persist anywhere
   - Should store in `documents.metadata.optimization` for history

4. **No Rate Limiting:**
   - Unbounded API calls possible
   - Should add rate limiting (Upstash Redis or in-memory fallback)

5. **Error Handling:**
   - Service has no timeout or retry logic
   - API route has basic try/catch but no graceful degradation

### ❌ Missing
- Integration with dashboard (Phase 4.2 will handle this)
- PDF download of optimized CV (Phase 4.2 will handle this)

---

## YOUR TASK

### 4.1.1: Fix Schema Alignment in API Route

**Goal:** Ensure API route correctly fetches CV text from `documents` table.

**Implementation:**

1. **Investigate Schema:**
   - Read `database/schema.sql` lines 71-99 carefully
   - Determine if `content` column exists or if we need to decrypt `pii_encrypted`
   - Check `lib/services/document-processor.ts` to see how text is stored

2. **Fix CV Text Retrieval:**
   ```typescript
   // Option A: If 'content' column exists
   const { data: cvDoc } = await supabase
       .from('documents')
       .select('id, content, metadata')
       .eq('user_id', userId)
       .eq('document_type', 'cv')
       .order('created_at', { ascending: false })
       .limit(1)
       .single();
   
   // Option B: If we need to decrypt pii_encrypted
   // Import decryption function from document-processor
   // Decrypt and extract text
   
   // Option C: If text is in metadata.extracted_text
   const cvText = cvDoc.metadata?.extracted_text || cvDoc.content || '';
   ```

3. **Add Field Validation:**
   - Verify CV text is not empty before calling `optimizeCV()`
   - Return clear error message if CV not found or empty

---

### 4.1.2: Add Cost Tracking

**Goal:** Log all optimization API calls to `generation_logs` table for cost monitoring.

**Implementation:**

1. **Study Existing Pattern:**
   - Read `lib/services/cover-letter-generator.ts` lines for logging example
   - Check `database/schema.sql` for `generation_logs` table structure (lines 203-218)

2. **Add Logging to Service:**
   ```typescript
   import { createClient } from '@/lib/supabase/server';
   
   export async function optimizeCV(request: CVOptimizationRequest): Promise<CVOptimizationResult> {
       const startTime = Date.now();
       
       try {
           const result = await complete({
               taskType: 'optimize_cv',
               prompt,
               temperature: 0.2,
               maxTokens: 4000,
           });
           
           // Log to generation_logs
           const supabase = createClient();
           await supabase.from('generation_logs').insert({
               user_id: request.userId, // Add userId to request interface
               job_id: request.jobId, // Add jobId to request interface
               generation_type: 'cv_optimization',
               model_used: result.model || 'claude-sonnet-4.5',
               prompt_tokens: result.usage?.prompt_tokens || 0,
               completion_tokens: result.usage?.completion_tokens || 0,
               total_tokens: result.usage?.total_tokens || 0,
               cost_usd: result.cost || 0,
               latency_ms: Date.now() - startTime,
               success: true,
           });
           
           return parseOptimizationResult(result.text);
           
       } catch (error) {
           // Log failed attempt
           const supabase = createClient();
           await supabase.from('generation_logs').insert({
               user_id: request.userId,
               job_id: request.jobId,
               generation_type: 'cv_optimization',
               success: false,
               error_message: error.message,
               latency_ms: Date.now() - startTime,
           });
           
           throw error;
       }
   }
   ```

3. **Update Interface:**
   ```typescript
   export interface CVOptimizationRequest {
       userId: string;  // ADD THIS
       jobId?: string;  // ADD THIS (optional)
       cvText: string;
       jobTitle: string;
       jobRequirements: string[];
       jobDescription: string;
   }
   ```

---

### 4.1.3: Store Optimization Results

**Goal:** Persist optimization results in `documents.metadata` for user history.

**Implementation:**

1. **Update API Route:**
   ```typescript
   // After optimizeCV() call succeeds
   const result = await optimizeCV({
       userId,
       jobId,
       cvText,
       jobTitle: job.job_title,
       jobRequirements: job.requirements || [],
       jobDescription: job.description || '',
   });
   
   // Store result in documents.metadata
   await supabase
       .from('documents')
       .update({
           metadata: {
               ...cvDoc.metadata,
               last_optimization: {
                   timestamp: new Date().toISOString(),
                   job_id: jobId,
                   ats_score: result.atsScore,
                   changes_log: result.changesLog,
                   optimized_cv: result.optimizedCV,
               }
           }
       })
       .eq('id', cvDoc.id);
   ```

2. **Handle Multiple Optimizations:**
   - Store as array `optimization_history: []` if user wants to track multiple versions
   - Or keep only `last_optimization` (simpler for MVP)

---

### 4.1.4: Add Error Handling & Rate Limiting

**Goal:** Make service resilient to failures and prevent API abuse.

**Implementation:**

1. **Add Timeout to Service:**
   ```typescript
   const result = await Promise.race([
       complete({ ... }),
       new Promise((_, reject) => 
           setTimeout(() => reject(new Error('Timeout')), 30000)
       )
   ]);
   ```

2. **Add Retry Logic:**
   ```typescript
   async function optimizeCVWithRetry(request: CVOptimizationRequest, retries = 2): Promise<CVOptimizationResult> {
       try {
           return await optimizeCV(request);
       } catch (error) {
           if (retries > 0 && isRetryableError(error)) {
               console.warn(`⚠️ Retry ${3 - retries}/2 for CV optimization`);
               await new Promise(resolve => setTimeout(resolve, 1000 * (3 - retries))); // Exponential backoff
               return optimizeCVWithRetry(request, retries - 1);
           }
           throw error;
       }
   }
   
   function isRetryableError(error: any): boolean {
       return error.status === 429 || error.status === 503 || error.message.includes('timeout');
   }
   ```

3. **Add Rate Limiting to API Route:**
   ```typescript
   import { Ratelimit } from '@upstash/ratelimit';
   import { Redis } from '@upstash/redis';
   
   // Check if Upstash is configured
   const ratelimit = process.env.UPSTASH_REDIS_REST_URL
       ? new Ratelimit({
           redis: Redis.fromEnv(),
           limiter: Ratelimit.slidingWindow(5, '1 h'), // 5 optimizations per hour
           analytics: true,
       })
       : null;
   
   export async function POST(req: NextRequest) {
       const { userId, jobId } = await req.json();
       
       // Rate limiting
       if (ratelimit) {
           const { success, remaining } = await ratelimit.limit(`cv_optimize:${userId}`);
           if (!success) {
               return NextResponse.json(
                   { error: 'Rate limit exceeded. Try again in 1 hour.' },
                   { status: 429 }
               );
           }
           console.log(`💾 Rate limit: ${remaining} optimizations remaining for user ${userId}`);
       }
       
       // ... rest of logic
   }
   ```

4. **Graceful Degradation:**
   ```typescript
   try {
       const result = await optimizeCVWithRetry({ userId, jobId, ... });
       return NextResponse.json(result);
   } catch (error) {
       console.error('❌ CV Optimization failed:', error);
       
       // Return partial result if possible
       return NextResponse.json({
           error: 'Optimization failed',
           details: error.message,
           fallback: {
               optimizedCV: cvText, // Return original
               atsScore: 0,
               changesLog: { added_keywords: [], reordered_bullets: 0, quantifications_added: 0 }
           }
       }, { status: 500 });
   }
   ```

---

### 4.1.5: Prompt Engineering Refinement

**Goal:** Ensure Claude prompt generates consistent, structured output.

**Current Prompt Analysis:**
- ✅ Good: Clear rules, structured output format, low temperature
- ⚠️ Issue: Metadata parsing is fragile (searches from bottom up)
- ⚠️ Issue: No JSON output format — relies on custom string parsing

**Enhancement:**
```typescript
const prompt = `You are a professional CV optimizer. Analyze and optimize this CV for ATS systems and the target job.

**CRITICAL RULES:**
1. ✅ KEEP ALL FACTS TRUTHFUL - NO hallucinations or invented experience
2. ✅ Reorder bullet points (most job-relevant first)
3. ✅ Add ATS keywords from job description (only if truthfully applicable)
4. ✅ Quantify achievements where possible (if data exists in original)
5. ✅ Keep total length under 2 pages
6. ❌ NEVER invent experience, projects, or skills
7. ❌ NEVER change dates, company names, or titles
8. ❌ NEVER add achievements that didn't happen

**ORIGINAL CV:**
${request.cvText}

**TARGET JOB:**
Title: ${request.jobTitle}
Requirements: ${request.jobRequirements.join(', ')}
Description: ${request.jobDescription}

**YOUR TASK:**
1. Identify which sections are most relevant to this job
2. Reorder bullet points (most relevant first, keep others)
3. Bold matching keywords in Markdown (**keyword**)
4. Add section headers if missing (Experience, Skills, Education)
5. Ensure ATS-friendly format (simple Markdown, no tables/graphics)

**OUTPUT FORMAT (STRICT):**
First, output the optimized CV in clean Markdown format.

Then, on NEW LINES at the very end, output these metrics:
---METRICS---
ADDED_KEYWORDS: keyword1, keyword2, keyword3
REORDERED_BULLETS: <number>
QUANTIFICATIONS: <number>
ATS_SCORE: <0-100>
---END---

Example:
---METRICS---
ADDED_KEYWORDS: React, TypeScript, REST APIs
REORDERED_BULLETS: 8
QUANTIFICATIONS: 3
ATS_SCORE: 78
---END---`;

// Then update parsing logic to look for ---METRICS--- delimiter
```

---

## VERIFICATION CHECKLIST

- [ ] All prerequisite docs read and cross-referenced
- [ ] Schema alignment verified — CV text retrieval works
- [ ] `CVOptimizationRequest` interface updated with `userId` and `jobId`
- [ ] Cost tracking logs to `generation_logs` table
- [ ] Optimization results stored in `documents.metadata`
- [ ] Timeout (30s) and retry logic (2x) implemented
- [ ] Rate limiting active (5 per hour per user)
- [ ] Graceful degradation returns original CV on failure
- [ ] Prompt generates structured output reliably
- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] Browser test: POST to `/api/cv/optimize` works on localhost:3000
- [ ] `docs/MASTER_PLAN.md` Phase 4.1 tasks marked complete

---

## SUCCESS CRITERIA

✅ API route correctly fetches CV text (no schema errors)  
✅ Service logs all API calls to `generation_logs` with token counts and cost  
✅ Optimization results persist in `documents.metadata.last_optimization`  
✅ Service handles API timeouts and retries gracefully (max 2 retries)  
✅ Rate limiting prevents abuse (5 optimizations per hour per user)  
✅ Failed optimizations return original CV as fallback (no blank response)  
✅ ATS score is realistic (60-85 range, not always 90+)  
✅ No breaking changes to existing document processing  
✅ Cost per optimization logged (target: <€0.015 per CV)

---

## EXECUTION ORDER

1. **Read all prerequisite documents** (20 min)
   - Understand document-processor patterns
   - Study cover-letter-generator logging
   - Check schema for `documents` and `generation_logs` tables

2. **Fix Schema Alignment (4.1.1)** (30 min)
   - Investigate `documents` table structure
   - Fix CV text retrieval in API route
   - Test with sample document

3. **Add Cost Tracking (4.1.2)** (45 min)
   - Update `CVOptimizationRequest` interface
   - Add logging to service
   - Test log insertion

4. **Store Results (4.1.3)** (20 min)
   - Update API route to persist optimization
   - Test metadata update

5. **Error Handling & Rate Limiting (4.1.4)** (1 hour)
   - Add timeout and retry logic
   - Implement rate limiting
   - Test failure scenarios

6. **Refine Prompt (4.1.5)** (30 min)
   - Improve output format for reliable parsing
   - Test with edge cases (empty CV, malformed text)

7. **Integration Testing** (30 min)
   - Test full flow: Fetch CV → Optimize → Store → Return
   - Verify cost tracking logs correctly
   - Check error handling works

8. **Update Documentation** (10 min)
   - Mark Phase 4.1 complete in `docs/MASTER_PLAN.md`
   - Add optimization architecture notes

---

## ⚠️ PARALLELISIERUNGS-HINWEIS

✅ **Can run PARALLEL with Phase 4.2** — Backend is independent of frontend components  
✅ **Can run PARALLEL with Phase 5** — Cover letter generation doesn't depend on CV optimization  
❌ **Cannot run parallel with Phase 1.3** — Requires document-processor to be complete  
⚠️ **Should run BEFORE Phase 4.2** — Frontend needs working API to integrate

---

**Estimated Time:** 3-4 hours total for complete Phase 4.1 backend implementation  
**Priority:** Optional for MVP (see `MASTER_PLAN.md`)  
**Dependencies:** Phase 1.3 (Document Processing) must be complete

Viel Erfolg! 🚀
