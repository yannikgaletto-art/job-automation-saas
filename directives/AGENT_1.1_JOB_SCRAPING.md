# 🏗️ AGENT 1.1: JOB SCRAPING & QUEUE INSERTION

**Version:** 1.0  
**Status:** 🚧 Implementation Required  
**Priority:** CRITICAL - Blocks all user workflows  
**Last Updated:** 2026-02-17

---

## MISSION

Implement intelligent job scraping with 5-tier fallback system that:
1. Accepts job URLs from major platforms (LinkedIn, StepStone, Indeed, company career pages)
2. Scrapes job details (title, company, description, requirements, salary)
3. Inserts scraped job into `job_queue` with status `pending`
4. Returns job data to frontend for immediate display

**Critical:** This agent creates the job entry that other agents (Company Research, Cover Letter) depend on.

---

## PREREQUISITES — READ FIRST! 🚨

**Before starting ANY work, you MUST read AND cross-reference these documents:**

1. **`docs/ARCHITECTURE.md`** — System Architecture & Data Flow ✅ READ
   - Section 2: Data Flow Pipeline
   - Section 4: Job Queue State Machine

2. **`docs/SCRAPING_STRATEGY.md`** — **CRITICAL: Complete scraping strategy** ✅ READ
   - 5-tier intelligent fallback system
   - API selection logic by site type
   - Rate limiting and cost optimization
   - Implementation examples for all APIs

3. **`CLAUDE.md`** — **CRITICAL: "Reduce Complexity!"** ✅ READ
   - MVP-first approach
   - Lean implementation (max 200 lines per file)
   - No over-engineering

4. **`docs/MASTER_PLAN.md`** — Overall Roadmap ✅ READ
   - Check Phase 1: Job Queue Foundation

5. **`AGENTS.md`** — Agent Architecture ✅ READ
   - This is Agent 1 (Job Discovery/Scraping)
   - Feeds into Agent 3 (Company Research) and Agent 5 (Cover Letter)

6. **`database/schema.sql`** — Database Schema ✅ READ
   - Table: `job_queue` (columns: url, title, company, description, requirements, platform, status)
   - Table: `application_history` (for duplicate check)
   - Verify all columns match your insert statements

---

## EXECUTION PRINCIPLES

### 1. 🔍 Cross-Reference (Abgleich)
Before writing ANY code:
- All prerequisite docs have been read ✅
- Existing services checked: `/lib/services/` ✅
- Database schema verified: `/database/schema.sql` ✅
- No duplicate scraping logic exists ✅

### 2. 🧹 Reduce Complexity
- **MVP first:** Start with 3 platforms (LinkedIn, StepStone, Indeed) + Playwright fallback
- **No premature optimization:** SerpAPI → Playwright (skip ScraperAPI, Firecrawl, BrightData for MVP)
- **Reuse patterns:** Follow structure of `company-enrichment.ts`
- **Max 200 lines per file**

### 3. 📁 Proper Filing
- New service: `lib/services/job-scraper.ts` (main scraping logic)
- New API route: `app/api/jobs/scrape/route.ts` (endpoint for frontend)
- Update: `components/dashboard/add-job-dialog.tsx` (call new endpoint)

### 4. 🎖️ Senior Engineer Autonomy
- Handle edge cases (malformed URLs, timeouts, rate limits)
- Implement exponential backoff for retries
- Log all attempts for debugging
- Use TypeScript strict mode (no `any`)

### 5. 🧪 Interoperability Testing
After implementation:
- [ ] `npx tsc --noEmit` passes
- [ ] Test with real URLs:
  - LinkedIn: `https://www.linkedin.com/jobs/collections/recommended/?currentJobId=4314985397`
  - StepStone: `https://www.stepstone.de/stellenangebote--Innovation-Manager-m-w-d-Berlin-Oldenburg-VRG-GmbH--13583531-inline.html`
  - Indeed: `https://de.indeed.com/viewjob?jk=709efb88ae684a41`
  - Company: `https://jobs.fraunhofer.de/job/Berlin-Wissenschaftlerin-KI-Verteilte-Modellentwicklung-10587/1293601801/`
- [ ] Job appears in Dashboard queue immediately
- [ ] Company Research (Agent 3) can process the job
- [ ] Cover Letter (Agent 5) can generate from job data

### 6. ⚡ Efficiency
- Cache scraping results for 24h (same URL = skip re-scrape)
- Batch multiple jobs if user pastes list
- Timeout after 30s, fall back to manual entry

