# AGENT PROMPT: PHASE 10.3 — STECKBRIEF ENRICHMENT + FILTER TAGGING

---
Version: 1.0.0
Last Updated: 2026-03-03
Status: AKTIV
---

## MISSION
Two improvements to the Job Search + Ingest pipeline:

1. **Steckbrief Enrichment (Option A):** At ingest time, use Firecrawl to scrape the
   full job posting page from the `source_url` / `apply_link`. Feed the full markdown
   to Claude Haiku instead of the short SerpAPI description (~200 chars). This ensures
   the Steckbrief (Tab 0 in job-row.tsx) gets rich structured data: summary,
   responsibilities, qualifications, benefits, buzzwords.

2. **Post-Search Filter Tagging:** After SerpAPI returns 6-10 results, run a SINGLE
   GPT-4o-mini batch call to classify which Werte-Filter tags (Nachhaltigkeit,
   Innovation, Social Impact, Deep Tech) genuinely match each job. Display matched
   tags as colored pills on each result in the search UI.

**Everything is purely additive — no existing code is deleted or restructured.**

## PREREQUISITES — READ FIRST!

1. **`CLAUDE.md`** — "Reduce Complexity!" + Workflow Rules
2. **`docs/SICHERHEITSARCHITEKTUR.md`** — Safety Contracts (§8 API Auth, §10 URL handling)
3. **`directives/FEATURE_IMPACT_ANALYSIS.md`** — Impact analysis required
4. **`directives/FEATURE_COMPAT_MATRIX.md`** §0.1 — Forbidden Files check
5. **`app/api/jobs/ingest/route.ts`** — READ EXISTING CODE (216 lines). The Zod schema does NOT include `source_url` yet.
6. **`lib/services/job-search-pipeline.ts`** — READ `deepScrapeJob()` (lines 243-286) and `WERTE_FILTER_KEYWORDS` (lines 106-111)
7. **`app/dashboard/job-search/page.tsx`** — READ `AddToQueueButton` (sends `source_url`) and `JobRow` display
8. **`app/api/job-search/query/route.ts`** — READ how results are returned (158 lines)

## IMPACT MAP

```
Upstream:              SerpAPI (existing), Firecrawl (existing), GPT-4o-mini (existing)
Downstream:            Steckbrief gets richer data, Search UI gets filter tags
Security/DB:           Keine neuen Tabellen, kein middleware.ts
Contracts berührt:     IngestRequestSchema (Zod) — extended with optional source_url
Empty States:          If Firecrawl fails → fallback to short description (existing behavior)
                       If GPT-4o-mini tagging fails → no tags shown (graceful)
Breaking Changes:      KEINE — source_url is optional, tagging is additive
Forbidden Files:       KEINE berührt
```

---

## PART 1: STECKBRIEF ENRICHMENT AT INGEST

### 10.3.1: Extend Zod Schema
**Goal:** Accept the `source_url` that the frontend already sends.

**In `/api/jobs/ingest/route.ts` (line 18-23):**
```typescript
const IngestRequestSchema = z.object({
    company: z.string().min(2, 'Company name must be at least 2 characters'),
    jobTitle: z.string().min(2, 'Job title must be at least 2 characters'),
    jobDescription: z.string().min(10, 'Mindestens 10 Zeichen').max(10000, 'Maximal 10.000 Zeichen'),
    companyWebsite: z.string().url('Ungültige URL').optional().or(z.literal('')),
    // NEW: URL to the job posting (for Firecrawl deep scrape)
    source_url: z.string().url().optional().or(z.literal('')),
    source: z.string().optional(),
});
```

### 10.3.2: Firecrawl Deep Scrape Before Haiku
**Goal:** If `source_url` is provided, scrape the full page and use that text for Haiku extraction.

**Implementation (in the same route, BEFORE the Haiku extraction at ~line 78):**
1. Import `deepScrapeJob` from `@/lib/services/job-search-pipeline`
2. If `source_url` is provided and not a LinkedIn URL:
   - Call `deepScrapeJob(source_url)` with a 10s timeout
   - If it returns markdown ≥ 200 chars: use that as the extraction source
   - If it fails or returns too little: fall back to `jobDescription` (existing behavior)
3. Pass the longer text to the existing Claude Haiku call

