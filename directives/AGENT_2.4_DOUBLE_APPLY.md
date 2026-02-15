# AGENT PROMPT: PHASE 2.4 - DOUBLE-APPLY PREVENTION

## MISSION
Implement a robust double-application prevention system to ensure users never apply to the same job twice or to similar roles at the same company within a cooldown period.

## PREREQUISITES - READ FIRST! 🚨

**Before starting ANY work, you MUST read these documents:**

1. **`docs/ARCHITECTURE.md`**
   - Review "STEP 2: Job Processing" implementation
   - Understand the `application_history` and `job_queue` relationship
   - Check `pg_trgm` extension usage for fuzzy matching

2. **`database/schema.sql`** (Lines 274-348)
   - **CRITICAL**: The `application_history` table and `prevent_double_apply` trigger ALREADY EXIST in schema!
   - Understand the logic:
     - Exact URL Match (MD5 hash) -> 30 days cooldown
     - Same Company + Fuzzy Title Match -> 90 days cooldown

3. **`CLAUDE.md`**
   - "Reduce Complexity!" - Leverage the existing database triggers where possible
   - Don't over-engineer client-side checks if the DB handles it

4. **`docs/MASTER_PLAN.md`**
   - Review Phase 2.4 requirements

## CURRENT STATE

- ✅ Database schema (`application_history`) includes `url_hash`, `company_slug`, and `prevent_double_apply` trigger.
- ⚠️ No service logic to expose this prevention before insertion.
- ⚠️ No UI feedback to warn the user *before* they spend credits/time.
- ⚠️ `app/api/jobs/process/route.ts` does not check for duplicates (it just processes).

## YOUR TASK

### 2.4.1: Application History Service
**Goal:** Create a service to check for potential duplicates *before* attempting database insertion.

**Implementation:**
1. Create `lib/services/application-history.ts`:
   ```typescript
   import { createClient } from "@supabase/supabase-js"
   import crypto from "crypto" // Node crypto for MD5

   export interface DuplicateCheckResult {
     isDuplicate: boolean
     reason?: "exact_url" | "same_company_similar_role"
     lastAppliedAt?: Date
     cooldownDaysRemaining?: number
     matchDetails?: {
       jobTitle: string
       companyName: string
     }
   }

   export async function checkDuplicateApplication(
     userId: string,
     jobUrl: string,
     companyName?: string,
     jobTitle?: string
   ): Promise<DuplicateCheckResult> {
     // 1. Check Exact URL (MD5) via RPC or direct query
     // 2. Check Company + Fuzzy Title via RPC (logic similar to DB trigger)
   }
   ```

### 2.4.2: Job Processing API Update
**Goal:** Integrate the check into the Job Processing / Scraping flow.

**Implementation:**
1. Update `app/api/jobs/process/route.ts`:
   - Before adding to `job_queue`, run `checkDuplicateApplication`.
   - If duplicate:
     - Log it.
     - Return specific warning/error to frontend.
     - Optionally allow "Force Apply" (override) if user insists.

### 2.4.3: Duplicate Warning UI
**Goal:** Show a clear warning if the user tries to add a duplicate job.

**Implementation:**
1. Update `components/dashboard/job-queue-table.tsx` or `add-job-dialog.tsx`:
   - If API returns duplicate warning:
     - Show distinct UI state (e.g., Red/Orange card).
     - text: "You applied to [Role] at [Company] on [Date]."
     - Action: "View Application" or "Ignore & Apply Anyway".

## VERIFICATION CHECKLIST
- [ ] `lib/services/application-history.ts` created
- [ ] MD5 hashing matches database generated column
- [ ] Fuzzy title matching works (e.g., "Senior Engineer" vs "Sr. Engineer")
- [ ] `app/api/jobs/process/route.ts` blocks/warns on duplicates
- [ ] Frontend shows "Already Applied" warning
- [ ] Database trigger `prevent_double_apply` is last line of defense
- [ ] Browser test: Add same URL twice -> Blocked/Warned
- [ ] Browser test: Add similar title at same company -> Blocked/Warned

## SUCCESS CRITERIA
✅ Users cannot accidentally apply to the same job URL twice.
✅ Users are warned about similar roles at the same company (90-day cooldown).
✅ Existing DB schema capabilities are leveraged (no reinventing the wheel).
✅ UI provides clear, actionable feedback.

## EXECUTION ORDER
1. Verify DB `md5` generation vs Node `crypto` MD5 compatibility.
2. Create `application-history.ts` service.
3. Update `jobs/process` API to use the service.
4. Update Frontend to handle duplicate responses.
5. Manual Test: Try to double-submit a job.
