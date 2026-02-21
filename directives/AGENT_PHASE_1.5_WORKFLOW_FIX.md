# 🏗️ MASTER PROMPT TEMPLATE — Pathly V2.0 Agent Directive

## MISSION
Fix the broken Job Data Extraction and State Machine. Real jobs added via `/api/jobs/ingest` often fail to extract structured data (timeout/silent error) and remain stuck at `pending` with an empty Steckbrief. The "Jetzt analysieren" fallback button incorrectly triggers Cover Letter Generation instead of Data Extraction.

---

## PREREQUISITES — READ FIRST! 🚨

**Before starting ANY work, you MUST read AND cross-reference these documents:**

1. **`docs/ARCHITECTURE.md`** — System Architecture & Data Flow
2. **`docs/DESIGN_SYSTEM.md`** — UI/UX Standards
3. **`CLAUDE.md`** — **CRITICAL: "Reduce Complexity!"**
4. **`docs/MASTER_PLAN.md`** — Overall Roadmap
5. **`database/schema.sql`** — Database Schema

---

## EXECUTION PRINCIPLES

### 1. 🧹 Reduce Complexity
- **MVP first** — Implement the simplest working version
- **No premature optimization** — Only optimize if measured performance issue
- **Reuse existing patterns** — Don't reinvent what's already built

### 2. 🧪 Interoperability Testing
After implementation, verify:
- [ ] `npx tsc --noEmit` passes (no new TypeScript errors)
- [ ] New service integrates with existing API routes
- [ ] New components render correctly in existing layouts

---

## CURRENT STATE
- ❌ `/api/jobs/ingest` silently fails structured data extraction on real jobs (often due to the 12s timeout on Anthropic calls) and creates jobs with empty `responsibilities` and `qualifications`.
- ❌ The "Jetzt analysieren" fallback button in the UI incorrectly calls `/api/jobs/process` (which does company research + cover letter generation) instead of retrying the data extraction.
- ❌ The state machine (`status` in DB vs UI `workflowStep`) is fragmented. There is no manual flow to advance the Status from `pending` (Steckbrief) to `processing` (CV Match), blocking the rest of the application.
- ✅ The UI has interactive workflow tabs, empty states, and a clean Notion-like design.
- ✅ Dummy data (Stripe, Tesla, N26) has been cleared from the database, revealing the real-world bugs.

---

## YOUR TASK

### Phase 1.5.1: Reliable Data Extraction (The Core Fix)
**Goal:** Ensure `jobDescription` is always successfully parsed into structured data (`responsibilities`, `qualifications`, etc.).
**Implementation:**
- Create a dedicated `/api/jobs/extract/route.ts` endpoint that purely handles taking a `jobId`, fetching its `description`, and calling Claude Haiku/Sonnet with a robust prompt and a longer timeout (e.g. 30-60s) to update the `job_queue` row.
- Update `/api/jobs/ingest/route.ts` to either call this shared extraction logic or simply delegate the extraction to the new route entirely if asynchronous processing is preferred.

### Phase 1.5.2: Wire the Fallback Button Correctly
**Goal:** Make the "Jetzt analysieren" button in the Steckbrief actually retry extraction, not jump to Cover Letters.
**Implementation:**
- Update `app/dashboard/page.tsx`'s `handleReanalyze` to call the new `/api/jobs/extract` endpoint instead of `/api/jobs/process`.
- Re-fetch jobs upon success so the UI updates with the extracted data.

### Phase 1.5.3: Steckbrief Confirmation Button
**Goal:** Allow users to confirm the extracted data and visibly advance the job status.
**Implementation:**
- Add a "Steckbrief Bestätigen" button to the bottom of the Steckbrief (Tab 0) if structured data is present.
- Clicking this calls an API (e.g. `/api/jobs/confirm`) to update the job status from `pending` to `processing` (which maps to `JOB_REVIEWED` in the UI).
- Ensure this visually advances the `ProgressWorkflow` to the next node (CV Match).

---

## VERIFICATION CHECKLIST
- [ ] All prerequisite docs read and cross-referenced
- [ ] `npx tsc --noEmit` passes
- [ ] Browser test: Adding a long job description correctly extracts data (or fails gracefully to the empty state).
- [ ] Browser test: Clicking "Jetzt analysieren" successfully extracts the data and populates the Steckbrief.
- [ ] Browser test: Confirming the Steckbrief advances the workflow step and updates the DB.
- [ ] No breaking changes to existing features

## SUCCESS CRITERIA
✅ Data extraction works reliably for real, long job descriptions.
✅ Fallback extraction button triggers the right backend process.
✅ State machine allows user to move from Steckbrief to the next phase smoothly.
