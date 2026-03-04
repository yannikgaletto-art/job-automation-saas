# AGENT PROMPT: PHASE 10.1 — MISSION-DRIVEN SEARCH

---
Version: 1.0.0
Last Updated: 2026-03-03
Status: AKTIV
---

## MISSION
Add an optional "Mission Mode" to the Job Search page. In this mode, the user
types a natural-language intent (e.g. "Ich will FinTech-Produkte bauen") instead
of a keyword. A GPT-4o-mini call translates the intent into 1–3 SerpAPI-ready
keyword+location queries, which then run through the existing `searchJobs()` pipeline.

**The existing keyword search MUST remain 100% functional and unchanged.
Mission mode is purely additive.**

## PREREQUISITES — READ FIRST!

1. **`CLAUDE.md`** — "Reduce Complexity!" + Workflow Rules + Visual Standards
2. **`docs/SICHERHEITSARCHITEKTUR.md`** — Safety Contracts (especially §8 API Auth)
3. **`directives/FEATURE_IMPACT_ANALYSIS.md`** — Impact Map is pre-approved (see implementation_plan.md)
4. **`directives/FEATURE_COMPAT_MATRIX.md`** §0.1 — Forbidden Files check (NONE touched here)
5. **`app/dashboard/job-search/page.tsx`** — READ EXISTING CODE FIRST (767 lines)
6. **`app/api/job-search/query/route.ts`** — READ EXISTING CODE FIRST (158 lines)
7. **`lib/services/job-search-pipeline.ts`** — Understand `searchJobs()` function
8. **`docs/MOTION_PRINCIPLES.md`** — Kein Framer Motion Code ohne diese Datei

## CURRENT STATE
- ✅ `page.tsx` has `JobSearchPage` with keyword search, `SearchAccordion`, `JobRow`
- ✅ `/api/job-search/query` POST route with SerpAPI, cache, queue-status enrichment
- ✅ GPT-4o-mini + Claude SDKs already in `job-search-pipeline.ts`
- ✅ Suggested-titles route exists (`/api/jobs/search/suggest-titles`)
- ⚠️ No intent-based search mode exists

## YOUR TASK

### 10.1.1: Frontend — Search Mode Toggle
**Goal:** Add a keyword/mission toggle to the search bar.

**Implementation:**
1. Add state `searchMode: 'keyword' | 'mission'` (default: `'keyword'`)
2. Render two pill-buttons inside the search bar container (above or inline):
   - `Keyword` (default, active) — existing behavior
   - `Mission` — switches to intent mode
3. When `searchMode === 'mission'`:
   - Change input placeholder to: `"Beschreibe deine nächste Mission..."`
   - Optionally: make the input field a `<textarea>` (2 rows) for longer intent
4. When `searchMode === 'keyword'`:
   - Placeholder stays: `"Jobtitel eingeben..."`
   - Everything works exactly as before
5. Pass `mode: searchMode` in the fetch body to `/api/job-search/query`
6. Use Framer Motion for the toggle transition (subtle scale/opacity)

**Design:** Match existing Pathly aesthetics:
- Pill-buttons: `bg-[#f0f4ff]` for active, `border-[#E7E7E5]` for inactive
- Text: `text-[#002e7a]` active, `text-[#73726E]` inactive
- No new color system, reuse existing tokens

### 10.1.2: Backend — Intent-to-Keywords Translation
**Goal:** Add GPT-4o-mini preprocessing in the API route when `mode === 'mission'`.

**Implementation in `/api/job-search/query/route.ts`:**
1. Accept `mode?: 'keyword' | 'mission'` in POST body (default: `'keyword'`)
2. If `mode === 'mission'`:
   ```typescript
   import OpenAI from 'openai';
   
   const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
   
   const systemPrompt = `Du bist ein HR-Suchexperte. Der User beschreibt seine Karriere-Vision als Freitext.
   Extrahiere daraus:
   1. Einen primären Suchbegriff für Google Jobs (max 4 Wörter, deutsch)
   2. Einen Standort (falls erwähnt, sonst "Deutschland")
   
   Antworte AUSSCHLIESSLICH in diesem JSON-Format:
   {"query": "...", "location": "..."}
   Keine Erklärungen, kein Markdown, nur das nackte JSON-Objekt.`;
   
   const completion = await openai.chat.completions.create({
       model: 'gpt-4o-mini',
       messages: [
           { role: 'system', content: systemPrompt },
           { role: 'user', content: query }
       ],
       response_format: { type: "json_object" },
       max_tokens: 100,
       temperature: 0.3,
   });
   
   const parsed = JSON.parse(completion.choices[0].message.content || '{}');
   // Use parsed.query and parsed.location for the rest of the pipeline
   ```
3. After extraction, the rest of the pipeline runs identically (SerpAPI → cache → enrich)
4. The `query` saved in `saved_job_searches` should be the ORIGINAL user intent (not the extracted keywords), so the user sees their original text in the accordion header
5. Add a `search_mode` field to the upserted record (informational only)

### 10.1.3: Error Handling
- If GPT-4o-mini fails (network, auth, parse error): fall back to using the raw user input as SerpAPI query
- Log the fallback: `console.warn('⚠️ [Search] Mission mode fallback to raw query')`
- Never show a hard error for mission mode translation failures

## VERIFICATION CHECKLIST
- [ ] Toggle between Keyword and Mission mode works visually
- [ ] Mission mode changes placeholder text
- [ ] Mission mode search returns results from SerpAPI
- [ ] Keyword mode is 100% unchanged (regression)
- [ ] The user's original intent text is shown in the accordion header (not extracted keywords)
- [ ] GPT-4o-mini failure gracefully falls back to raw query
- [ ] `npx tsc --noEmit` passes
- [ ] Visual style matches Pathly aesthetics (clean, light mode, Notion-like)

## SUCCESS CRITERIA
✅ User can search with natural language intent
✅ Results are relevant to the described mission
✅ Keyword search is completely unaffected
✅ No new routes, no new DB tables, no middleware changes

## ⚠️ FORBIDDEN — DO NOT:
- ❌ Delete or restructure existing keyword search code
- ❌ Touch any Forbidden Files (model-router.ts, middleware.ts, etc.)
- ❌ Add new DB tables or migrations
- ❌ Use Claude/Anthropic for the translation (GPT-4o-mini is sufficient and cheaper)
- ❌ Add emojis to the UI

## PARALLELISIERUNG
✅ **Can run PARALLEL with Agent 10.2 (Magic Queue)**
⚠️ Both agents modify `page.tsx` — coordinate merge carefully