### 7. 📝 Additional Standards
- **TypeScript strict:** No `any` types
- **Error handling:** `try/catch` on all async operations
- **Logging:** Console logs with emoji prefixes (✅ ❌ ⚠️ 🔍 💾)
- **Types/Interfaces:** Export `JobScraperResult`, `ScrapedJobData`
- **Imports:** Use `@/` path aliases

---

## CURRENT STATE

### ✅ What Already Exists
- **Database schema:** `job_queue` table with all necessary columns
- **Frontend dialog:** `add-job-dialog.tsx` (but calls wrong endpoint)
- **API endpoint:** `/api/jobs/process/route.ts` (but expects `jobId`, not URL)
- **Scraping strategy:** Complete documentation in `docs/SCRAPING_STRATEGY.md`
- **Company enrichment:** Agent 3 already works (expects job in DB)
- **Cover letter generation:** Agent 5 already works (expects job in DB)

### ⚠️ What Partially Exists
- **API keys:** Need to verify `.env.local` has:
  - `SERPAPI_KEY` (for LinkedIn, Indeed, StepStone)
  - `SCRAPER_API_KEY` (fallback, optional for MVP)
  - `FIRECRAWL_API_KEY` (fallback, optional for MVP)
  - `PLAYWRIGHT` is built-in (no key needed)

### ❌ What Is Missing
- **Job scraping service:** `lib/services/job-scraper.ts` (MAIN TASK)
- **Scrape API endpoint:** `/app/api/jobs/scrape/route.ts` (creates job in DB)
- **Platform detection:** Function to identify LinkedIn vs StepStone vs Indeed
- **URL validation:** Zod schema for job URLs
- **Error states:** User-friendly messages for failed scrapes

---

## YOUR TASK

### Phase 1.1.1: Core Scraping Service

**Goal:** Build `lib/services/job-scraper.ts` with 5-tier fallback

**Implementation:**

