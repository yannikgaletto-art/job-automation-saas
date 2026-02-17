# 🏗️ AGENT 1.1: JOB SCRAPING & QUEUE INSERTION

**Version:** 2.0 (COMPLETE)  
**Status:** 🚧 Implementation Required  
**Priority:** CRITICAL - Blocks all user workflows  
**Last Updated:** 2026-02-17  
**Template:** Master_Prompt_Template STRICT

---

## 🎯 MISSION

Implement **5-tier intelligent fallback system** for job scraping that:
1. Accepts job URLs from ALL major platforms (LinkedIn, StepStone, Indeed, Xing, Greenhouse, Lever, Workday, company sites)
2. Automatically selects best scraping method based on platform detection
3. Falls back gracefully through 5 tiers: **SerpAPI → ScraperAPI → Firecrawl → BrightData → Playwright**
4. Scrapes job details (title, company, description, requirements, salary, location)
5. Inserts scraped job into `job_queue` with status `pending`
6. Returns job data to frontend for immediate display

**Critical:** This agent creates the job entry that Agent 3 (Company Research) and Agent 5 (Cover Letter) depend on.

---

## ⚠️ PREREQUISITES — READ FIRST! 🚨

**Before starting ANY work, you MUST read AND cross-reference:**

### 📚 Core Documentation (MANDATORY)
1. ✅ **`docs/ARCHITECTURE.md`** — System Architecture & Data Flow
   - Section 2: Data Flow Pipeline
   - Section 4: Job Queue State Machine

2. ✅ **`docs/SCRAPING_STRATEGY.md`** — **⭐ CRITICAL: Complete 5-tier strategy with ALL API code examples**
   - 5-tier intelligent fallback system
   - API selection logic by site type (LinkedIn, StepStone, Indeed, Greenhouse, Lever, etc.)
   - Rate limiting and cost optimization
   - **COMPLETE implementation examples for ALL 5 APIs**

3. ✅ **`CLAUDE.md`** — **CRITICAL: "Reduce Complexity!"**
   - MVP-first approach
   - Lean implementation (max 200 lines per file)
   - No over-engineering

4. ✅ **`docs/MASTER_PLAN.md`** — Overall Roadmap
   - Check Phase 1: Job Queue Foundation

5. ✅ **`AGENTS.md`** — Agent Architecture
   - This is Agent 1 (Job Discovery/Scraping)
   - Feeds into Agent 3 (Company Research) and Agent 5 (Cover Letter)

6. ✅ **`database/schema.sql`** — Database Schema
   - Table: `job_queue` (all columns for insert)
   - Table: `application_history` (for duplicate check)

### 🔑 Environment Variables Required
```bash
# SCRAPING APIs (add to .env.local and .env.example)
SERPAPI_KEY=your_serpapi_key_here
SCRAPER_API_KEY=your_scraperapi_key_here
FIRECRAWL_API_KEY=your_firecrawl_api_key_here
BRIGHTDATA_API_KEY=your_brightdata_api_key_here
# Playwright: Built-in, no API key needed
```

---

## 📋 EXECUTION PRINCIPLES

### 1. 🔍 Cross-Reference (Abgleich)
**BEFORE writing ANY code:**
- [x] All prerequisite docs read
- [x] Existing services checked: `/lib/services/`
- [x] Database schema verified: `/database/schema.sql`
- [x] No duplicate scraping logic exists
- [x] **SCRAPING_STRATEGY.md code examples reviewed in FULL**

### 2. 🧹 Reduce Complexity
- **Start with ALL 5 tiers:** SerpAPI → ScraperAPI → Firecrawl → BrightData → Playwright
- **But prioritize:** LinkedIn/Indeed/StepStone get SerpAPI first (90% of jobs)
- **Company sites:** Firecrawl first (Greenhouse, Lever, Workday)
- **Unknown sites:** Playwright fallback
- **Reuse patterns:** Follow structure of `company-enrichment.ts`
- **Max 300 lines per file** (complex scraping logic allowed)

