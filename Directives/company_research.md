AGENT 3 – COMPANY RESEARCH DIRECTIVE

**Agent:** 3 – Company Research  
**For:** Pillar 1 (Manual) and Pillar 2 (Automation)  
**Execution Script:** `execution/research_company.py`  
**Related Docs:**  
- `AGENTS.md` – Perplexity usage and purpose  
- `docs/ARCHITECTURE.md` – Company intel schema and writing-style integration  

---

## 1. GOAL

Provide accurate, up-to-date, and structured company intelligence (values, vision, recent news, culture) using Perplexity so that downstream agents (CV and cover letter) never hallucinate company facts.

---

## 2. TRIGGERS

### Pillar 1 – Manual Application

- After Agent 1 scrapes a user-submitted job.
- Trigger: `on_manual_job_ready_for_research(job_id)`.

### Pillar 2 – Automation

- After Agent 2 marks a job as `matched`.
- Trigger: `on_job_matched(job_id)`.

---

## 3. INPUT / OUTPUT CONTRACT

### Input

```json
{
  "job_id": "uuid",
  "company_name": "Stripe",
  "job_title": "Product Designer",
  "job_location": "Berlin, Germany",
  "user_language": "de"
}
Output

json
{
  "job_id": "uuid",
  "company_name": "Stripe",
  "founded": "2010",
  "core_values": ["User-first", "Move fast", "Think rigorously"],
  "recent_news": [
    {
      "title": "Stripe launches Billing 2.0",
      "date": "2026-01-15",
      "url": "https://...",
      "relevance": "high"
    }
  ],
  "vision": "Increase the GDP of the internet",
  "culture_notes": ["Remote-friendly", "Strong documentation culture"],
  "suggested_quotes": [
    {
      "quote": "Payment infrastructure that scales...",
      "author": "Patrick Collison",
      "match_score": 0.95
    }
  ],
  "citations": ["source1", "source2"],
  "intel_freshness_days": 3,
  "intel_source": "perplexity_sonar_pro",
  "researched_at": "ISO-8601 timestamp"
}
Stored in company_research (or equivalent) keyed by company_name and optionally region.

4. PROCESS
Check Cache

Look up existing company intel for company_name in company_research.

If researched_at < 30 days ago:

Reuse structural data: founded, core_values, vision, culture_notes.

If researched_at < 7 days ago:

Reuse recent_news.

If cache is fresh enough, return directly and skip API calls.

Call Perplexity (Sonar Pro)

Construct a prompt asking for:

Founding, mission, core values.

Last 3 months of relevant news.

Clear statement of vision and culture.

Use search_recency_filter = 'month' for news.

Request citations/URLs.

Parse and Normalize

Parse Perplexity response into the structured output schema.

Ensure arrays are non-empty; if no news, leave recent_news as empty array.

Optional Quote Suggestions

If requested (e.g. user uses quote-style openings), run a second, cheaper Perplexity or Claude query to find 2–3 relevant quotes matching the company values and role.

Store Results

Upsert record in company_research.

Set intel_freshness_days = 0 at creation time.

5. EDGE CASES & PLAYBOOKS
Situation	Action
Company not found / very sparse info	Store minimal intel (e.g. name only), mark intel_source = 'sparse', and skip quote suggestions.
Perplexity API failure	Retry up to 2 times; if still failing, fall back to SERP-based search with simple scraping, mark intel_source = 'fallback_serp'.
No recent news (last 3 months)	Just leave recent_news empty; do not hallucinate; rely on long-term vision/values.
Conflicting facts over time	Always trust newer intel; keep last_conflicting_update_at if needed.
Multi-brand / holding company	Focus on the brand that appears in the job posting; ignore parent conglomerate unless highly relevant.
6. ERROR HANDLING
Any Perplexity or fallback error:

Log error with job_id, company_name, and failure reason.

Mark intel for that job as research_failed and let downstream agents proceed without company-specific facts (they must then avoid company details).

7. TESTING & DONE CRITERIA
Test Checklist

 Run research for at least 10 well-known companies and manually verify correctness.

 Verify that repeated calls within 7 days use cached recent_news.

 Simulate Perplexity failure and ensure fallback logic works.

Definition of Done

No hallucinated company facts detected in manual review of 20 cover letters that use this intel.

Cache hit rate > 50% for repeat applications to the same companies over time.

No unhandled exceptions in logs for at least 1 week.

8. METRICS TO TRACK
research_latency_ms per company.

cache_hit_rate vs api_call_rate.

fallback_rate (how often we hit SERP fallback).

Manual hallucination reports from users (if later tracked).