```typescript
// lib/services/job-scraper.ts

import { getJson } from 'serpapi';
import { chromium } from 'playwright';

interface ScrapedJobData {
  title: string;
  company: string;
  location?: string;
  description: string;
  requirements?: string[];
  salary?: string;
  platform: 'linkedin' | 'indeed' | 'stepstone' | 'xing' | 'greenhouse' | 'lever' | 'workday' | 'company_website' | 'unknown';
  posted_at?: Date;
  apply_url: string;
}

interface JobScraperResult {
  success: boolean;
  data?: ScrapedJobData;
  error?: string;
  method: 'serpapi' | 'playwright' | 'manual_fallback';
  duration: number;
}

// Platform Detection
function detectPlatform(url: string): ScrapedJobData['platform'] {
  const domain = new URL(url).hostname;
  
  if (domain.includes('linkedin.com')) return 'linkedin';
  if (domain.includes('indeed.com') || domain.includes('indeed.de')) return 'indeed';
  if (domain.includes('stepstone.de')) return 'stepstone';
  if (domain.includes('xing.com')) return 'xing';
  if (domain.includes('greenhouse.io')) return 'greenhouse';
  if (domain.includes('lever.co')) return 'lever';
  if (domain.includes('workday.com')) return 'workday';
  if (domain.includes('jobs.') || domain.includes('karriere.') || domain.includes('career.')) return 'company_website';
  
  return 'unknown';
}

// Scraper Selection (MVP: SerpAPI → Playwright)
function selectScraperStrategy(platform: ScrapedJobData['platform']): string[] {
  const strategies: Record<ScrapedJobData['platform'], string[]> = {
    linkedin: ['serpapi', 'playwright'],
    indeed: ['serpapi', 'playwright'],
    stepstone: ['serpapi', 'playwright'],
    xing: ['playwright'],
    greenhouse: ['playwright'],
    lever: ['playwright'],
    workday: ['playwright'],
    company_website: ['playwright'],
    unknown: ['playwright']
  };
  
  return strategies[platform];
}

// Main Scraping Function
export async function scrapeJob(url: string): Promise<JobScraperResult> {
  const startTime = Date.now();
  const platform = detectPlatform(url);
  const scrapers = selectScraperStrategy(platform);
  
  console.log(`🔍 Scraping ${url} (${platform})...`);
  console.log(`📋 Strategy: ${scrapers.join(' → ')}`);
  
  for (const scraper of scrapers) {
    try {
      console.log(`🔄 Trying ${scraper}...`);
      let result: JobScraperResult;
      
      if (scraper === 'serpapi') {
        result = await scrapeWithSerpAPI(url, platform);
      } else if (scraper === 'playwright') {
        result = await scrapeWithPlaywright(url, platform);
      }
      
      if (result.success) {
        console.log(`✅ ${scraper} succeeded in ${result.duration}ms`);
        return result;
      }
    } catch (error: any) {
      console.error(`❌ ${scraper} failed:`, error.message);
      // Continue to next fallback
    }
  }
  
  // All scrapers failed
  return {
    success: false,
    error: 'All scraping methods failed. Please enter job details manually.',
    method: 'manual_fallback',
    duration: Date.now() - startTime
  };
}

// SerpAPI Scraper (Priority 1 for job boards)
async function scrapeWithSerpAPI(url: string, platform: string): Promise<JobScraperResult> {
  const startTime = Date.now();
  
  try {
    // Extract search query from URL or use generic search
    const searchQuery = extractSearchQueryFromUrl(url, platform);
    
    const results = await getJson({
      engine: 'google_jobs',
      q: searchQuery,
      location: 'Berlin, Germany', // TODO: Make dynamic
      api_key: process.env.SERPAPI_KEY,
      hl: 'de'
    });
    
    const jobs = results.jobs_results || [];
    
    // Find matching job by URL similarity
    const matchingJob = jobs.find((job: any) => 
      normalizeUrl(job.related_links?.[0]?.link || '') === normalizeUrl(url)
    ) || jobs[0]; // Fallback to first result
    
    if (!matchingJob) {
      throw new Error('Job not found in SerpAPI results');
    }
    
    return {
      success: true,
      data: {
        title: matchingJob.title,
        company: matchingJob.company_name,
        location: matchingJob.location,
        description: matchingJob.description,
        salary: matchingJob.detected_extensions?.salary,
        posted_at: matchingJob.detected_extensions?.posted_at ? new Date(matchingJob.detected_extensions.posted_at) : undefined,
        requirements: extractRequirements(matchingJob.description),
        platform: platform as any,
        apply_url: url
      },
      method: 'serpapi',
      duration: Date.now() - startTime
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      method: 'serpapi',
      duration: Date.now() - startTime
    };
  }
}

// Playwright Scraper (Fallback)
async function scrapeWithPlaywright(url: string, platform: string): Promise<JobScraperResult> {
  const startTime = Date.now();
  const browser = await chromium.launch({ headless: true });
  
  try {
    const page = await browser.newPage();
    
    await page.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8'
    });
    
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForSelector('h1, [class*="title"], [class*="job"]', { timeout: 5000 });
    
    const jobData = await page.evaluate(() => {
      // Generic selectors for job pages
      const title = 
        document.querySelector('h1')?.textContent ||
        document.querySelector('[class*="job-title"]')?.textContent ||
        document.querySelector('[data-testid="job-title"]')?.textContent;
      
      const company = 
        document.querySelector('[class*="company"]')?.textContent ||
        document.querySelector('[class*="employer"]')?.textContent ||
        document.querySelector('[data-testid="company-name"]')?.textContent;
      
      const description = 
        document.querySelector('[class*="description"]')?.textContent ||
        document.querySelector('[class*="job-description"]')?.textContent ||
        document.querySelector('article')?.textContent ||
        document.body.textContent;
      
      const location = 
        document.querySelector('[class*="location"]')?.textContent ||
        document.querySelector('[data-testid="location"]')?.textContent;
      
      return { 
        title: title?.trim(), 
        company: company?.trim(), 
        description: description?.trim(),
        location: location?.trim()
      };
    });
    
    await browser.close();
    
    if (!jobData.title || !jobData.company) {
      throw new Error('Could not extract job title or company');
    }
    
    return {
      success: true,
      data: {
        title: jobData.title,
        company: jobData.company,
        location: jobData.location,
        description: jobData.description || '',
        requirements: extractRequirements(jobData.description || ''),
        platform: platform as any,
        apply_url: url
      },
      method: 'playwright',
      duration: Date.now() - startTime
    };
  } catch (error: any) {
    await browser.close();
    return {
      success: false,
      error: error.message,
      method: 'playwright',
      duration: Date.now() - startTime
    };
  }
}

// Helper: Extract search query from URL
function extractSearchQueryFromUrl(url: string, platform: string): string {
  // StepStone: Extract from URL pattern
  if (platform === 'stepstone') {
    const match = url.match(/--(.+?)-(\w+)-(\d+)\.html/);
    if (match) {
      const titleLocation = match[1].replace(/-/g, ' ');
      return titleLocation;
    }
  }
  
  // Generic fallback: Use domain + "jobs"
  const domain = new URL(url).hostname.split('.')[0];
  return `${domain} jobs Berlin`;
}

// Helper: Normalize URL for comparison
function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname}`.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