### 3. 📁 Proper Filing
- **New service:** `lib/services/job-scraper.ts` (main scraping logic)
- **New API route:** `app/api/jobs/scrape/route.ts` (endpoint for frontend)
- **Update:** `components/dashboard/add-job-dialog.tsx` (call new endpoint)
- **Update:** `.env.example` (add all API keys)

### 4. 🏆 Senior Engineer Autonomy
- Handle edge cases (malformed URLs, timeouts, rate limits)
- Implement exponential backoff for retries
- Log all attempts for debugging
- Use TypeScript strict mode (no `any`)
- Cache scraping results (24h)

### 5. 🧪 Interoperability Testing
**After implementation:**
- [ ] `npx tsc --noEmit` passes
- [ ] Test with REAL URLs:
  - LinkedIn: `https://www.linkedin.com/jobs/view/4314985397`
  - StepStone: `https://www.stepstone.de/stellenangebote--Innovation-Manager-Berlin-13583531.html`
  - Indeed: `https://de.indeed.com/viewjob?jk=709efb88ae684a41`
  - Company (Fraunhofer): `https://jobs.fraunhofer.de/job/Berlin-Wissenschaftlerin-KI-10587/1293601801/`
  - Greenhouse: Any `greenhouse.io` hosted career page
- [ ] Job appears in Dashboard immediately
- [ ] Agent 3 (Company Research) can process the job
- [ ] Agent 5 (Cover Letter) can generate from job data

### 6. ⚡ Efficiency
- **Cache:** Scraping results for 24h (same URL = skip re-scrape)
- **Batch:** Support multiple jobs if user pastes list
- **Timeout:** 30s max per scraper, then fallback
- **Cost tracking:** Log API costs per scrape

### 7. 📝 Additional Standards
- **TypeScript strict:** No `any` types
- **Error handling:** `try/catch` on all async operations
- **Logging:** Console logs with emoji prefixes (✅ ❌ ⚠️ 🔍 💾)
- **Types/Interfaces:** Export `JobScraperResult`, `ScrapedJobData`, `SiteType`
- **Imports:** Use `@/` path aliases

---

## 🔄 5-TIER SCRAPING STRATEGY

### Tier 1: SerpAPI (Google Jobs)
**Best for:** LinkedIn, Indeed, StepStone, Xing  
**Success Rate:** 99%  
**Speed:** ~1-2 seconds  
**Cost:** $0.01 per search  
**Why First:** Structured data, no anti-bot issues

### Tier 2: ScraperAPI (Anti-bot bypass)
**Best for:** Direct job board URLs with anti-bot protection  
**Success Rate:** 90%  
**Speed:** ~3-4 seconds  
**Cost:** $0.001 per request  
**Why Second:** Handles CloudFlare, reCAPTCHA, etc.

### Tier 3: Firecrawl (ATS Platforms)
**Best for:** Company career pages (Greenhouse, Lever, Workday, Ashby)  
**Success Rate:** 95%  
**Speed:** ~2 seconds  
**Cost:** $0.002 per page  
**Why Third:** Optimized for React-heavy ATS systems

### Tier 4: BrightData (LinkedIn Fallback)
**Best for:** LinkedIn ONLY (when SerpAPI fails)  
**Success Rate:** 98%  
**Speed:** ~5 seconds  
**Cost:** $0.50 per request  
**Why Fourth:** Expensive but reliable

### Tier 5: Playwright (Universal Fallback)
**Best for:** Any site (final safety net)  
**Success Rate:** 80%  
**Speed:** ~8-10 seconds  
**Cost:** FREE  
**Why Last:** Free but slow, needs headless browser

---

## 📐 IMPLEMENTATION ARCHITECTURE

