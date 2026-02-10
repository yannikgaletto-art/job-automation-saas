# COMPANY INTEL ENRICHMENT SKILL (The DSGVO-Safe Enricher)

**Status:** ACTIVE  
**Version:** 1.0  
**Owner:** Lead Architect  
**Dependencies:** Perplexity MCP, Supabase MCP  
**DSGVO-Compliance:** ✅ NO PERSONAL DATA (Only company-level intelligence)  
**Reference:** Unlimited Leads (Jack Roberts) - Modified for EU compliance

---

## 1. MISSION

We NEVER scrape personal data (hiring managers, emails, LinkedIn profiles).  
Instead, we enrich our cover letters with **company-level intelligence** that makes applications feel personal and researched, without violating DSGVO Art. 6.

**Legal Basis:**  
✅ Public company information (news, culture, projects) is fair use  
❌ Scraping employee data without consent violates DSGVO  

---

## 2. THE SAFE ENRICHMENT PROTOCOL

Execute this process for every new job in `job_queue` with status `pending`.

### PHASE 1: COMPANY DISCOVERY (Public Intel Only)
**Input:** `company_name`, `company_slug`  
**Tool:** Perplexity MCP (Sonar Pro) or public search  
**Prompt Template:**
```
"Find the latest public information about [Company Name]:
- Recent news (last 3 months)
- Company culture and values
- Recent projects or product launches
- Tech stack (if tech company)
- Company size and growth trajectory"
```

**Output Fields to Save:**
```typescript
{
  recent_news: string[];        // Max 3 headlines
  company_values: string[];     // Core values from About page
  recent_projects: string;      // Latest initiatives
  tech_stack: string[];         // If applicable (e.g. "React, Python, AWS")
  employee_count: number;       // Public data from LinkedIn/Crunchbase
  funding_stage: string;        // e.g. "Series B", "Public"
}
```

### PHASE 2: VERIFICATION (Truth Check)
- **Cross-reference**: Check at least 2 sources (company website + news)
- **Freshness**: Only use data from last 6 months
- **Confidence Score**: Rate 0.0 to 1.0
  - 1.0 = Multiple sources confirm, recent data
  - 0.5 = Only one source, no recent news
  - 0.0 = No public data found (startup/stealth mode)

### PHASE 3: CACHING (Cost Efficiency)
**CRITICAL:** Check `company_research` table FIRST before API call!

```sql
-- Check if we already researched this company in last 7 days:
SELECT * FROM company_research 
WHERE company_slug = 'tesla'
AND created_at > NOW() - INTERVAL '7 days'
LIMIT 1;
```

**Cache Hit Rate:** Expected ~60% (many users apply to same companies)  
**Cost Savings:** 60% fewer Perplexity API calls

### PHASE 4: INTEL EXTRACTION (The Cover Letter Hook)
From the enriched data, extract **ONE** specific detail for personalization:

**Good Examples:**
- "Your recent expansion of Gigafactory Berlin..."
- "Your commitment to sustainability, as shown in your 2024 Climate Report..."
- "The launch of your new React-based design system..."