// Helper: Extract requirements from description
function extractRequirements(description: string): string[] {
  const requirements: string[] = [];
  
  // Simple pattern matching for common requirement keywords
  const patterns = [
    /\b\d+\+? years? (of )?experience/gi,
    /Bachelor'?s|Master'?s|PhD/gi,
    /\b[A-Z][a-z]+Script\b/g, // JavaScript, TypeScript
    /\bReact|Vue|Angular|Node\.?js|Python|Java\b/gi,
    /\bAWS|Azure|GCP|Docker|Kubernetes\b/gi
  ];
  
  patterns.forEach(pattern => {
    const matches = description.match(pattern);
    if (matches) {
      requirements.push(...matches);
    }
  });
  
  return [...new Set(requirements)].slice(0, 10); // Top 10 unique
}
```

---

### Phase 1.1.2: API Endpoint

**Goal:** Create `/app/api/jobs/scrape/route.ts` that scrapes + inserts job

**Implementation:**

```typescript
// app/api/jobs/scrape/route.ts

import { scrapeJob } from '@/lib/services/job-scraper';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ScrapeRequestSchema = z.object({
  userId: z.string().uuid(),
  jobUrl: z.string().url(),
  company: z.string().optional(),
  jobTitle: z.string().optional()
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { userId, jobUrl, company, jobTitle } = ScrapeRequestSchema.parse(body);
    
    console.log(`🔍 Scraping job: ${jobUrl}`);
    
    // ========================================================================
    // STEP 1: Check for duplicates (BEFORE scraping to save API costs)
    // ========================================================================
    const { checkDuplicateApplication } = await import('@/lib/services/application-history');
    const slugify = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    
    const duplicateResult = await checkDuplicateApplication(
      userId,
      jobUrl,
      company ? slugify(company) : undefined,
      jobTitle
    );
    
    if (duplicateResult.isDuplicate) {
      console.warn(`⚠️ Blocked duplicate application: ${duplicateResult.reason}`);
      return Response.json({
        success: false,
        error: 'DUPLICATE_APPLICATION',
        details: duplicateResult
      }, { status: 409 });
    }
    
    // ========================================================================
    // STEP 2: Scrape job data (with 5-tier fallback)
    // ========================================================================
    const scrapResult = await scrapeJob(jobUrl);
    
    if (!scrapResult.success) {
      console.error(`❌ Scraping failed: ${scrapResult.error}`);
      return Response.json({
        success: false,
        error: scrapResult.error,
        method: scrapResult.method,
        duration: scrapResult.duration
      }, { status: 400 });
    }
    
    console.log(`✅ Scraped: ${scrapResult.data!.title} at ${scrapResult.data!.company}`);
    
    // ========================================================================
    // STEP 3: Insert job into queue
    // ========================================================================
    const { data: job, error: insertError } = await supabase
      .from('job_queue')
      .insert({
        user_id: userId,
        job_url: jobUrl,
        job_title: scrapResult.data!.title,
        company: scrapResult.data!.company,
        location: scrapResult.data!.location,
        salary_range: scrapResult.data!.salary,
        description: scrapResult.data!.description,
        requirements: scrapResult.data!.requirements,
        platform: scrapResult.data!.platform,
        snapshot_html: null, // TODO: Save full HTML for evidence
        snapshot_at: new Date().toISOString(),
        status: 'pending',
        manual_review_required: true,
        user_profile_id: userId // Assuming user_profile_id = user_id for MVP
      })
      .select()
      .single();
    
    if (insertError) {
      console.error('❌ Database insert failed:', insertError);
      throw insertError;
    }
    
    console.log(`💾 Job saved to queue (ID: ${job.id})`);
    
    // ========================================================================
    // STEP 4: Return success
    // ========================================================================
    return Response.json({
      success: true,
      job: {
        id: job.id,
        title: job.job_title,
        company: job.company,
        location: job.location,
        platform: job.platform,
        status: job.status
      },
      scraping: {
        method: scrapResult.method,
        duration: scrapResult.duration
      }
    }, { status: 201 });
    
  } catch (error: any) {
    console.error('❌ Scraping API error:', error);
    
    if (error instanceof z.ZodError) {
      return Response.json(
        { success: false, error: 'Invalid request', details: error.errors },
        { status: 400 }
      );
    }
    
    return Response.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
```

---

### Phase 1.1.3: Update Frontend Dialog

**Goal:** Change `add-job-dialog.tsx` to call new `/api/jobs/scrape` endpoint

**Changes:**

```typescript
// components/dashboard/add-job-dialog.tsx
// Line 33-50: Change API call

const res = await fetch('/api/jobs/scrape', {  // Changed from /api/jobs/process
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    },
    body: JSON.stringify({
        userId: '00000000-0000-0000-0000-000000000000', // Mock User ID
        jobUrl: url,
        company: company || undefined,
        jobTitle: title || undefined
    }),
});

const data = await res.json();

if (!res.ok) {
    if (res.status === 409) {
        // DUPLICATE DETECTED
        setDuplicateWarning(data.details);
        setIsLoading(false);
        return;
    }
    throw new Error(data.error || 'Failed to scrape job');
}

// Success - Job is now in queue!
setUrl('');
setCompany('');
setTitle('');
onJobAdded(); // Refresh job queue list
onClose();
```

---

## VERIFICATION CHECKLIST

- [ ] All prerequisite docs read and cross-referenced
- [ ] `npx tsc --noEmit` passes
- [ ] Environment variables in `.env.local`:
  - [ ] `SERPAPI_KEY` set
  - [ ] Playwright installed (`npx playwright install`)
- [ ] Browser test on localhost:3000:
  - [ ] Add LinkedIn job → Success
  - [ ] Add StepStone job → Success
  - [ ] Add Indeed job → Success
  - [ ] Add company career page → Success
  - [ ] Add same job twice → Duplicate warning
- [ ] Job appears in Dashboard queue immediately
- [ ] Job has all fields populated (title, company, description)
- [ ] Next step (Company Research) can process the job
- [ ] Logs show scraping attempts and fallbacks

---

## SUCCESS CRITERIA

✅ User can paste LinkedIn/StepStone/Indeed/company URLs  
✅ Job is scraped within 5-10 seconds  
✅ Job appears in Dashboard queue with status `pending`  
✅ Failed scrapes show user-friendly error (not "Job not found")  
✅ Duplicate applications are blocked with clear warning  
✅ System falls back gracefully (SerpAPI → Playwright → Manual)  
✅ No breaking changes to existing Agent 3 or Agent 5  

---

## EXECUTION ORDER

1. ✅ Read all prerequisite documents (ARCHITECTURE, SCRAPING_STRATEGY, CLAUDE, schema.sql)
2. Create `lib/services/job-scraper.ts` (main logic)
3. Create `app/api/jobs/scrape/route.ts` (endpoint)
4. Update `components/dashboard/add-job-dialog.tsx` (change API call)
5. Add environment variables to `.env.example`
6. Test with real URLs (LinkedIn, StepStone, Indeed, company sites)
7. Verify interoperability with Agent 3 (Company Research)
8. Update `docs/MASTER_PLAN.md` (check off Phase 1.1)

---

## ⚠️ PARALLELIZATION HINT

This agent **CANNOT** run in parallel with:
- Agent 3 (Company Research) - depends on job existing in DB
- Agent 5 (Cover Letter) - depends on job existing in DB

This agent **CAN** run in parallel with:
- Agent 6 (Quality Judge) - independent validation logic
- Agent 12 (Loading/Empty States) - pure UI improvements

**Critical Path:** Agent 1 → Agent 3 → Agent 5 (must be sequential)

---

## 📊 EXPECTED METRICS

### Success Rates (MVP)
- LinkedIn (via SerpAPI): 95%
- StepStone (via SerpAPI): 90%
- Indeed (via SerpAPI): 95%
- Company Sites (via Playwright): 85%
- Overall: 91%

### Performance
- SerpAPI: ~2 seconds
- Playwright: ~8 seconds
- Fallback to manual: <1 second
- Average: ~3 seconds

### Cost (per 100 jobs)
- SerpAPI: 70 jobs × $0.01 = $0.70
- Playwright: 30 jobs × $0 = $0
- Total: **$0.70/100 jobs** (MVP cost)

---

**Status:** 🚧 READY FOR IMPLEMENTATION  
**Estimated Time:** 3-4 hours  
**Complexity:** Medium (API integration + database insert)  
**Blockers:** None - All dependencies exist  

---

## 🎯 FINAL NOTES

**Remember:**
1. **MVP First:** SerpAPI + Playwright is enough (skip ScraperAPI, Firecrawl, BrightData for now)
2. **Error Handling:** Every API call needs try/catch
3. **User Experience:** Failed scrapes should show "Please enter details manually" (not technical errors)
4. **Logging:** Use emoji prefixes for easy scanning (🔍 ⚠️ ✅ ❌)
5. **Testing:** Test with REAL URLs from the list above

**Critical Rule:**  
> "Scraping is the foundation. If this fails, nothing else works. Make it bulletproof."

---

**Questions? Check:**
- `docs/SCRAPING_STRATEGY.md` for API usage examples
- `lib/services/company-enrichment.ts` for service structure patterns
- `database/schema.sql` for exact column names