### File Structure
```
lib/services/
└── job-scraper.ts         // Main scraping logic (5-tier fallback)
    ├── detectPlatform()    // LinkedIn vs StepStone vs Greenhouse etc.
    ├── selectScraperStrategy()
    ├── scrapeJob()         // Main orchestrator
    ├── scrapeWithSerpAPI()
    ├── scrapeWithScraperAPI()
    ├── scrapeWithFirecrawl()
    ├── scrapeWithBrightData()
    └── scrapeWithPlaywright()

app/api/jobs/
└── scrape/
    └── route.ts            // POST endpoint
        ├── Validate input (Zod)
        ├── Check duplicates
        ├── Call job-scraper.ts
        ├── Insert into job_queue
        └── Return success/error

components/dashboard/
└── add-job-dialog.tsx      // Updated to call /api/jobs/scrape
```

---

## 💻 IMPLEMENTATION PHASE 1: Core Scraping Service

### Goal: Build `lib/services/job-scraper.ts` with 5-tier fallback

**Key Requirements:**
1. **Platform Detection:** Identify site type from URL
2. **Strategy Selection:** Choose optimal scraper order per platform
3. **Graceful Fallback:** Try each tier sequentially until success
4. **Cost Tracking:** Log API costs per attempt
5. **Error Handling:** Return meaningful errors for manual fallback

### Platform Detection Logic

```typescript
// lib/services/job-scraper.ts

export type SiteType = 
  | 'linkedin' 
  | 'indeed' 
  | 'stepstone' 
  | 'xing'
  | 'greenhouse' 
  | 'lever' 
  | 'workday' 
  | 'taleo'
  | 'ashby'
  | 'breezy'
  | 'company_website' 
  | 'unknown';

function detectPlatform(url: string): SiteType {
  const domain = new URL(url).hostname.toLowerCase();
  
  // Job Boards (Tier 1: SerpAPI)
  if (domain.includes('linkedin.com')) return 'linkedin';
  if (domain.includes('indeed.com') || domain.includes('indeed.de')) return 'indeed';
  if (domain.includes('stepstone.de') || domain.includes('stepstone.com')) return 'stepstone';
  if (domain.includes('xing.com')) return 'xing';
  
  // ATS Platforms (Tier 3: Firecrawl)
  if (domain.includes('greenhouse.io')) return 'greenhouse';
  if (domain.includes('lever.co')) return 'lever';
  if (domain.includes('workday.com')) return 'workday';
  if (domain.includes('taleo.net')) return 'taleo';
  if (domain.includes('ashbyhq.com')) return 'ashby';
  if (domain.includes('breezy.hr')) return 'breezy';
  
  // Company Websites
  if (domain.includes('jobs.') || domain.includes('karriere.') || domain.includes('career.')) {
    return 'company_website';
  }
  
  return 'unknown';
}
```

### Strategy Selection (CRITICAL: Platform-Specific)

```typescript
interface ScraperConfig {
  primary: string;
  fallback: string[];
  reason: string;
}

function selectScraperStrategy(platform: SiteType): ScraperConfig {
  const strategies: Record<SiteType, ScraperConfig> = {
    // JOB BOARDS: SerpAPI FIRST!
    linkedin: {
      primary: 'serpapi',
      fallback: ['scraperapi', 'brightdata', 'playwright'],
      reason: 'SerpAPI aggregates LinkedIn Jobs without scraping'
    },
    indeed: {
      primary: 'serpapi',
      fallback: ['scraperapi', 'playwright'],
      reason: 'SerpAPI has Indeed integration'
    },
    stepstone: {
      primary: 'serpapi',
      fallback: ['scraperapi', 'playwright'],
      reason: 'SerpAPI supports StepStone via Google Jobs'
    },
    xing: {
      primary: 'scraperapi',
      fallback: ['playwright'],
      reason: 'Xing not in SerpAPI, needs direct scraping'
    },
    
    // ATS PLATFORMS: Firecrawl FIRST!
    greenhouse: {
      primary: 'firecrawl',
      fallback: ['scraperapi', 'playwright'],
      reason: 'Greenhouse uses React, needs JS rendering'
    },
    lever: {
      primary: 'firecrawl',
      fallback: ['scraperapi', 'playwright'],
      reason: 'Lever has dynamic content'
    },
    workday: {
      primary: 'firecrawl',
      fallback: ['scraperapi', 'playwright'],
      reason: 'Workday complex forms'
    },
    taleo: {
      primary: 'firecrawl',
      fallback: ['playwright'],
      reason: 'Taleo legacy ATS'
    },
    ashby: {
      primary: 'firecrawl',
      fallback: ['playwright'],
      reason: 'Modern ATS with JS'
    },
    breezy: {
      primary: 'firecrawl',
      fallback: ['playwright'],
      reason: 'Breezy modern ATS'
    },
    
    // COMPANY WEBSITES: Playwright safest
    company_website: {
      primary: 'playwright',
      fallback: ['scraperapi', 'firecrawl'],
      reason: 'Unknown structure, local is safest'
    },
    
    unknown: {
      primary: 'playwright',
      fallback: ['scraperapi'],
      reason: 'Unknown site, use universal scraper'
    }
  };
  
  return strategies[platform];
}
```

