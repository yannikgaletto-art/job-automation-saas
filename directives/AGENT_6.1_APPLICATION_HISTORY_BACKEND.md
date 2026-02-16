# 🤖 AGENT PROMPT: PHASE 6.1 — APPLICATION HISTORY SYSTEM (Backend)

## MISSION
Implement a complete Application History tracking system that records all job applications, provides duplicate prevention, and enables statistical analysis. This is the backend foundation for user application management.

---

## PREREQUISITES — READ FIRST! 🚨

**Before starting ANY work, you MUST read AND cross-reference these documents:**

1. **`docs/ARCHITECTURE.md`** — System Architecture & Data Flow
   - Understand application lifecycle tracking

2. **`docs/DESIGN_SYSTEM.md`** — UI/UX Standards
   - Not directly relevant (backend), but understand user expectations

3. **`CLAUDE.md`** — **CRITICAL: "Reduce Complexity!"**
   - MVP-first approach: Simple tracking first, analytics later

4. **`docs/MASTER_PLAN.md`** — Phase 6 details
   - Understand relationship between 6.1 (backend) and 6.2 (frontend)

5. **`database/schema.sql`** (Lines 269-306) — `application_history` table
   - Study all columns: `url_hash`, `company_slug`, `application_method`, etc.
   - Review `prevent_double_apply` trigger logic

6. **`lib/services/application-history.ts`** — Existing duplicate check logic
   - Already implements `checkDuplicateApplication()` function
   - Missing: `trackApplication()` function

7. **`directives/MASTER_PROMPT_TEMPLATE.md`** — Follow all 7 Execution Principles

---

## EXECUTION PRINCIPLES

### 1. 🔍 Cross-Reference (Abgleich)
Before writing ANY code:
- Read ALL prerequisite docs listed above
- Check `lib/services/application-history.ts` for existing patterns
- Verify database columns match your planned queries
- Check if `api/applications/` route already exists

### 2. 🧹 Reduce Complexity
- **MVP first** — Simple INSERT/SELECT queries, no complex analytics
- **No premature optimization** — Basic stats only (count, weekly/monthly)
- **Reuse existing patterns** — Follow `company-enrichment.ts` service structure
- **Max 200 lines per file** — Split API routes if needed

### 3. 📁 Proper Filing
- Update existing service → `lib/services/application-history.ts`
- New API routes → `app/api/applications/track/route.ts`
- New API routes → `app/api/applications/history/route.ts`
- New API routes → `app/api/applications/stats/route.ts`
- Update `docs/MASTER_PLAN.md` to mark completed tasks

### 4. 🎖️ Senior Engineer Autonomy
- Handle edge cases (what if user_id is missing?)
- Decide on proper error responses (400 vs 500)
- Write production-quality code (types, error handling, logging)
- Use transactions if multiple inserts needed

### 5. 🧪 Interoperability Testing
After implementation, verify:
- [ ] `npx tsc --noEmit` passes (no new TypeScript errors)
- [ ] API routes return proper HTTP status codes
- [ ] Database inserts respect RLS policies
- [ ] No breaking changes to existing duplicate check

### 6. ⚡ Efficiency
- Use batch queries for history fetching (LIMIT + OFFSET)
- Index on `user_id` and `applied_at` (already in schema)
- Don't fetch full `generated_documents` if not needed

### 7. 📝 Additional Standards
- **TypeScript strict** — Export interfaces for API responses
- **Error handling** — `try/catch` on all async operations
- **Logging** — Console logs with emoji prefixes (✅ ❌ ⚠️ 💾)
- **HTTP Status** — 200 (success), 400 (bad request), 401 (unauthorized), 500 (server error)

---

## CURRENT STATE

### ✅ Already Exists
- `lib/services/application-history.ts` with `checkDuplicateApplication()`
- `database/schema.sql` with `application_history` table + RLS policies
- `prevent_double_apply` trigger in PostgreSQL
- MD5 URL hashing logic
- Company slug normalization logic

### ⚠️ Partially Exists
- Duplicate check works, but NO function to actually SAVE applications
- No API routes for tracking/fetching history

### ❌ Missing (Your Task)
- `trackApplication()` function in `application-history.ts`
- `POST /api/applications/track` route
- `GET /api/applications/history` route (with pagination)
- `GET /api/applications/stats` route (simple counts)

---

## YOUR TASK

### 6.1.1: Add `trackApplication()` Function
**Goal:** Create a reusable service function to insert applications into `application_history` table.

**Implementation:**
```typescript
// lib/services/application-history.ts

export interface TrackApplicationParams {
    userId: string
    jobUrl: string
    companyName: string
    companySlug: string
    jobTitle: string
    applicationMethod: "auto" | "manual" | "extension"
    generatedDocuments?: {
        cv_url?: string
        cover_letter_url?: string
    }
}

export async function trackApplication(
    params: TrackApplicationParams
): Promise<{ success: boolean; error?: string }> {
    // 1. Generate URL Hash (MD5)
    // 2. INSERT into application_history
    // 3. Handle duplicate errors gracefully (trigger will block)
    // 4. Return success/error
}
```

**Acceptance Criteria:**
- ✅ Function uses existing `supabase` client from file
- ✅ Generates MD5 hash using `crypto.createHash()`
- ✅ Inserts all required columns (see schema.sql)
- ✅ Handles duplicate error (23505) gracefully
- ✅ Returns typed response with `success` boolean
- ✅ Logs all operations with emoji prefixes

