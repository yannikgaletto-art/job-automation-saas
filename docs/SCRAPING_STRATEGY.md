# PATHLY V2.0 - INTELLIGENT SCRAPING STRATEGY

**Status:** Production-Ready
**Version:** 1.0
**Last Updated:** 2026-02-07

---

## 🎯 OVERVIEW

Pathly uses a **5-tier intelligent fallback system** for web scraping:

```
┌─────────────────────────────────────────────────┐
│  PRIORITY 1: Firecrawl (Modern, JS-heavy)     │
│  → If fails: Priority 2                        │
└─────────────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────────────┐
│  PRIORITY 2: SerpAPI (Google Jobs)             │
│  → If fails: Priority 3                        │
└─────────────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────────────┐
│  PRIORITY 3: ScraperAPI (Anti-bot bypass)      │
│  → If fails: Priority 4                        │
└─────────────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────────────┐
│  PRIORITY 4: BrightData (Enterprise LinkedIn)  │
│  → If fails: Priority 5                        │
└─────────────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────────────┐
│  PRIORITY 5: Playwright (Local, always works)  │
│  → Final fallback, no API key needed           │
└─────────────────────────────────────────────────┘
```

---

## 📊 API COMPARISON

| API | Best For | Rate Limit | Cost/Request | Success Rate | Speed |
|-----|----------|-----------|--------------|--------------|-------|
| **Firecrawl** | LinkedIn, Greenhouse, Lever | 500-10k/mo | $0.002 | 95% | Fast (2s) |
| **SerpAPI** | Multi-platform discovery | 100-5k/mo | $0.01 | 99% | Fast (1s) |
| **ScraperAPI** | Indeed, complex sites | 1k-100k/mo | $0.001 | 90% | Medium (3s) |
| **BrightData** | LinkedIn only | Unlimited | $0.50 | 98% | Slow (5s) |
| **Playwright** | Any site | Unlimited | Free | 80% | Slow (10s) |

---

## 🧠 DECISION LOGIC

### 1. SITE DETECTION

```typescript
function detectSiteType(url: string): SiteType {
  const domain = new URL(url).hostname
  
  // Tier 1: ATS Platforms (Applicant Tracking Systems)
  if (domain.includes('greenhouse.io')) return 'greenhouse'
  if (domain.includes('lever.co')) return 'lever'
  if (domain.includes('workday.com')) return 'workday'
  if (domain.includes('taleo.net')) return 'taleo'
  
  // Tier 2: Job Boards
  if (domain.includes('linkedin.com')) return 'linkedin'
  if (domain.includes('indeed.com')) return 'indeed'
  if (domain.includes('stepstone.de')) return 'stepstone'
  if (domain.includes('xing.com')) return 'xing'
  
  // Tier 3: Company Websites
  return 'company_website'
}
```

### 2. SCRAPER SELECTION

```typescript
interface ScraperConfig {
  primary: string
  fallback: string[]
  reason: string
}

function selectScraper(siteType: SiteType): ScraperConfig {
  const strategies: Record<SiteType, ScraperConfig> = {
    // ATS Platforms (JS-heavy, dynamic forms)
    greenhouse: {
      primary: 'firecrawl',
      fallback: ['scraperapi', 'playwright'],
      reason: 'Greenhouse uses React components, needs JS rendering'
    },
    lever: {
      primary: 'firecrawl',
      fallback: ['scraperapi', 'playwright'],
      reason: 'Lever has dynamic content loading'
    },
    workday: {
      primary: 'firecrawl',
      fallback: ['brightdata', 'playwright'],
      reason: 'Workday has complex anti-bot measures'
    },
    
    // Job Boards
    linkedin: {
      primary: 'firecrawl',
      fallback: ['brightdata', 'scraperapi', 'playwright'],
      reason: 'LinkedIn requires auth + JS rendering'
    },
    indeed: {
      primary: 'serpapi',
      fallback: ['scraperapi', 'playwright'],
      reason: 'SerpAPI has Indeed integration'
    },
    stepstone: {
      primary: 'scraperapi',
      fallback: ['playwright'],
      reason: 'StepStone is mostly static HTML'
    },
    
    // Company Websites (varies)
    company_website: {
      primary: 'playwright',
      fallback: ['scraperapi'],
      reason: 'Company sites vary, local scraping is safest'
    }
  }
  
  return strategies[siteType]
}
```

### 3. RATE LIMIT TRACKING

```typescript
interface RateLimitStatus {
  firecrawl: { remaining: number, resetAt: Date }
  serpapi: { remaining: number, resetAt: Date }
  scraperapi: { remaining: number, resetAt: Date }
  brightdata: { remaining: number, resetAt: Date }
}

async function checkRateLimits(): Promise<RateLimitStatus> {
  // Fetch from Supabase cache
  const { data } = await supabase
    .from('api_rate_limits')
    .select('*')
    .single()
  
  return data
}

function shouldSkipAPI(api: string, limits: RateLimitStatus): boolean {
  const status = limits[api]
  
  // Skip if less than 10% remaining
  if (status.remaining < 10) return true
  
  // Skip if reset time is > 24h away
  if (status.resetAt > new Date(Date.now() + 24 * 60 * 60 * 1000)) return true
  
  return false
}
```