### Main Scraping Orchestrator

```typescript
import { getJson } from 'serpapi';
import axios from 'axios';
import Firecrawl from '@mendable/firecrawl-js';
import { chromium } from 'playwright';

export interface ScrapedJobData {
  title: string;
  company: string;
  location?: string;
  description: string;
  requirements?: string[];
  salary?: string;
  platform: SiteType;
  posted_at?: Date;
  apply_url: string;
}

export interface JobScraperResult {
  success: boolean;
  data?: ScrapedJobData;
  error?: string;
  method: 'serpapi' | 'scraperapi' | 'firecrawl' | 'brightdata' | 'playwright' | 'manual_fallback';
  duration: number;
  cost: number; // in cents
}

export async function scrapeJob(url: string): Promise<JobScraperResult> {
  const startTime = Date.now();
  const platform = detectPlatform(url);
  const strategy = selectScraperStrategy(platform);
  
  console.log(`🔍 Scraping ${url} (${platform})...`);
  console.log(`📋 Strategy: ${strategy.primary} → ${strategy.fallback.join(' → ')}`);
  
  // Try primary scraper
  const allScrapers = [strategy.primary, ...strategy.fallback];
  
  for (const scraper of allScrapers) {
    try {
      console.log(`🔄 Trying ${scraper}...`);
      let result: JobScraperResult;
      
      switch (scraper) {
        case 'serpapi':
          result = await scrapeWithSerpAPI(url, platform);
          break;
        case 'scraperapi':
          result = await scrapeWithScraperAPI(url, platform);
          break;
        case 'firecrawl':
          result = await scrapeWithFirecrawl(url, platform);
          break;
        case 'brightdata':
          result = await scrapeWithBrightData(url, platform);
          break;
        case 'playwright':
          result = await scrapeWithPlaywright(url, platform);
          break;
        default:
          continue;
      }
      
      if (result.success) {
        console.log(`✅ ${scraper} succeeded in ${result.duration}ms (cost: $${(result.cost / 100).toFixed(4)})`);
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
    duration: Date.now() - startTime,
    cost: 0
  };
}
```

### Tier 1: SerpAPI Implementation

```typescript
async function scrapeWithSerpAPI(url: string, platform: SiteType): Promise<JobScraperResult> {
  const startTime = Date.now();
  
  try {
    // Extract search query from URL
    const searchQuery = extractSearchQueryFromUrl(url, platform);
    
    const results = await getJson({
      engine: 'google_jobs',
      q: searchQuery,
      location: 'Berlin, Germany',
      api_key: process.env.SERPAPI_KEY,
      hl: 'de',
      num: 10
    });
    
    const jobs = results.jobs_results || [];
    
    // Find matching job by URL similarity or first result
    const matchingJob = jobs.find((job: any) => 
      normalizeUrl(job.share_url || job.apply_options?.[0]?.link || '') === normalizeUrl(url)
    ) || jobs[0];
    
    if (!matchingJob) {
      throw new Error('Job not found in SerpAPI results');
    }
    
    return {
      success: true,
      data: {
        title: matchingJob.title,
        company: matchingJob.company_name,
        location: matchingJob.location,
        description: matchingJob.description || '',
        requirements: extractRequirements(matchingJob.description || ''),
        salary: matchingJob.detected_extensions?.salary,
        posted_at: matchingJob.detected_extensions?.posted_at 
          ? new Date(matchingJob.detected_extensions.posted_at) 
          : undefined,
        platform: platform,
        apply_url: url
      },
      method: 'serpapi',
      duration: Date.now() - startTime,
      cost: 1 // $0.01
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      method: 'serpapi',
      duration: Date.now() - startTime,
      cost: 1 // Still charged
    };
  }
}
```