---

### 6.1.2: Create `POST /api/applications/track` Route
**Goal:** API endpoint to record a new application.

**Implementation:**
```typescript
// app/api/applications/track/route.ts

import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import { trackApplication } from "@/lib/services/application-history"

export async function POST(request: Request) {
    // 1. Get authenticated user
    // 2. Parse request body
    // 3. Validate required fields
    // 4. Call trackApplication()
    // 5. Return 201 (created) or 409 (duplicate)
}
```

**Request Body Example:**
```json
{
    "jobUrl": "https://jobs.lever.co/company/job-id",
    "companyName": "Acme Corp",
    "companySlug": "acme-corp",
    "jobTitle": "Senior Software Engineer",
    "applicationMethod": "manual",
    "generatedDocuments": {
        "cv_url": "storage/user123/cv_optimized.pdf",
        "cover_letter_url": "storage/user123/cover_letter.pdf"
    }
}
```

**Acceptance Criteria:**
- ✅ Authenticated users only (check `user.id`)
- ✅ Returns 401 if not authenticated
- ✅ Returns 400 if required fields missing
- ✅ Returns 201 on success
- ✅ Returns 409 on duplicate (with details)
- ✅ Proper error messages in response

---

### 6.1.3: Create `GET /api/applications/history` Route
**Goal:** Fetch user's application history with pagination.

**Implementation:**
```typescript
// app/api/applications/history/route.ts

export async function GET(request: Request) {
    // 1. Get authenticated user
    // 2. Parse query params: page, limit (default 20)
    // 3. SELECT from application_history
    //    - WHERE user_id = user.id
    //    - ORDER BY applied_at DESC
    //    - LIMIT + OFFSET
    // 4. Return paginated results + total count
}
```

**Response Example:**
```json
{
    "applications": [
        {
            "id": "uuid",
            "companyName": "Acme Corp",
            "jobTitle": "Senior Engineer",
            "appliedAt": "2026-02-15T10:30:00Z",
            "applicationMethod": "manual",
            "jobUrl": "https://..."
        }
    ],
    "pagination": {
        "page": 1,
        "limit": 20,
        "total": 47,
        "hasMore": true
    }
}
```

**Acceptance Criteria:**
- ✅ Authenticated users only
- ✅ Returns 200 with empty array if no applications
- ✅ Pagination works correctly (OFFSET = (page - 1) * limit)
- ✅ Total count included (separate COUNT query)
- ✅ Sorted by `applied_at DESC` (newest first)

---

### 6.1.4: Create `GET /api/applications/stats` Route
**Goal:** Simple statistics for dashboard display.

**Implementation:**
```typescript
// app/api/applications/stats/route.ts

export async function GET(request: Request) {
    // 1. Get authenticated user
    // 2. COUNT applications by time period:
    //    - Total all-time
    //    - Last 7 days
    //    - Last 30 days
    // 3. (Optional) COUNT by application_method
    // 4. Return simple stats object
}
```

**Response Example:**
```json
{
    "total": 47,
    "last7Days": 5,
    "last30Days": 18,
    "byMethod": {
        "auto": 12,
        "manual": 35
    }
}
```

**Acceptance Criteria:**
- ✅ Authenticated users only
- ✅ Returns 200 with zero counts if no applications
- ✅ Efficient queries (use WHERE clauses for date ranges)
- ✅ All numbers are integers

---

## VERIFICATION CHECKLIST
- [ ] All prerequisite docs read and cross-referenced
- [ ] `trackApplication()` function works (test with console.log)
- [ ] `POST /api/applications/track` returns 201 on success
- [ ] `POST /api/applications/track` returns 409 on duplicate
- [ ] `GET /api/applications/history` returns paginated results
- [ ] `GET /api/applications/stats` returns correct counts
- [ ] `npx tsc --noEmit` passes
- [ ] No breaking changes to existing `checkDuplicateApplication()`
- [ ] `docs/MASTER_PLAN.md` updated (Phase 6.1 tasks checked off)

---

## SUCCESS CRITERIA
✅ `trackApplication()` inserts records successfully
✅ All 3 API routes work correctly
✅ Duplicate prevention still works (via trigger)
✅ Pagination works for large histories (100+ applications)
✅ Stats dashboard can show meaningful numbers

---

## EXECUTION ORDER
1. Read all prerequisite documents
2. Implement `trackApplication()` in `application-history.ts`
3. Create `POST /api/applications/track` route
4. Create `GET /api/applications/history` route
5. Create `GET /api/applications/stats` route
6. Test all routes with Postman or curl
7. Run `npx tsc --noEmit`
8. Update `docs/MASTER_PLAN.md`

---

## ⚠️ PARALLELISATION HINT
✅ **Can run PARALLEL with Phase 5 (Cover Letter)** — Independent backend services
❌ **Cannot run parallel with 6.2 (Frontend)** — UI depends on these API routes
✅ **Can run parallel with Phase 7-8** — No direct dependencies

---

## 🔗 DEPENDENCIES
- **Depends on:** Phase 1 (User Auth), Database Schema deployed
- **Required by:** Phase 6.2 (Application History UI)
- **Optional integration:** Phase 2 (Job Processing can auto-track applications)