**Bad Examples (DON'T USE):**
- ❌ "I saw that Sarah Schmidt is your Head of Engineering..." (PII!)
- ❌ "I found your hiring manager on LinkedIn..." (Privacy violation!)
- ❌ Generic phrases like "your innovative company..." (useless)

---

## 3. EXECUTION INSTRUCTIONS (Agent Protocol)

When you execute this skill:

1. **Load Job:** Fetch `company_name` and `company_slug` from Supabase `job_queue`

2. **Check Cache First:**
   ```typescript
   const cached = await supabase
     .from('company_research')
     .select('*')
     .eq('company_slug', job.company_slug)
     .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
     .single();
   
   if (cached) {
     console.log(`Cache HIT: ${job.company_slug}`);
     return cached.data;
   }
   ```

3. **Run Enrichment:** Execute Phase 1-4 with rate limiting

4. **Update Database (Supabase MCP):**
   ```sql
   -- Insert into company_research table:
   INSERT INTO company_research (
     company_slug,
     company_name,
     data,  -- JSONB with all intel
     confidence_score,
     created_at
   ) VALUES (...);
   ```

5. **Link to Job:**
   ```sql
   -- Update job_queue to reference the research:
   UPDATE job_queue 
   SET enrichment_status = 'complete',
       company_research_id = [new_research_id]
   WHERE id = [job_id];
   ```

6. **Log Performance:**
   ```sql
   INSERT INTO scraping_logs (
     user_id,
     job_queue_id,
     scraper_used: 'perplexity',
     source_type: 'company_intel',
     status: 'success',
     duration_ms,
     estimated_cost_cents: 2  -- Perplexity cost per call
   );
   ```

---

## 4. ERROR HANDLING (Graceful Degradation)

### Scenario 1: No Public Data Found (Stealth Startup)
```typescript
if (confidence_score < 0.3) {
  // Fallback: Use generic but professional language
  await supabase.from('job_queue').update({
    enrichment_status: 'skipped_no_data',
    fallback_reason: 'Stealth mode startup, no public intel'
  });
  
  // Cover letter will use generic opening:
  // "Sehr geehrte Damen und Herren, hiermit bewerbe ich mich..."
}
```

### Scenario 2: Perplexity Rate Limit Hit
```typescript
try {
  const intel = await perplexity.search(query);
} catch (error) {
  if (error.code === 429) {
    // Queue for retry in 60 seconds (via Inngest)
    await inngest.send({
      name: 'company/research',
      data: { companySlug, jobId },
      delay: '60s'
    });
  }
}
```

### Scenario 3: API Key Missing
```typescript
if (!process.env.PERPLEXITY_API_KEY) {
  console.warn('Perplexity API key missing, skipping enrichment');
  
  // System still works, just without enrichment
  await supabase.from('job_queue').update({
    enrichment_status: 'skipped_no_api_key'
  });
}
```

---

## 5. INTEGRATION WITH COVER LETTER WRITER

When generating the cover letter, the AI should access enriched data:

```typescript
// In your cover letter generation function:
const companyIntel = await supabase
  .from('company_research')
  .select('data')
  .eq('id', job.company_research_id)
  .single();

const prompt = `
Write a cover letter for this job:
- Position: ${job.title}
- Company: ${job.company_name}

Use this company intelligence to personalize:
${JSON.stringify(companyIntel.data, null, 2)}

Requirements:
- Mention ONE specific detail (recent project or value)
- Keep it natural, not forced
- NEVER mention finding info "on LinkedIn" or similar
`;
```

**Example Output:**
> "Sehr geehrte Damen und Herren,
> 
> durch Ihre kürzliche Expansion der Gigafactory Berlin und Ihr ausgeprägtes Engagement für nachhaltige Mobilität möchte ich mich als Senior Software Engineer in Ihrem Team bewerben..."

---

## 6. COST & PERFORMANCE METRICS

### Expected Costs (at scale):
| Metric | Free Tier | 1000 Users/Day |
|--------|-----------|----------------|
| Perplexity Calls | 150/month | 400/day |
| Cache Hit Rate | - | ~60% |
| Actual API Calls | 150 | 160/day |
| **Monthly Cost** | €0 | **€12** |

### Performance Targets:
- Enrichment Time: < 3 seconds (with caching)
- Cache Hit Rate: > 50%
- Confidence Score: > 0.7 for 80% of companies

---

## 7. DSGVO COMPLIANCE CHECKLIST

✅ **What we DON'T collect:**
- ❌ Employee names
- ❌ Email addresses
- ❌ LinkedIn profiles
- ❌ Phone numbers
- ❌ Any personal identifiers

✅ **What we DO collect:**
- ✅ Public company news (fair use)
- ✅ Company values (from public website)
- ✅ Tech stack (public job postings)
- ✅ Funding information (public databases)

✅ **Legal Basis:** Art. 6(1)(f) DSGVO - Legitimate Interest
- Purpose: Improve application quality
- Data: Only publicly available company information
- No personal data of third parties

✅ **Data Retention:** 7 days cache, then re-fetch
- Reason: Company news changes, we want fresh data
- No long-term storage of potentially outdated intel

---

## 8. TESTING INSTRUCTIONS

### Test Case 1: Well-Known Company (Tesla)
```bash
# Should find: Gigafactory news, sustainability focus, EV tech
curl -X POST /api/enrich-company \
  -d '{"company_slug": "tesla", "company_name": "Tesla Inc."}'
```

**Expected Result:**
- Confidence Score: > 0.9
- Recent News: 2-3 headlines
- Cache: Miss on first call, Hit on second

### Test Case 2: Stealth Startup
```bash
# Should gracefully fail with low confidence
curl -X POST /api/enrich-company \
  -d '{"company_slug": "stealth-ai-startup", "company_name": "Stealth AI"}'
```

**Expected Result:**
- Confidence Score: < 0.3
- Enrichment Status: 'skipped_no_data'
- Cover Letter: Uses generic opening

### Test Case 3: Rate Limit Test
```bash
# Send 25 requests in 1 minute (should trigger rate limit)
for i in {1..25}; do
  curl /api/enrich-company -d '{"company_slug": "test-$i"}'
done
```

**Expected Result:**
- First 20: Success
- Request 21-25: Queued for retry (via Inngest)
- No 429 errors visible to user

---

## 9. MONITORING & ALERTS

### Key Metrics to Track (in Sentry/Datadog):
1. **Cache Hit Rate:** Should be > 50%
   - If < 30%: Users apply to too diverse companies (expected for early stage)
   
2. **Confidence Score Average:** Should be > 0.7
   - If < 0.5: Perplexity quality degrading or query needs optimization
   
3. **API Cost per Job:** Should be < €0.02
   - If > €0.05: Cache not working or too many retries

### Alerts to Set Up:
```typescript
// In your monitoring tool:
if (perplexity_429_errors > 5) {
  alert('Perplexity rate limit hit multiple times, check queue');
}

if (cache_hit_rate < 0.3) {
  alert('Cache efficiency low, check company_research table cleanup');
}
```

---

## 10. FUTURE ENHANCEMENTS (Post-MVP)

### Phase 2 (After 1000 Users):
- **Glassdoor Integration:** Scrape company reviews for culture insights
- **GitHub Analysis:** For tech companies, analyze their open-source activity
- **Crunchbase API:** Automatic funding stage detection

### Phase 3 (Scale):
- **Multi-Language Support:** Research in company's native language
- **Industry Templates:** Different prompts for tech vs. consulting vs. startups
- **Real-Time Updates:** Webhook when company appears in news

---

## 11. IMPLEMENTATION CHECKLIST

Before marking this skill as "production-ready":

- [ ] `company_research` table has proper indexes
- [ ] Rate limiter is configured (Upstash Redis)
- [ ] Inngest retry logic is tested
- [ ] Cache invalidation works (7-day TTL)
- [ ] DSGVO compliance verified (legal review)
- [ ] Cost monitoring dashboard set up
- [ ] Integration with cover letter writer tested
- [ ] Fallback scenarios work (no data, rate limit, API error)

---

**Status:** 📝 Ready for Implementation  
**Next Action:** Create database migration for `company_research` enrichment fields  
**Estimated Dev Time:** 4-6 hours  
**Risk Level:** LOW (No PII, established patterns, graceful degradation)