### Tier 2: ScraperAPI Implementation

```typescript
async function scrapeWithScraperAPI(url: string, platform: SiteType): Promise<JobScraperResult> {
  const startTime = Date.now();
  
  try {
    const response = await axios.get('http://api.scraperapi.com', {
      params: {
        api_key: process.env.SCRAPER_API_KEY,
        url: url,
        render: 'true', // Enable JS rendering
        country_code: 'de'
      },
      timeout: 30000
    });
    
    const html = response.data;
    
    // Parse HTML using cheerio or regex
    const { parseJobFromHTML } = await import('./html-parser');
    const jobData = parseJobFromHTML(html, platform);
    
    if (!jobData.title || !jobData.company) {
      throw new Error('Could not extract job title or company');
    }
    
    return {
      success: true,
      data: {
        ...jobData,
        platform,
        apply_url: url
      },
      method: 'scraperapi',
      duration: Date.now() - startTime,
      cost: 0.1 // $0.001
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      method: 'scraperapi',
      duration: Date.now() - startTime,
      cost: 0.1 // Still charged
    };
  }
}
```

### Tier 3: Firecrawl Implementation

```typescript
async function scrapeWithFirecrawl(url: string, platform: SiteType): Promise<JobScraperResult> {
  const startTime = Date.now();
  
  try {
    const firecrawl = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY });
    
    const result = await firecrawl.scrape(url, {
      formats: ['markdown', 'html'],
      onlyMainContent: true,
      timeout: 30000
    });
    
    const markdown = result.markdown || '';
    const html = result.html || '';
    
    // Extract structured data from markdown
    const jobData = extractJobFromMarkdown(markdown, html, platform);
    
    if (!jobData.title || !jobData.company) {
      throw new Error('Could not extract job title or company');
    }
    
    return {
      success: true,
      data: {
        ...jobData,
        platform,
        apply_url: url
      },
      method: 'firecrawl',
      duration: Date.now() - startTime,
      cost: 0.2 // $0.002
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      method: 'firecrawl',
      duration: Date.now() - startTime,
      cost: 0.2 // Still charged
    };
  }
}
```

### Tier 4: BrightData Implementation (LinkedIn Only)

```typescript
async function scrapeWithBrightData(url: string, platform: SiteType): Promise<JobScraperResult> {
  const startTime = Date.now();
  
  // Only use for LinkedIn
  if (platform !== 'linkedin') {
    throw new Error('BrightData only supported for LinkedIn');
  }
  
  try {
    const response = await axios.post('https://api.brightdata.com/collect', {
      url: url,
      format: 'json',
      country: 'de'
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.BRIGHTDATA_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
    
    const data = response.data;
    
    return {
      success: true,
      data: {
        title: data.title,
        company: data.company,
        location: data.location,
        description: data.description,
        requirements: extractRequirements(data.description),
        salary: data.salary,
        platform: 'linkedin',
        apply_url: url
      },
      method: 'brightdata',
      duration: Date.now() - startTime,
      cost: 50 // $0.50
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      method: 'brightdata',
      duration: Date.now() - startTime,
      cost: 50 // Still charged
    };
  }
}
```

### Tier 5: Playwright Implementation (Universal Fallback)

```typescript
async function scrapeWithPlaywright(url: string, platform: SiteType): Promise<JobScraperResult> {
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
        platform: platform,
        apply_url: url
      },
      method: 'playwright',
      duration: Date.now() - startTime,
      cost: 0 // FREE
    };
  } catch (error: any) {
    await browser.close();
    return {
      success: false,
      error: error.message,
      method: 'playwright',
      duration: Date.now() - startTime,
      cost: 0
    };
  }
}
```

