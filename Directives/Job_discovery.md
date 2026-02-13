AGENT 1 – JOB DISCOVERY DIRECTIVE

**Agent:** 1 – Job Discovery (Scraper)  
**For:** Pillar 1 (Manual) and Pillar 2 (Automation)  
**Execution Script:** `execution/scrape_job.py`  
**Related Docs:**  
- `AGENTS.md` – Agent overview and anti-bot stack  
- `docs/ARCHITECTURE.md` – End-to-end flows and status transitions  

---

## 1. GOAL

Reliably scrape structured job data from various sources (job boards and company pages) for both manual and automated applications, with robust anti-bot handling and smart fallback to alternative job sources.

---

## 2. TRIGGERS

### Pillar 1 – Manual Application

- User saves or submits a **single job URL** in the dashboard.
- Trigger: `on_user_job_url_created(job_id)`.

### Pillar 2 – Automation

- Daily cron job in the 8–10 AM window (with jitter) starts a background scraping run.
- Trigger: `on_cron_daily_scrape()` for each active user profile and search configuration.

---

## 3. INPUT / OUTPUT CONTRACT

### Input

For Pillar 1 (manual URL):

```json
{
  "mode": "manual",
  "job_id": "uuid",
  "job_url": "https://example.com/job/123",
  "user_id": "uuid"
}
For Pillar 2 (automated search):

json
{
  "mode": "auto",
  "user_id": "uuid",
  "search_profile_id": "uuid",
  "search_query": "Software Engineer",
  "locations": ["Berlin, Germany"],
  "platforms": ["linkedin", "indeed", "xing"],
  "limit_per_platform": 50
}
Output

Each successfully scraped job MUST conform to:

json
{
  "job_id": "uuid",
  "title": "Senior Software Engineer",
  "company": "TechCorp GmbH",
  "location": "Berlin, Germany",
  "description": "Full job description text...",
  "requirements": [
    "5+ years Python",
    "Experience with AWS"
  ],
  "salary_range": "70k-90k EUR",
  "employment_type": "Full-time",
  "remote_type": "Hybrid",
  "job_url": "https://original-job-url",
  "application_url": "https://apply-url-or-same-as-job_url",
  "source_platform": "linkedin",
  "language": "de",
  "scraped_at": "ISO-8601 timestamp",
  "status": "scraped"
}
Data is stored in job_queue (or equivalent) with status = 'scraped' on success, or status = 'failed' with failure_reason on final failure.

4. PROCESS
High-level steps (details live in execution/scrape_job.py and skills/web_scraper.py):

Resolve Mode and Inputs

If mode = manual: use the provided job_url.

If mode = auto: generate search URLs or API calls per platform and search_query.

Primary Scrape (Source URL)

Detect platform (LinkedIn, Indeed, Greenhouse, Lever, Workday, Xing, company site, other).

Use Playwright-based scraper with human-like behavior to load the page and extract job data.

Parse HTML into the normalized output structure.

Minimal Validation

Required: title, company, location, description.

If any of these are missing or implausibly short, treat as parse_failed.

Alternative Source Discovery (Your Added Requirement)

If the primary scrape fails (blocked, parse_failed, missing fields) OR the page has almost no job content:

Construct a search query using best-known fields:

Use available title, company, location if known, else user’s search query.

Example: "Senior Software Engineer" "TechCorp" Berlin Stellenangebot.

Perform a constrained web search (e.g. via SERP API) for:

Known ATS platforms: greenhouse.io, lever.co, workday.com, smartrecruiters.com.

Company career page (e.g. careers.techcorp.com, /jobs, /karriere).

Rank candidate URLs by:

Domain (official company domain or major ATS preferred).

Query match (title + company + location).

Try up to 2 alternative URLs:

For each candidate URL: run the normal scraping pipeline again.

On first successful scrape (passes validation), stop and use that as the canonical job record.

Store a reference to the original user-submitted URL or search context to keep traceability.

Deduplication

Before inserting, check for existing jobs:

Same job_url, OR

Same (company, title, location) within last 60 days.

If found:

Do not create a new record; update last_seen_at and source_platform list.

Log deduplication event.

Persist and Log

On success: insert/update in job_queue with status = 'scraped'.

On final failure after all fallbacks: insert or update with status = 'failed' and detailed failure_reason.

Log platform, time, and result for metrics.

5. EDGE CASES & PLAYBOOKS
Situation	Action
HTTP 429 / bot detected on primary source	Retry with exponential backoff (3 attempts), then switch to ScraperAPI as fallback.
Page loads but no recognizable job content	Mark as parse_failed, then trigger Alternative Source Discovery (step 4).
Company career page uses heavy JS / SPA	Ensure Playwright waits for network idle and key selectors before parsing; increase timeout.
Duplicate job detected	Do not create a new job; update last_seen_at, append source_platform if new.
Language of job not equal to user language	Keep job, set language correctly; later agents decide whether to use it.
Alternative sources also fail	Mark job as failed, failure_reason = 'all_sources_failed', and do not retry until next cron run (Pillar 2) or user manually intervenes (Pillar 1).
6. ERROR HANDLING
Retry Strategy

Network/timeout errors:

Retry up to 3 times per URL with exponential backoff (e.g. 2s, 5s, 10s).

Platform-level 429 / bot-block:

Switch to ScraperAPI after first blocked attempt.

If ScraperAPI also fails, skip this URL and mark as blocked.

Fallback Strategy

Primary Scrape (Playwright).

Fallback Scrape (ScraperAPI).

Alternative Source Discovery (up to 2 alternative URLs).

If all fail → mark as failed.

Abort Conditions

More than X consecutive failures for the same platform in a single run (e.g. >20% block rate) → abort scraping for that platform for this run and log a system alert.

HTML structure unexpected and unparseable across multiple jobs from the same domain → mark domain as needs_selector_update.

7. TESTING & DONE CRITERIA
Test Checklist

 Scrape at least 20 known job URLs (mix of LinkedIn, Indeed, Greenhouse, Lever, Workday, company sites).

 At least 90% of test URLs result in valid job records (all required fields set).

 Alternative Source Discovery successfully recovers at least 3/5 intentionally broken primary URLs.

 Deduplication prevents duplicate entries for the same job.

 Error handling produces no uncaught exceptions in logs.

Definition of Done

Agent 1 is considered production-ready when:

It passes the above tests.

Metrics are logged and visible in stats.md (scrape success rate, block rate, average scrape time).

No critical unhandled errors appear during a full daily run for at least 3 consecutive days.

8. METRICS TO TRACK
scrape_success_rate = successful scrapes / total attempted.

block_rate_by_platform (e.g. LinkedIn vs Indeed).

avg_scrape_time_ms per job and per platform.

alt_source_recovery_rate = recovered jobs via alternative source / total parse_failed.

duplicate_rate = deduplicated jobs / total attempted inserts.
