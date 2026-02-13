# AGENT 3: COMPANY RESEARCH DIRECTIVE

**Version:** 1.0  
**Last Updated:** 2026-02-13  
**Agent:** Company Research (Research Agent)  
**Implementation:** `skills/company_research.py`  
**Execution:** `execution/generate_cover_letter.py` (integrated)  

---

## 🎯 RULE #0: REDUCE COMPLEXITY

**Principle:** MVP over Perfection. Ship fast, iterate later.

**Applied to Company Research:**
- ✅ **7-day cache is perfect** → Simple, effective, balances freshness vs API costs
- ✅ **Single Perplexity call** → Don't over-research, one comprehensive query is enough
- ✅ **Structured JSON output** → Easy to parse, no complex NLP needed
- ❌ **Multi-source aggregation** → Don't combine Perplexity + Google + LinkedIn API
- ❌ **Real-time news alerts** → 7-day cache is fresh enough for cover letters
- ❌ **Sentiment analysis of reviews** → Not needed for MVP

**Motto:** "One good research query beats five mediocre ones."

---

## 1. PURPOSE

Gather real-time company intelligence to prevent AI hallucinations in cover letters.

### Why This Agent Exists

**Problem:** LLMs hallucinate company facts (fake products, wrong values, outdated news).

**Solution:** Fetch REAL data from Perplexity before generating cover letters.

**Impact:** Authentic, personalized cover letters that reference real company news/values.

---

## 2. WHEN TO EXECUTE

**Triggers:**
- Before Agent 5 generates cover letter (ALWAYS)
- After Agent 2 approves job (Pillar 2)
- After user submits job URL (Pillar 1)

**Frequency:**
- Cache check first (7-day TTL)
- API call only if cache miss

---

## 3. INPUT REQUIREMENTS

```python
{
  "company_name": "SAP SE",
  "force_refresh": false  # Optional: bypass cache
}
```

---

## 4. PROCESS

### Step 1: Check Cache (7-day TTL)

```python
from skills.company_research import CompanyResearcher
from supabase import create_client

supabase = create_client(url, key)
researcher = CompanyResearcher(supabase_client=supabase)

# Automatic cache check
intel = researcher.research_company("SAP SE")
# Returns cached data if < 7 days old
# Fetches from Perplexity if expired
```

**Cache Table:**
```sql
CREATE TABLE company_research (
    research_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name TEXT NOT NULL UNIQUE,
    intel_data JSONB NOT NULL,
    perplexity_citations JSONB DEFAULT '[]'::jsonb,
    expires_at TIMESTAMPTZ NOT NULL,
    researched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

### Step 2: Research with Perplexity (if cache miss)

```python
from perplexity import Perplexity

client = Perplexity(api_key=os.getenv('PERPLEXITY_API_KEY'))

prompt = f"""
Research the company "{company_name}" and provide:

1. **Mission & Values** (2-3 sentences)
2. **Recent News** (last 6 months, top 3 stories with dates)
3. **Culture & Work Environment** (2-3 key points)
4. **Notable Achievements or Recognition**

Provide factual, up-to-date information with sources.
Format as structured JSON.
"""

response = client.chat.completions.create(
    model="sonar-pro",
    messages=[
        {"role": "system", "content": "You are a professional company researcher."},
        {"role": "user", "content": prompt}
    ],
    temperature=0.2,  # Low temperature for factual accuracy
    return_citations=True
)

intel = response.choices[0].message.content
citations = response.citations
```

---

### Step 3: Parse & Structure Response

```python
import json

# Parse Perplexity response
intel_data = json.loads(intel)

# Expected structure
result = {
    "company_name": "SAP SE",
    "intel_data": {
        "mission": "SAP helps businesses run better by providing...",
        "recent_news": [
            "SAP launches AI Business Suite (January 2026)",
            "Record Q4 2025 earnings announced",
            "New Berlin innovation hub opening in March 2026"
        ],
        "culture": [
            "Focus on innovation and employee development",
            "Strong diversity & inclusion initiatives",
            "Hybrid work model with flexibility"
        ],
        "achievements": [
            "Named Leader in Gartner Magic Quadrant 2025"
        ]
    },
    "perplexity_citations": citations[:10],  # Limit to 10
    "researched_at": datetime.now().isoformat(),
    "expires_at": (datetime.now() + timedelta(days=7)).isoformat(),
    "cached": False
}
```

---

### Step 4: Store in Database

```python
supabase.table("company_research").upsert(
    {
        "company_name": company_name,
        "intel_data": result["intel_data"],
        "perplexity_citations": result["perplexity_citations"],
        "expires_at": result["expires_at"]
    },
    on_conflict="company_name"
).execute()
```

---

## 5. OUTPUT SCHEMA

```json
{
  "company_name": "SAP SE",
  "intel_data": {
    "mission": "...",
    "recent_news": [...],
    "culture": [...],
    "achievements": [...]
  },
  "perplexity_citations": ["url1", "url2", ...],
  "researched_at": "2026-02-13T08:20:00Z",
  "expires_at": "2026-02-20T08:20:00Z",
  "cached": false
}
```

---

## 6. ERROR HANDLING

### Retry Logic

```python
from tenacity import retry, stop_after_attempt, wait_exponential

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=2, min=2, max=10),
    reraise=False
)
def research_with_retry(company_name: str):
    return perplexity_api_call(company_name)