### Helper Functions

```typescript
// Extract search query from URL for SerpAPI
function extractSearchQueryFromUrl(url: string, platform: string): string {
  if (platform === 'stepstone') {
    const match = url.match(/--(.+?)-(\w+)-(\d+)\.html/);
    if (match) {
      return match[1].replace(/-/g, ' ');
    }
  }
  
  if (platform === 'indeed') {
    const urlObj = new URL(url);
    const jk = urlObj.searchParams.get('jk');
    if (jk) {
      return `Indeed job ${jk}`;
    }
  }
  
  // Generic fallback
  const domain = new URL(url).hostname.split('.')[0];
  return `${domain} jobs Berlin`;
}

// Normalize URL for comparison
function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname}`.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

// Extract requirements from description
function extractRequirements(description: string): string[] {
  const requirements: string[] = [];
  
  const patterns = [
    /\b\d+\+? years? (of )?experience/gi,
    /Bachelor'?s|Master'?s|PhD/gi,
    /\b[A-Z][a-z]+Script\b/g,
    /\bReact|Vue|Angular|Node\.?js|Python|Java\b/gi,
    /\bAWS|Azure|GCP|Docker|Kubernetes\b/gi
  ];
  
  patterns.forEach(pattern => {
    const matches = description.match(pattern);
    if (matches) {
      requirements.push(...matches);
    }
  });
  
  return [...new Set(requirements)].slice(0, 10);
}
```

---

## 💻 IMPLEMENTATION PHASE 2: API Endpoint

### Goal: Create `/app/api/jobs/scrape/route.ts`

```typescript
// app/api/jobs/scrape/route.ts

import { scrapeJob } from '@/lib/services/job-scraper';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import crypto from 'crypto';

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
        url_hash: crypto.createHash('md5').update(jobUrl).digest('hex'),
        job_title: scrapResult.data!.title,
        company: scrapResult.data!.company,
        location: scrapResult.data!.location,
        salary_range: scrapResult.data!.salary,
        description: scrapResult.data!.description,
        requirements: scrapResult.data!.requirements,
        platform: scrapResult.data!.platform,
        snapshot_html: null, // TODO: Save full HTML
        snapshot_at: new Date().toISOString(),
        status: 'pending',
        scraping_method: scrapResult.method,
        scraping_cost_cents: scrapResult.cost,
        user_profile_id: userId
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
        duration: scrapResult.duration,
        cost: scrapResult.cost / 100 // Convert to dollars
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

## 💻 IMPLEMENTATION PHASE 3: Frontend Update

### Update `components/dashboard/add-job-dialog.tsx`

**Change:** Line 33-50 (API call)

```typescript
const res = await fetch('/api/jobs/scrape', {  // Changed from /api/jobs/process
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        userId: '00000000-0000-0000-0000-000000000000', // Mock User ID
        jobUrl: url,
        company: company || undefined,
        jobTitle: title || undefined
    }),
});
```

---

## ✅ VERIFICATION CHECKLIST

### Pre-Implementation
- [ ] All prerequisite docs read (ARCHITECTURE, SCRAPING_STRATEGY, CLAUDE, schema)
- [ ] Environment variables added to `.env.local` and `.env.example`
- [ ] Playwright installed: `npx playwright install chromium`
- [ ] API keys obtained (SerpAPI, ScraperAPI, Firecrawl, BrightData)

### During Implementation
- [ ] TypeScript strict mode: `npx tsc --noEmit` passes
- [ ] All 5 scrapers implemented and tested individually
- [ ] Platform detection covers all 12 site types
- [ ] Strategy selection matches SCRAPING_STRATEGY.md
- [ ] Error handling on all async operations
- [ ] Cost tracking on all API calls