---

## 🔄 EXECUTION FLOW

### Complete Scraping Pipeline

```typescript
import Firecrawl from '@firecrawl/firecrawl-node'
import { SerpApi } from 'serpapi'
import axios from 'axios'
import { chromium } from 'playwright'

interface ScrapeResult {
  success: boolean
  data?: JobData
  error?: string
  method: string
  cost: number
  duration: number
}

async function scrapeJob(url: string): Promise<ScrapeResult> {
  const startTime = Date.now()
  const siteType = detectSiteType(url)
  const strategy = selectScraper(siteType)
  const rateLimits = await checkRateLimits()
  
  // Build fallback chain
  const scrapers = [strategy.primary, ...strategy.fallback]
  
  for (const scraper of scrapers) {
    // Check if API should be skipped
    if (shouldSkipAPI(scraper, rateLimits)) {
      console.log(`Skipping ${scraper}: Rate limit reached`)
      continue
    }
    
    try {
      let result: ScrapeResult
      
      switch (scraper) {
        case 'firecrawl':
          result = await scrapeWithFirecrawl(url)
          break
        case 'serpapi':
          result = await scrapeWithSerpAPI(url)
          break
        case 'scraperapi':
          result = await scrapeWithScraperAPI(url)
          break
        case 'brightdata':
          result = await scrapeWithBrightData(url)
          break
        case 'playwright':
          result = await scrapeWithPlaywright(url)
          break
      }
      
      // Success!
      if (result.success) {
        await logScrapeSuccess(scraper, result)
        return result
      }
      
    } catch (error) {
      console.error(`${scraper} failed:`, error)
      await logScrapeFailure(scraper, error)
      // Continue to next fallback
    }
  }
  
  // All scrapers failed
  throw new Error('All scraping methods failed')
}
```

---

## 🛠️ IMPLEMENTATION

### 1. Firecrawl (Priority 1)

```typescript
import Firecrawl from '@firecrawl/firecrawl-node'

const firecrawl = new Firecrawl({
  apiKey: process.env.FIRECRAWL_API_KEY
})

async function scrapeWithFirecrawl(url: string): Promise<ScrapeResult> {
  const startTime = Date.now()
  
  try {
    const result = await firecrawl.scrapeUrl(url, {
      formats: ['markdown', 'html'],
      onlyMainContent: true,
      waitFor: 2000  // Wait for JS to load
    })
    
    // Extract structured data
    const jobData = extractJobData(result.markdown)
    
    return {
      success: true,
      data: jobData,
      method: 'firecrawl',
      cost: 0.002,
      duration: Date.now() - startTime
    }
  } catch (error) {
    return {
      success: false,
      error: error.message,
      method: 'firecrawl',
      cost: 0,
      duration: Date.now() - startTime
    }
  }
}
```

### 2. SerpAPI (Priority 2)

```typescript
import { getJson } from 'serpapi'

async function scrapeWithSerpAPI(url: string): Promise<ScrapeResult> {
  const startTime = Date.now()
  
  try {
    // Extract search params from URL
    const searchQuery = extractSearchFromUrl(url)
    
    const results = await getJson({
      engine: 'google_jobs',
      q: searchQuery,
      location: 'Berlin, Germany',
      api_key: process.env.SERPAPI_KEY
    })
    
    const jobs = results.jobs_results || []
    const matchingJob = jobs.find(job => 
      normalizeUrl(job.apply_link) === normalizeUrl(url)
    )
    
    if (!matchingJob) {
      throw new Error('Job not found in SerpAPI results')
    }
    
    return {
      success: true,
      data: {
        title: matchingJob.title,
        company: matchingJob.company_name,
        location: matchingJob.location,
        description: matchingJob.description,
        salary: matchingJob.detected_extensions?.salary,
        requirements: extractRequirements(matchingJob.description)
      },
      method: 'serpapi',
      cost: 0.01,
      duration: Date.now() - startTime
    }
  } catch (error) {
    return {
      success: false,
      error: error.message,
      method: 'serpapi',
      cost: 0,
      duration: Date.now() - startTime
    }
  }
}
```

### 3. ScraperAPI (Priority 3)

```typescript
async function scrapeWithScraperAPI(url: string): Promise<ScrapeResult> {
  const startTime = Date.now()
  
  try {
    const response = await axios.get('http://api.scraperapi.com', {
      params: {
        api_key: process.env.SCRAPER_API_KEY,
        url: url,
        render: true  // Enable JS rendering
      },
      timeout: 30000
    })
    
    const html = response.data
    const jobData = parseJobHTML(html)
    
    return {
      success: true,
      data: jobData,
      method: 'scraperapi',
      cost: 0.001,
      duration: Date.now() - startTime
    }
  } catch (error) {
    return {
      success: false,
      error: error.message,
      method: 'scraperapi',
      cost: 0,
      duration: Date.now() - startTime
    }
  }
}
```