```

**Retry Schedule:**
- Attempt 1: Immediate
- Attempt 2: +2 seconds
- Attempt 3: +4 seconds

### Fallback Strategy

```
Perplexity API (Primary)
    ↓ [FAIL after 3 retries]
Continue WITHOUT company intel
    (Flag cover letter as "limited_intel")
    (Never hallucinate data)
```

### Failure Logging

```python
supabase.table('failed_scrapes').insert({
    'entity_type': 'company_research',
    'entity_name': company_name,
    'error': str(error),
    'retry_count': 3,
    'timestamp': datetime.now().isoformat()
}).execute()
```

---

## 7. CACHING STRATEGY

**TTL:** 7 days

**Why 7 days?**
- Company mission/values rarely change
- News older than 1 week is less relevant
- Balance between freshness and cost

**Cache Hit Rate (Projected):**
- Week 1: 0% (cold start)
- Week 2: 30%
- Week 4: 60%
- Week 8: 70% (steady state)

**Cost Savings:**
- Without cache: $0.02/research × 10k cover letters = $200/month
- With 70% cache hit: $0.02 × 3k = $60/month
- **Savings: $140/month (70%)**

**Cache Invalidation:**
- Automatic: Expires after 7 days
- Manual: `force_refresh=True` parameter
- Cleanup: Daily cron job removes expired entries

---

## 8. SUCCESS CRITERIA

**Per Research:**
- ✅ Completes in < 10 seconds
- ✅ Returns minimum 2 citations
- ✅ Mission statement not empty
- ✅ At least 1 recent news item (if available)

**System-Wide:**
- ✅ Cache hit rate > 60% after 30 days
- ✅ API success rate > 95%
- ✅ Average cost per research < $0.01 (with caching)
- ✅ Never hallucinate company data

---

## 9. COST OPTIMIZATION

**Per API Call:**
- Perplexity Sonar Pro: ~$0.02/request
- Cache storage: ~$0.001/month per company

**Monthly Projection (10,000 cover letters):**
- Unique companies: ~3,000
- Cache hit rate: 70%
- API calls needed: 900 (3,000 × 0.3)
- Cost: 900 × $0.02 = **$18/month**

**Without caching:** 3,000 × $0.02 = $60/month
**Savings: $42/month (70%)**

---

## 10. MONITORING

**Track in:** `stats.md` and `company_research_stats` table

**Key Metrics:**
```
Cache Hit Rate: 68.2% (target: >60%)
Average Response Time: 4.8s (target: <10s)
API Success Rate: 97.1% (target: >95%)
Cost Per Research: $0.008 (target: <$0.01)
```

**Alerts:**
- Cache hit rate < 50% for 7 days → Investigate
- API success rate < 90% → Check Perplexity status
- Response time > 15s → Scale up

---

## 11. USAGE EXAMPLE

```python
from skills.company_research import CompanyResearcher
from supabase import create_client

# Initialize
supabase = create_client(url, key)
researcher = CompanyResearcher(supabase_client=supabase)

# Research with caching
intel = researcher.research_company("TechCorp GmbH")

# Force refresh (bypass cache)
intel = researcher.research_company("TechCorp GmbH", force_refresh=True)

# Access data
print(f"Mission: {intel['intel_data']['mission']}")
print(f"Recent News: {intel['intel_data']['recent_news']}")
print(f"Cached: {intel.get('cached', False)}")
print(f"Age: {(datetime.now() - intel['researched_at']).days} days")
```

---

## 12. NEXT STEPS

**Phase 1 (MVP - DONE ✅):**
- [x] Basic Perplexity integration
- [x] 7-day caching
- [x] Error handling with retries
- [x] Database schema

**Phase 2 (Future):**
- [ ] Add quote suggestions
- [ ] Company size/industry classification
- [ ] Glassdoor rating integration
- [ ] LinkedIn company page scraping

**Phase 3 (Advanced):**
- [ ] Real-time news alerts
- [ ] Competitive intelligence
- [ ] Company health scoring

---

**Status:** ✅ ACTIVE (Phase 1 Complete)  
**Next Review:** After 1,000 researches  
**Owner:** Agent 3 (Company Research)  