### Post-Implementation
- [ ] Test with REAL URLs (LinkedIn, StepStone, Indeed, Greenhouse, company sites)
- [ ] Verify fallback works (disable APIs one by one)
- [ ] Check database insert (job appears in queue)
- [ ] Verify Agent 3 (Company Research) can process job
- [ ] Verify Agent 5 (Cover Letter) can generate from job
- [ ] Check duplicate prevention (add same URL twice)
- [ ] Verify cost tracking logs
- [ ] Test timeout handling (30s max per scraper)

---

## 🎯 SUCCESS CRITERIA

✅ User can paste URLs from LinkedIn, StepStone, Indeed, Greenhouse, Lever, Workday, company sites  
✅ Platform auto-detected correctly (12 site types)  
✅ Best scraper selected per platform (5-tier strategy)  
✅ Graceful fallback through all 5 tiers  
✅ Job scraped within 10-15 seconds (avg)  
✅ Job appears in Dashboard queue with status `pending`  
✅ Failed scrapes show user-friendly error  
✅ Duplicate applications blocked with clear warning  
✅ Cost tracking works for all paid APIs  
✅ No breaking changes to Agent 3 or Agent 5  
✅ Playwright works as final universal fallback  

---

## 📊 EXPECTED METRICS

### Success Rates (5-Tier System)
- LinkedIn (via SerpAPI): 99%
- StepStone (via SerpAPI): 95%
- Indeed (via SerpAPI): 99%
- Greenhouse (via Firecrawl): 95%
- Lever (via Firecrawl): 95%
- Workday (via Firecrawl): 90%
- Company Sites (via Playwright): 85%
- Overall: **94%**

### Performance
- SerpAPI: ~2 seconds
- ScraperAPI: ~3 seconds
- Firecrawl: ~2 seconds
- BrightData: ~5 seconds
- Playwright: ~10 seconds
- Average: **~4 seconds** (with smart tier selection)

### Cost (per 100 jobs)
- SerpAPI: 60 jobs × $0.01 = $0.60
- Firecrawl: 25 jobs × $0.002 = $0.05
- Playwright: 15 jobs × $0 = $0
- Total: **$0.65/100 jobs** (MVP cost)

---

## 🚫 CRITICAL NOTES

### DO NOT
- ❌ Use Firecrawl for job boards (LinkedIn, Indeed) — Use SerpAPI!
- ❌ Use BrightData unless LinkedIn AND other methods failed — Too expensive!
- ❌ Skip platform detection — Strategy depends on site type!
- ❌ Ignore cost tracking — Budget monitoring required!
- ❌ Use `any` types — TypeScript strict mode!

### DO
- ✅ Follow SCRAPING_STRATEGY.md tier order exactly
- ✅ Log all scraping attempts with costs
- ✅ Implement exponential backoff on retries
- ✅ Cache scraping results for 24h
- ✅ Test with REAL URLs from all platforms
- ✅ Verify interoperability with Agent 3 & 5

---

## 🔗 DEPENDENCIES

### npm Packages
```bash
npm install serpapi axios @mendable/firecrawl-js playwright
npx playwright install chromium
```

### Environment Variables (.env.example)
```bash
# SCRAPING APIs
SERPAPI_KEY=your_serpapi_key_here
SCRAPER_API_KEY=your_scraperapi_key_here
FIRECRAWL_API_KEY=your_firecrawl_api_key_here
BRIGHTDATA_API_KEY=your_brightdata_api_key_here
```

---

**Status:** 🚧 READY FOR IMPLEMENTATION (COMPLETE)  
**Estimated Time:** 6-8 hours (all 5 tiers)  
**Complexity:** High (5 API integrations)  
**Blockers:** Need API keys for SerpAPI, ScraperAPI, Firecrawl, BrightData  

---

**Remember:**
> "Platform detection drives strategy. Strategy drives success rate. Success rate drives user trust."  
> — SCRAPING_STRATEGY.md

---

**Questions? Check:**
- `docs/SCRAPING_STRATEGY.md` for complete API examples
- `lib/services/company-enrichment.ts` for service structure patterns
- `database/schema.sql` for exact column names