### 4. Playwright (Priority 5 - Final Fallback)

```typescript
import { chromium } from 'playwright'

async function scrapeWithPlaywright(url: string): Promise<ScrapeResult> {
  const startTime = Date.now()
  const browser = await chromium.launch({ headless: true })
  
  try {
    const page = await browser.newPage()
    
    // Stealth mode
    await page.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)...',
      'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8'
    })
    
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
    
    // Wait for content to load
    await page.waitForSelector('h1, [class*="title"]', { timeout: 5000 })
    
    // Extract data
    const jobData = await page.evaluate(() => {
      const title = document.querySelector('h1')?.textContent
      const company = document.querySelector('[class*="company"]')?.textContent
      const description = document.querySelector('[class*="description"]')?.textContent
      
      return { title, company, description }
    })
    
    await browser.close()
    
    return {
      success: true,
      data: jobData,
      method: 'playwright',
      cost: 0,  // Free!
      duration: Date.now() - startTime
    }
  } catch (error) {
    await browser.close()
    return {
      success: false,
      error: error.message,
      method: 'playwright',
      cost: 0,
      duration: Date.now() - startTime
    }
  }
}
```

---

## 📈 PERFORMANCE TRACKING

### Log Every Scrape Attempt

```sql
CREATE TABLE scraping_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_url TEXT NOT NULL,
  site_type TEXT NOT NULL,
  
  -- Which scraper was used
  method TEXT NOT NULL,
  success BOOLEAN NOT NULL,
  error_message TEXT,
  
  -- Performance
  duration_ms INT NOT NULL,
  cost_usd FLOAT NOT NULL,
  
  -- For optimization
  rate_limit_hit BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_scraping_logs_method ON scraping_logs(method);
CREATE INDEX idx_scraping_logs_success ON scraping_logs(success);
```

### Dashboard Query

```sql
-- Success rate by scraper (last 7 days)
SELECT 
  method,
  COUNT(*) as attempts,
  SUM(CASE WHEN success THEN 1 ELSE 0 END) as successes,
  ROUND(AVG(CASE WHEN success THEN 1 ELSE 0 END) * 100, 2) as success_rate,
  ROUND(AVG(duration_ms), 0) as avg_duration_ms,
  ROUND(SUM(cost_usd), 2) as total_cost
FROM scraping_logs
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY method
ORDER BY success_rate DESC;
```

---

## 🚨 ERROR HANDLING

### Common Errors & Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| `Rate limit exceeded` | Too many requests | Switch to next fallback |
| `Timeout` | Site too slow | Increase timeout or skip |
| `403 Forbidden` | IP blocked | Use different scraper |
| `Captcha detected` | Anti-bot protection | Use BrightData or manual review |
| `Invalid API key` | Wrong credentials | Check .env file |

### Retry Logic

```typescript
import backoff from 'exponential-backoff'

async function scrapeJobWithRetry(url: string): Promise<ScrapeResult> {
  return await backoff.backOff(
    () => scrapeJob(url),
    {
      numOfAttempts: 3,
      startingDelay: 1000,  // 1s
      timeMultiple: 2,       // Exponential
      maxDelay: 10000,       // Max 10s
      retry: (error, attemptNumber) => {
        console.log(`Retry ${attemptNumber}: ${error.message}`)
        return true  // Always retry
      }
    }
  )
}
```

---

## 💰 COST OPTIMIZATION

### Monthly Budget Tracking

```typescript
interface MonthlyCosts {
  firecrawl: number
  serpapi: number
  scraperapi: number
  brightdata: number
  total: number
}

async function getMonthlyCosts(): Promise<MonthlyCosts> {
  const { data } = await supabase
    .from('scraping_logs')
    .select('method, cost_usd')
    .gte('created_at', new Date(new Date().setDate(1))) // Start of month
  
  const costs = data.reduce((acc, log) => {
    acc[log.method] = (acc[log.method] || 0) + log.cost_usd
    return acc
  }, {})
  
  costs.total = Object.values(costs).reduce((a, b) => a + b, 0)
  
  return costs
}

// Alert if over budget
if (costs.total > 100) {
  await sendAlert('Scraping costs exceeded $100 this month!')
}
```

---

## 🎯 BEST PRACTICES

1. **Always log every attempt** - Track success rates
2. **Monitor rate limits** - Prevent unnecessary failures
3. **Respect robots.txt** - Don't scrape if disallowed
4. **Cache aggressively** - Don't re-scrape same URL within 24h
5. **Use jitter** - Randomize request timing to avoid patterns
6. **Test fallbacks** - Verify each scraper works independently

---

**Status:** ✅ Production-Ready  
**Last Updated:** 2026-02-07  
**Version:** 1.0