```typescript
// NEW: Deep scrape for richer Steckbrief data
let enrichedDescription = jobDescription;
const normalizedSourceUrl = source_url && source_url.trim() !== '' ? source_url.trim() : null;

if (normalizedSourceUrl && !normalizedSourceUrl.includes('linkedin.com')) {
    try {
        console.log(`[${requestId}] route=jobs/ingest step=firecrawl_scrape url=${normalizedSourceUrl}`);
        const scraped = await Promise.race([
            deepScrapeJob(normalizedSourceUrl),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 10000))
        ]);
        if (scraped && scraped.length >= 200) {
            enrichedDescription = scraped.slice(0, 8000); // Cap for Haiku token limit
            console.log(`[${requestId}] route=jobs/ingest step=firecrawl_scrape chars=${scraped.length} using_scraped=true`);
        } else {
            console.log(`[${requestId}] route=jobs/ingest step=firecrawl_scrape fallback=short_text`);
        }
    } catch (err) {
        console.warn(`[${requestId}] route=jobs/ingest step=firecrawl_scrape error fallback=original_description`);
    }
}
// Then pass enrichedDescription to Claude Haiku instead of jobDescription
```

4. The existing Haiku call (line 98) should use `enrichedDescription` instead of `jobDescription`:
   ```typescript
   messages: [{ role: 'user', content: enrichedDescription }]
   ```

### 10.3.3: Store source_url in job_queue
**Goal:** Save the source_url for future reference.

**In the DB insert (line 158-180):**
- Map `source_url` → `source_url` column (the `job_queue` table already has a `source_url` column based on the `enrichWithQueueStatus` function which queries it)
- Also store it in `job_url` instead of the synthetic UUID if available

```typescript
const jobUrl = normalizedSourceUrl || `manual:${crypto.randomUUID()}`;
// In the insert:
job_url: jobUrl,
source_url: normalizedSourceUrl || null,
```

---

## PART 2: POST-SEARCH FILTER TAGGING

### 10.3.4: GPT-4o-mini Batch Tagging
**Goal:** After SerpAPI returns results, classify which Werte-Filters match each job.

**In `/api/job-search/query/route.ts`, AFTER the SerpAPI call and enrichment:**

```typescript
import OpenAI from 'openai';

// After: const enriched = await enrichWithQueueStatus(...)
// Before: return NextResponse.json(...)

// Tag jobs with matching Werte-Filters
const tagged = await tagJobsWithFilters(enriched, filters?.werte);

// Return tagged instead of enriched
return NextResponse.json({
    results: tagged,
    // ...rest
});
```

**New helper function `tagJobsWithFilters`:**
```typescript
async function tagJobsWithFilters(
    jobs: any[],
    activeFilters?: string[]
): Promise<any[]> {
    // Only tag if user has selected Werte-Filters
    if (!activeFilters || activeFilters.length === 0 || jobs.length === 0) {
        return jobs.map(j => ({ ...j, matched_filters: [] }));
    }

    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
        return jobs.map(j => ({ ...j, matched_filters: [] }));
    }

    try {
        const openai = new OpenAI({ apiKey: openaiKey });

        const jobSummaries = jobs.map((j, i) => 
            `Job ${i}: "${j.title}" bei ${j.company_name}. ${(j.description || '').slice(0, 200)}`
        ).join('\n');

        const filterLabels: Record<string, string> = {
            nachhaltigkeit: 'Nachhaltigkeit (ESG, Klimaschutz, Umwelt)',
            innovation: 'Innovation (Disruption, New Work, Transformation)',
            social_impact: 'Social Impact (gemeinnützig, NGO, sozial)',
            deep_tech: 'Deep Tech (KI, AI, Machine Learning, Forschung)',
        };

        const filterDescriptions = activeFilters
            .map(f => `"${f}": ${filterLabels[f] || f}`)
            .join(', ');

        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            temperature: 0,
            max_tokens: 500,
            response_format: { type: 'json_object' },
            messages: [
                {
                    role: 'system',
                    content: `Klassifiziere Jobs nach Werte-Filtern. Aktive Filter: ${filterDescriptions}.
