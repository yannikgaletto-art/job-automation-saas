# AGENT 1: JOB DISCOVERY DIRECTIVE

**Version:** 1.0  
**Last Updated:** 2026-02-11  
**Agent:** Job Discovery (Scraper Agent)  

---

## 1. PURPOSE

Find and parse job postings from various sources with intelligent platform detection and anti-bot measures.

---

## 2. WHEN TO EXECUTE

### Pillar 1 (Manual Application)
- User submits job URL via Dashboard
- Triggered immediately

### Pillar 2 (Automation)
- Cron job (daily, 8-10 AM with jitter)
- Triggered by scheduler

---

## 3. INPUT REQUIREMENTS

### Pillar 1
```json
{
  "job_url": "https://linkedin.com/jobs/...",
  "user_id": "uuid",
  "pillar": "manual"
}
```

### Pillar 2
```json
{
  "search_query": "Software Engineer Berlin",
  "user_profile": {
    "skills": ["Python", "AWS"],
    "location": "Berlin",
    "salary_min": 70000
  },
  "pillar": "automation"
}
```

---

## 4. SCRAPING STRATEGY (PILLAR-SPECIFIC)

### Pillar 1: User-Submitted URL (Platform-Specific)

**Goal:** Extract job details from specific URL user provided.

**Strategy:**
1. **Platform Detection**
   ```python
   def detect_platform(url: str) -> str:
       if 'linkedin.com' in url:
           return 'linkedin'
       elif 'greenhouse.io' in url:
           return 'greenhouse'
       elif 'lever.co' in url:
           return 'lever'
       # ... etc
   ```

2. **Tool Selection**
   - **LinkedIn/Indeed**: ScraperAPI (primary) - handles anti-bot
   - **ATS Systems** (Greenhouse, Lever, Workday): Firecrawl
   - **Company Career Pages**: Playwright (headless browser)

3. **Fallback Chain**
   ```
   Platform Scraper (30s timeout)
     ↓ [FAIL]
   ScraperAPI (60s timeout)
     ↓ [FAIL]
   Playwright (120s timeout)
     ↓ [FAIL]
   Manual Review Required (notify user)
   ```

### Pillar 2: Automated Search (Aggregation)

**Goal:** Find multiple matching jobs across all platforms.

**Strategy:**
1. **Primary: SerpAPI** (Aggregates all job boards)
   ```python
   from serpapi import GoogleSearch
   
   params = {
       "engine": "google_jobs",
       "q": "Software Engineer Berlin",
       "location": "Berlin, Germany",
       "hl": "en",
       "api_key": os.getenv('SERPAPI_KEY')
   }
   
   search = GoogleSearch(params)
   results = search.get_dict()
   jobs = results.get('jobs_results', [])
   ```

2. **Fallback: ScraperAPI + Direct Scraping**
   - If SerpAPI rate limit hit or fails
   - Scrape LinkedIn/Indeed directly

3. **Final Fallback: Playwright**
   - For platforms not covered by APIs

---

## 5. ANTI-BOT PROTOCOL

**Apply to ALL scraping methods:**

1. **User-Agent Rotation**
   ```python
   USER_AGENTS = [
       'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36...',
       'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)...',
       # ... 50+ variations
   ]
   ```

2. **Random Delays**
   ```python
   import random
   time.sleep(random.uniform(2, 5))  # Human-like delays
   ```

3. **Headless Browser with Stealth**
   ```python
   from playwright.sync_api import sync_playwright
   from playwright_stealth import stealth_sync
   
   with sync_playwright() as p:
       browser = p.chromium.launch(headless=True)
       page = browser.new_page()
       stealth_sync(page)
   ```

4. **Residential Proxies** (Bright Data)
   ```python
   PROXY = {
       'server': os.getenv('BRIGHT_DATA_PROXY'),
       'username': os.getenv('BRIGHT_DATA_USER'),
       'password': os.getenv('BRIGHT_DATA_PASS')
   }
   ```

5. **CAPTCHA Handling** (2Captcha API)
   ```python
   from twocaptcha import TwoCaptcha
   
   solver = TwoCaptcha(os.getenv('2CAPTCHA_API_KEY'))
   result = solver.recaptcha(
       sitekey='6Ld2sf4SAAAAAKSgzs0Q13IZhY02Pyo31S2jgOB5',
       url='https://example.com'
   )
   ```

---

## 6. PARSING LOGIC

**Use BeautifulSoup for HTML parsing:**

```python
from bs4 import BeautifulSoup

def parse_job_html(html: str, platform: str) -> dict:
    soup = BeautifulSoup(html, 'html.parser')
    
    if platform == 'linkedin':
        title = soup.find('h1', class_='job-title').text.strip()
        company = soup.find('a', class_='company-name').text.strip()
        # ...
    
    elif platform == 'greenhouse':
        title = soup.find('h1', class_='app-title').text.strip()
        # ...
    
    return {
        'title': title,
        'company': company,
        'location': location,
        'description': description,
        'requirements': requirements,
        'salary_range': salary_range,
        'job_url': job_url,
        'application_url': application_url
    }
```

---

## 7. OUTPUT SCHEMA

**Store in `job_queue` table:**

```json
{
  "id": "uuid",
  "user_id": "uuid",
  "title": "Senior Software Engineer",
  "company": "TechCorp GmbH",
  "location": "Berlin, Germany",
  "description": "We are looking for...",
  "requirements": ["5+ years Python", "AWS experience"],
  "salary_range": "70k-90k EUR",
  "job_url": "https://...",
  "application_url": "https://...",
  "platform": "linkedin",
  "pillar": "manual",
  "status": "scraped",
  "scraped_at": "2026-02-11T15:30:00Z",
  "scraping_method": "scrapapi"
}
```

---

## 8. ERROR HANDLING

### Retry Logic

```python
from tenacity import retry, stop_after_attempt, wait_exponential

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=4, max=10)
)
def scrape_with_retry(url: str):
    return scrape_job(url)
```

### Fallback Chain

**Pillar 1:**
```
Platform Scraper → ScraperAPI → Playwright → Manual Review
```

**Pillar 2:**
```
SerpAPI → ScraperAPI → Playwright → Skip Job
```

### Logging

```python
import logging

logger = logging.getLogger(__name__)

try:
    job_data = scrape_job(url)
except Exception as e:
    logger.error(f"Scraping failed for {url}: {e}")
    
    # Log to Supabase
    supabase.table('failed_scrapes').insert({
        'url': url,
        'error': str(e),
        'platform': platform,
        'timestamp': datetime.now().isoformat()
    })
    
    # Alert admin if critical
    if platform == 'linkedin' and retry_count >= 3:
        send_alert('LinkedIn scraping failing repeatedly')
```

---

## 9. SUCCESS CRITERIA

- ✅ Job data extracted with all required fields
- ✅ Stored in `job_queue` table
- ✅ Status set to `scraped`
- ✅ No anti-bot blocks (< 5% failure rate)
- ✅ Processing time < 30 seconds (Pillar 1), < 5 minutes (Pillar 2 batch)

---

## 10. MONITORING METRICS

Track in `stats.md`:

- Success rate per platform
- Average scraping time
- Failure reasons (timeout, anti-bot, parsing error)
- API costs (SerpAPI, ScraperAPI)
- CAPTCHA solve rate

---

**Status:** ACTIVE  
**Next Review:** After 100 scrapes  
