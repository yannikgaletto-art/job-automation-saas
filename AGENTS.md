# Pathly V2.0 - AGENT OPERATING SYSTEM

**Project:** Pathly V2.0  
**Version:** 2.2  
**Last Updated:** 2026-02-13  
**Status:** Active Development (Phase 3 Complete)  

---

## 0. IDENTITY & MISSION

**What is Pathly?**

Pathly is a **DSGVO & NIS2 compliant** job application SaaS with a hybrid architecture.

**Core Principle:**
> "AI assists, humans decide. Every application must pass through user review."

**Two Pillars:**

```
╔════════════════════════════════════════════════════════════╗
║  PILLAR 1: MANUAL APPLICATION (On-Demand)                  ║
║  ───────────────────────────────────────────────────────  ║
║  User uploads CV + Cover Letters + Job URL                 ║
║         ↓                                                   ║
║  AI optimizes CV & generates cover letter                  ║
║         ↓                                                   ║
║  User reviews, edits, approves                             ║
║         ↓                                                   ║
║  User applies manually OR via Chrome Extension             ║
╚════════════════════════════════════════════════════════════╝

╔════════════════════════════════════════════════════════════╗
║  PILLAR 2: AUTOMATION (Background Worker)                  ║
║  ───────────────────────────────────────────────────────  ║
║  Cron job scrapes matching jobs (8-10 AM daily)            ║
║         ↓                                                   ║
║  AI researches company & generates documents               ║
║         ↓                                                   ║
║  Status: ready_for_review (notification to user)           ║
║         ↓                                                   ║
║  User reviews, approves → status: ready_to_apply           ║
║         ↓                                                   ║
║  Chrome Extension fills form, user clicks Submit           ║
╚════════════════════════════════════════════════════════════╝
```

**DSGVO Compliance:**
- ✅ No full automation (Art. 22 compliance)
- ✅ Mandatory human approval before submission
- ✅ PII encryption (Fernet)
- ✅ Audit logging for all AI generations
- ✅ User consent tracking

---

[... Previous content remains the same until Agent 3 ...]

---

### AGENT 3: COMPANY RESEARCH (Research Agent)

**Responsibility:** Gather real-time company intelligence for personalized cover letters.

**Directive:** `directives/company_research.md`

**Implementation:** `skills/company_research.py` (Phase 3A)

**Execution:** `execution/generate_cover_letter.py` (integrated)

**Why Critical:**
> LLMs hallucinate company facts. This agent fetches REAL data for authentic cover letters.

**Triggers:**
- After Agent 2 approves job (Pillar 2)
- After user submits job URL (Pillar 1)
- Before Agent 5 generates cover letter

**Architecture:**

```
User/Agent 2
      ↓
[Company Researcher] (skills/company_research.py)
      ↓
   Cache Check (Supabase)
      ↓
    Hit? ──────YES─────→ Return cached intel
      │
      NO
      ↓
[Perplexity API] (sonar-pro)
      ↓
  Research Company
      ↓
  Store in DB (7-day cache)
      ↓
  Return intel
```

**Process:**

1. **Check Cache (7-day TTL)**
   ```python
   from skills.company_research import CompanyResearcher
   
   researcher = CompanyResearcher(supabase_client=supabase)
   
   # Checks cache first
   intel = researcher.research_company("SAP SE")
   # If cached → instant return
   # If expired → fetch from Perplexity
   ```

2. **Perplexity Research (if cache miss)**
   ```python
   prompt = f"""
   Research the company "{company_name}" and provide:
   
   1. Company Mission & Values (2-3 sentences)
   2. Recent News (last 6 months, top 3 stories with dates)
   3. Culture & Work Environment (2-3 key points)
   4. Notable Achievements or Recognition
   
   Provide factual, up-to-date information with sources.
   """
   
   response = perplexity.chat.completions.create(
       model="sonar-pro",
       messages=[{"role": "system", "content": "Professional company researcher"},
                 {"role": "user", "content": prompt}],
       temperature=0.2,
       return_citations=True
   )
   ```

3. **Parse & Structure**
   ```python
   intel = {
       "mission": "SAP helps businesses run better...",
       "recent_news": [
           "SAP launches AI Business Suite (Jan 2026)",
           "Record Q4 2025 earnings announced",
           "New Berlin innovation hub opening"
       ],
       "culture": [
           "Focus on innovation and employee development",
           "Strong diversity & inclusion initiatives",
           "Hybrid work model with flexibility"
       ],
       "achievements": [
           "Named Leader in Gartner Magic Quadrant 2025"
       ],
       "citations": [...],
       "researched_at": "2026-02-13T08:20:00Z"
   }
   ```

4. **Cache in Supabase (7 days)**
   ```python
   supabase.table("company_research").upsert({
       "company_name": "SAP SE",
       "intel_data": intel,
       "perplexity_citations": intel["citations"][:10],
       "expires_at": (datetime.now() + timedelta(days=7)).isoformat()
   }, on_conflict="company_name").execute()
   ```