Für jeden Job: Gib nur die Filter zurück, die WIRKLICH aus dem Text ersichtlich sind. Halluziniere NICHT.
Antwort als JSON: {"tags": [["filter1"], ["filter1", "filter2"], [], ...]}
Das Array hat exakt ${jobs.length} Einträge (einer pro Job). Leeres Array = kein Filter passt.`
                },
                { role: 'user', content: jobSummaries }
            ],
        });

        const text = completion.choices[0]?.message?.content?.trim();
        if (!text) return jobs.map(j => ({ ...j, matched_filters: [] }));

        const parsed = JSON.parse(text);
        const tags: string[][] = parsed.tags || [];

        return jobs.map((job, i) => ({
            ...job,
            matched_filters: tags[i] || [],
        }));
    } catch (err) {
        console.warn('⚠️ [Search] Filter tagging failed, continuing without tags');
        return jobs.map(j => ({ ...j, matched_filters: [] }));
    }
}
```

### 10.3.5: Display Filter Tags in Search UI
**Goal:** Show matched filter tags as colored pills on each search result.

**In `app/dashboard/job-search/page.tsx`, inside `JobRow` component:**

Add a pills row below the job title area:
```tsx
{/* Filter match tags */}
{job.matched_filters && job.matched_filters.length > 0 && (
    <div className="flex gap-1.5 mt-1">
        {job.matched_filters.map((filter: string) => (
            <span
                key={filter}
                className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                    filter === 'nachhaltigkeit' ? 'bg-green-50 text-green-700 border-green-200' :
                    filter === 'innovation' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                    filter === 'social_impact' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                    filter === 'deep_tech' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                    'bg-slate-50 text-slate-600 border-slate-200'
                }`}
            >
                {WERTE_FILTERS.find(wf => wf.key === filter)?.label || filter}
            </span>
        ))}
    </div>
)}
```

**Color mapping:**
| Filter | Background | Text | Border |
|--------|-----------|------|--------|
| Nachhaltigkeit | `bg-green-50` | `text-green-700` | `border-green-200` |
| Innovation | `bg-purple-50` | `text-purple-700` | `border-purple-200` |
| Social Impact | `bg-amber-50` | `text-amber-700` | `border-amber-200` |
| Deep Tech | `bg-blue-50` | `text-blue-700` | `border-blue-200` |

### 10.3.6: Cache Tagged Results
The existing upsert into `saved_job_searches` already saves the full `enriched` array.
Since we add `matched_filters` to each job object, it will automatically be persisted
in the JSONB `results` column. On cache hit, the tags will be served from cache.
**No additional DB changes needed.**

---

## VERIFICATION CHECKLIST
- [ ] `source_url` is accepted by the Zod schema (optional)
- [ ] Firecrawl is called when `source_url` is present (not LinkedIn)
- [ ] Firecrawl failure gracefully falls back to short description
- [ ] Claude Haiku receives the full scraped text (not the short SerpAPI snippet)
- [ ] Steckbrief shows richer data (responsibilities, qualifications, benefits)
- [ ] GPT-4o-mini tagging only runs when Werte-Filters are active
- [ ] Tags are displayed as colored pills in search results
- [ ] Tags are persisted in cache (saved_job_searches)
- [ ] `npx tsc --noEmit` passes
- [ ] No Forbidden Files touched

## SUCCESS CRITERIA
✅ Steckbrief has meaningful structured data (not just 1-2 empty sections)
✅ Jobs show visible Werte-Filter match tags
✅ Tagging failure shows no tags (not an error)
✅ Firecrawl failure falls back silently
✅ No breaking changes to existing flows

## ⚠️ FORBIDDEN — DO NOT:
- ❌ Delete or restructure existing ingest logic
- ❌ Touch any Forbidden Files (model-router.ts, middleware.ts, etc.)
- ❌ Add new DB tables or migrations
- ❌ Make Firecrawl scraping blocking for the entire ingest (use timeout + fallback)
- ❌ Tag ALL results — only tag when user has active Werte-Filters
- ❌ Add emojis to the UI

## PARALLELISIERUNG
✅ **Can run AFTER Agent 10.1 (Mission Search) and 10.2 (Magic Queue) are complete**
⚠️ Modifies `page.tsx` (filter tags display), `ingest/route.ts`, and `query/route.ts`