**Output Schema:**
```json
{
  "company_name": "SAP SE",
  "intel_data": {
    "mission": "...",
    "recent_news": [...],
    "culture": [...],
    "achievements": [...]
  },
  "perplexity_citations": [...],
  "researched_at": "2026-02-13T08:20:00Z",
  "expires_at": "2026-02-20T08:20:00Z",
  "cached": false
}
```

**Database Table:**
```sql
CREATE TABLE company_research (
    research_id UUID PRIMARY KEY,
    company_name TEXT NOT NULL UNIQUE,
    intel_data JSONB NOT NULL,
    perplexity_citations JSONB DEFAULT '[]'::jsonb,
    expires_at TIMESTAMPTZ NOT NULL,
    researched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Caching Strategy:**
- **TTL:** 7 days (companies rarely change mission/values)
- **Reuse:** Same intel for multiple applications to same company
- **Invalidation:** Auto-cleanup via `cleanup_expired_company_research()` function
- **Override:** `force_refresh=True` to bypass cache

**Error Handling:**
- If Perplexity API fails → Retry 3x with exponential backoff
- If all retries fail → Continue WITHOUT company intel (flag as limited)
- Never hallucinate data
- Log all failures to `failed_scrapes` table

**Quality Gates:**
- ✅ Research completes in < 10 seconds
- ✅ Minimum 2 citations returned
- ✅ Mission statement not empty
- ✅ At least 1 recent news item (if available)

**Cost Optimization:**
- Cache hit rate: ~70% (after 30 days)
- Cost per research: ~$0.02 (Perplexity)
- Effective cost with caching: ~$0.006/research
- 10,000 cover letters/month: **$60** (vs $200 without caching)

**Usage Example:**
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
```

**See:** `skills/company_research.py` for complete implementation.

---

### AGENT 4: CV OPTIMIZATION (CV Agent)

**Status:** 🔜 **Phase 4** (Not Yet Implemented)

**Planned:** Claude Sonnet 4 optimization with company intel integration.

**For Now:** MVP uses master CV without optimization.

---

### AGENT 5: COVER LETTER GENERATION (Writer Agent)

**Responsibility:** Generate personalized cover letters using company research.

**Directive:** `directives/cover_letter_generation.md`

**Implementation:** `skills/cover_letter_generator.py` (Phase 3B)

**Execution:** `execution/generate_cover_letter.py` (Phase 3C)

**MVP Version:** Single generation (no Quality Judge loop yet)

**Quality Judge:** 🔜 **Phase 4** (Iteration loop)

**Triggers:**
- After Agent 3 completes company research
- For BOTH Pillar 1 and Pillar 2

**Architecture (Phase 3 MVP):**

```
Job Data + User Profile + Company Intel
      ↓
[Cover Letter Generator] (skills/cover_letter_generator.py)
      ↓
[Claude Sonnet 4] (temperature=0.7)
      ↓
Generated Cover Letter (Markdown)
      ↓
Store in DB
      ↓
Ready for User Review
```

**Phase 4 (Future):**
```
[Generate] → [Judge] → Iterate (max 3x) OR Approve
```

**Process:**

1. **Build System Prompt**
   ```python
   from skills.cover_letter_generator import CoverLetterGenerator
   
   generator = CoverLetterGenerator()
   
   system_prompt = """
   You are an expert cover letter writer specializing in job applications.
   
   Your cover letters are:
   - Personalized and authentic
   - Concise (250-350 words)
   - Achievement-focused
   - Company-aware (when research provided)
   - Formatted in clean Markdown
   
   Structure:
   1. Opening (why this role + company resonates)
   2. Key Qualifications (2-3 relevant achievements)
   3. Company Fit (connect to company values/news)
   4. Closing (enthusiasm + call to action)
   
   Avoid:
   - Generic phrases ("I am writing to apply...")
   - Repetition of resume
   - Desperation or over-eagerness
   - Buzzwords without substance
   """
   ```

2. **Build User Prompt (Full Context)**
   ```python
   user_prompt = f"""
   # COVER LETTER REQUEST
   
   ## JOB POSTING
   **Position:** {job_data['title']}
   **Company:** {job_data['company']}
   **Location:** {job_data['location']}
   
   **Description:**
   {job_data['description']}
   
   **Key Requirements:**
   {job_data['requirements']}
   
   ## APPLICANT PROFILE
   **Name:** {user_profile['name']}
   **Current Role:** {user_profile['current_role']}
   **Skills:** {user_profile['skills']}
   **Years of Experience:** {user_profile['experience_years']}
   
   **Key Achievements:**
   {user_profile['achievements']}
   
   ## COMPANY RESEARCH
   **Mission:** {company_intel['mission']}
   **Recent News:**
   {company_intel['recent_news']}
   **Culture Highlights:**
   {company_intel['culture']}
   
   ---
   
   **TASK:** Write a compelling cover letter in Markdown format.
   Make it personal and authentic. Connect my background to this specific role and company.
   """
   ```

3. **Generate with Claude**
   ```python
   result = generator.generate(
       job_data=job,
       user_profile=profile,
       company_intel=intel,
       tone="professional"  # or "enthusiastic", "technical"
   )
   
   # Output:
   # {
   #   'cover_letter': '# Cover Letter\n\n...',
   #   'word_count': 285,
   #   'tone': 'professional',
   #   'model': 'claude-sonnet-4-20250514',
   #   'company_intel_used': True,
   #   'usage': {'input_tokens': 1523, 'output_tokens': 342}
   # }
   ```

4. **Store in Database**
   ```python
   supabase.table('cover_letters').insert({
       'job_id': job_id,
       'user_id': user_id,
       'cover_letter_markdown': result['cover_letter'],
       'word_count': result['word_count'],
       'tone': result['tone'],
       'model_used': result['model'],
       'company_intel_used': result['company_intel_used'],
       'generation_metadata': result['usage'],
       'status': 'generated'
   }).execute()
   ```

**Output Schema:**
```json
{
  "cover_letter_id": "uuid",
  "job_id": "uuid",
  "user_id": "uuid",
  "cover_letter_markdown": "# Cover Letter\n\n...",
  "word_count": 285,
  "tone": "professional",
  "model_used": "claude-sonnet-4-20250514",
  "company_intel_used": true,
  "generation_metadata": {
    "input_tokens": 1523,
    "output_tokens": 342
  },
  "quality_score": null,  // Phase 4
  "status": "generated",
  "generated_at": "2026-02-13T08:25:00Z"
}
```

**Database Tables:**
```sql
-- Main table
CREATE TABLE cover_letters (
    cover_letter_id UUID PRIMARY KEY,
    job_id UUID NOT NULL REFERENCES job_queue(job_id),
    user_id UUID NOT NULL,
    cover_letter_markdown TEXT NOT NULL,
    word_count INTEGER NOT NULL,
    tone TEXT DEFAULT 'professional',
    model_used TEXT NOT NULL,
    company_intel_used BOOLEAN DEFAULT FALSE,
    generation_metadata JSONB DEFAULT '{}'::jsonb,
    quality_score DECIMAL(3,2),  -- Phase 4
    user_rating INTEGER CHECK (user_rating BETWEEN 1 AND 5),
    status TEXT DEFAULT 'generated',
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Version history (for edits)
CREATE TABLE cover_letter_versions (
    version_id UUID PRIMARY KEY,
    cover_letter_id UUID NOT NULL REFERENCES cover_letters(cover_letter_id),
    version_number INTEGER NOT NULL,
    cover_letter_markdown TEXT NOT NULL,
    change_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Execution Script:**
```bash
# Dry run (no DB writes)
python execution/generate_cover_letter.py \
  --job-id <uuid> \
  --user-id <uuid> \
  --dry-run

# Production
python execution/generate_cover_letter.py \
  --job-id <uuid> \
  --user-id <uuid> \
  --tone professional
```

**Pipeline Steps:**
```
[1/5] Fetching job data...
[2/5] Fetching user profile...
[3/5] Researching company... (cache check)
[4/5] Generating cover letter...
[5/5] Storing result...

✅ Generated 285 words
```

**Quality Gates (MVP):**
- ✅ Generation completes in < 15 seconds
- ✅ Word count 250-350 words
- ✅ Company intel successfully integrated
- ✅ No generic opening phrases detected

**Cost Per Generation:**
- Claude Sonnet 4: ~$0.015 (avg 1500 input + 350 output tokens)
- Company Research (cached 70%): ~$0.006
- **Total:** ~$0.021 per cover letter

**Phase 4 Enhancements (Future):**
- **Quality Judge Loop:** Haiku 4 validation + iteration (max 3x)
- **Style Matching:** User reference letter analysis
- **Tone Adaptation:** Dynamic adjustment based on job seniority
- **Multi-variant:** Generate 3 versions, user picks best

**See:** 
- `skills/cover_letter_generator.py` for generator implementation
- `execution/generate_cover_letter.py` for orchestration
- `database/migrations/003_cover_letter_schema.sql` for schema

---

[... Rest of AGENTS.md remains the same ...]

---

**System Status:** ✅ ACTIVE (Phase 3 Complete)  
**Version:** 2.2  
**Last Updated:** 2026-02-13  
**Next Milestone:** Phase 4 - CV Optimization + Quality Judge Loop  

---

**Major Changes from v2.1:**
- **Phase 3 Complete:** Company Research + Cover Letter Generation MVP
- **New Skills:** company_research.py, cover_letter_generator.py
- **New Execution:** generate_cover_letter.py (5-step pipeline)
- **Database:** Migration 003 (company_research + cover_letters tables)
- **Caching:** 7-day company intel cache (70% hit rate projected)
- **Cost:** ~$0.021/cover letter (with caching)
- **Quality:** MVP single-generation (Quality Judge → Phase 4)
