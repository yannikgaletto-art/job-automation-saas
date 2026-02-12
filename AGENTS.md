# Pathly V2.0 - AGENT OPERATING SYSTEM

**Project:** Pathly V2.0  
**Version:** 2.1  
**Last Updated:** 2026-02-12  
**Status:** Active Development  

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

## 1. THE CEO SYSTEM (MAPS FRAMEWORK)

**Protocol:** Before executing any task, synchronize with CEO's strategic context.

### Mission (mission.md) - The North Star
* **Goal:** Help users land their dream job through intelligent automation
* **Target:** Tech professionals (SWE, PM, Data Scientists, Designers)
* **Compliance:** DSGVO/NIS2 by design
* **Quality:** Authentic, individual applications (no generic AI text)

### Actions (actions.md) - The Tactical Backlog
* **Next Steps:** Defines what to build next
* **Priority:** P1 (Critical) > P2 (Important) > P3 (Nice-to-have)
* **Update Rule:** After every planning session

### Past (past.md) - The Project Log
* **Append After:** Every major feature completion
* **Format:** Date, Feature, Outcome, Learnings
* **Purpose:** Learn from history, avoid repeating mistakes

### Stats (stats.md) - The Metrics Dashboard
* **Track:** Applications sent, interviews scheduled, response rate
* **Update:** After every scraping run, every application
* **KPIs:** Quality scores, user satisfaction, system uptime

---

## 2. THE 5-AGENT ARCHITECTURE

**Agent = Specialized AI Worker**

Each agent has a **Directive** (SOP) that defines:
- What it does
- How to do it
- Error handling
- Success criteria

**Agents work for BOTH pillars (Manual + Automation).**

---

### AGENT 1: JOB DISCOVERY (Scraper Agent)

**Responsibility:** Find and parse job postings using platform-optimized scraping strategies.

**Directive:** `directives/job_discovery.md` (Version 2.0)

**Architecture:** Platform-Intelligent Router

**Core Philosophy:**
> "Use the right tool for each job board. Don't over-engineer universal solutions."

**Component Hierarchy:**

```
User/Scheduler
      ↓
[SCRAPING ROUTER] (skills/scraping_router.py)
      ↓
   Platform Detection
      ↓
    ┌─────────────────┬──────────────────┬────────────────────┐
    │                 │                  │                    │
[Bright Data]  [Direct APIs]    [Patchright]     [Future: ScraperAPI]
 (LinkedIn)     (Greenhouse)    (StepStone)       (Indeed)
    │                 │                  │                    │
    └─────────────────┴──────────────────┴────────────────────┘
                          ↓
                   [Jina Reader]
                 (HTML → Markdown)
                          ↓
                   [job_queue DB]
```

**Triggers:**
- **Pillar 1:** User submits job URL (immediate, < 5s latency)
- **Pillar 2:** Cron job (daily, 8-10 AM with jitter)

**Platform Routing Table:**

| Platform | Strategy | Cost/1k | Success Rate | Status |
|----------|----------|---------|--------------|--------|
| **LinkedIn** | Bright Data API | $3-9 | 98% | ✅ Active |
| **Greenhouse** | Direct JSON API | $0.2 | 99% | ✅ Active |
| **Lever** | Direct JSON API | $0.2 | 99% | ✅ Active |
| **Workday** | Direct API | $0.3 | 95% | ✅ Active |
| **StepStone** | Patchright | $5-8 | 75-85% | ✅ Active |
| **Monster** | Patchright | $3-5 | 80-85% | ✅ Active |
| **Xing** | Patchright | $4-6 | 75-80% | ✅ Active |
| **Indeed** | ScraperAPI | $0.5-2 | 96% | 🔜 Future |
| **Unknown** | Patchright Fallback | $5 | 60-70% | ✅ Active |

**Implementation:**

```python
from skills.scraping_router import ScrapeRouter

# Initialize router (auto-loads all scrapers)
router = ScrapeRouter()

# Scrape job (automatic platform detection + routing)
job_data = router.scrape(
    url="https://www.linkedin.com/jobs/view/12345",
    pillar="manual"  # or "automation"
)

# Output (standardized schema):
# {
#   'title': 'Senior Python Developer',
#   'company': 'TechCorp GmbH',
#   'description': '<div>Raw HTML...</div>',
#   'description_markdown': '# Requirements\n- 5+ years...',
#   'location': 'Berlin, Germany',
#   'url': '...',
#   'source': 'linkedin',
#   'scraping_method': 'bright_data',
#   'success': True,
#   'scraped_at': '2026-02-12T17:30:00Z'
# }
```

**Key Components:**

**1. Scraping Router** (`skills/scraping_router.py`):
- Platform detection via URL parsing
- Automatic scraper selection
- Cost optimization
- Stats tracking

**2. Bright Data Scraper** (LinkedIn):
- 98% success rate (vs 60-70% with Playwright)
- Built-in proxy rotation
- GDPR-compliant
- API endpoint: `https://api.brightdata.com/datasets/v3/trigger`

**3. Direct API Scraper** (`skills/direct_api_scraper.py`):
- Greenhouse: `https://boards-api.greenhouse.io/v1/boards/{company}/jobs/{job_id}`
- Lever: `https://api.lever.co/v0/postings/{company}/{job_id}`
- Workday: JSON-LD extraction (limited support)
- **Best ROI:** 99% success, $0 API calls, 10x faster than HTML parsing

**4. Patchright Scraper** (`skills/patchright_scraper.py`):
- Patchright = Playwright fork with deep anti-detection patches
- Bypasses: navigator.webdriver, Canvas/WebGL fingerprinting, TLS/JA3
- Features:
  - Residential proxy rotation (Bright Data)
  - User-Agent rotation (50+ variations)
  - Human behavior simulation (scrolling, delays)
  - JavaScript challenge handling

**5. Jina Reader** (`skills/jina_reader.py`):
- Converts raw HTML → Clean Markdown
- 10x faster than BeautifulSoup + Regex
- LLM-ready output
- Cost: FREE (1M tokens/month), then $0.20/1M tokens
- Auto-applied by router after scraping

**Cost Structure (100k jobs/month):**

| Platform | Volume | Cost/1k | Monthly Cost |
|----------|--------|---------|-------------|
| LinkedIn | 20k | $6 | $120 |
| Greenhouse/Lever | 15k | $0.2 | $3 |
| StepStone | 30k | $6.5 | $195 |
| Monster/Xing | 20k | $4 | $80 |
| Others | 15k | $5 | $75 |
| Jina Reader | 100k | $0.2 | $20 |
| **Total** | **100k** | - | **$493** |

**With Caching (-30%):** ~$345/month

**Error Handling:**

**Pillar 1 (Manual - User waiting):**
```
Primary Scraper (30s timeout)
    ↓ [FAIL]
Patchright Fallback (60s timeout)
    ↓ [FAIL]
Manual Review Notification
```

**Pillar 2 (Automation - Batch):**
```
Primary Scraper (30s timeout)
    ↓ [FAIL]
Patchright Fallback (60s timeout)
    ↓ [FAIL]
Skip Job (log to failed_scrapes)
```

**Retry Logic:**
- Exponential backoff: 4s → 8s → 16s (max 30s)
- Max 3 attempts per scraper
- Store failures in `failed_scrapes` table

**Output Schema:**

```json
{
  "id": "uuid",
  "user_id": "uuid",
  "title": "Senior Python Developer",
  "company": "TechCorp GmbH",
  "location": "Berlin, Germany",
  "description": "<div>Raw HTML...</div>",
  "description_markdown": "# Requirements\n- 5+ years Python",
  "job_url": "https://...",
  "source": "linkedin",
  "scraping_method": "bright_data",
  "pillar": "manual",
  "status": "scraped",
  "scraped_at": "2026-02-12T17:30:00Z",
  "scraping_duration_seconds": 12.5
}
```

**Success Criteria:**
- ✅ All required fields extracted
- ✅ Markdown description generated (Jina Reader)
- ✅ Processing time < 30s (Pillar 1), < 60s (Pillar 2)
- ✅ Platform success rate > threshold (LinkedIn: 95%, StepStone: 75%)

**Monitoring Metrics:**
- Success rate per platform
- Average scraping time (p50, p95)
- Cost per successful scrape
- Failure reasons distribution
- Anti-bot block rate

**See:** `directives/job_discovery.md` for complete implementation details.

---

### AGENT 2: JOB MATCHING (Matcher Agent)

**Responsibility:** Calculate match score between user profile and job.

**Directive:** `directives/job_matching.md`

**Triggers:**
- After Agent 1 scrapes new jobs
- Only for Pillar 2 (Automation)
- Pillar 1 skips matching (user already chose job)

**Algorithm:**

1. **Extract Skills from Job Description**
   ```python
   required_skills = extract_skills_from_text(job_description)
   # Returns: ["Python", "AWS", "Docker", "React"]
   ```

2. **Compare with User Profile**
   ```python
   user_skills = get_user_skills(user_id)
   match_score = calculate_similarity(
       user_skills, 
       required_skills,
       method="cosine_similarity"
   )
   ```

3. **Threshold Filtering**
   ```python
   if match_score >= 0.70:  # 70% match
       status = "matched"
   else:
       status = "rejected"
   ```

**Tech Stack:**
- **Embeddings:** OpenAI `text-embedding-3-small`
- **Vector Search:** Supabase pgvector
- **Caching:** 7 days (job requirements rarely change)

**Output:** Update `job_queue.match_score` and `status`.

**Quality Gate:**
- Only jobs with match_score >= 70% proceed to Agent 3
- Track false positives (user rejects high-scored jobs)
- Improve algorithm based on user feedback

---

### AGENT 3: COMPANY RESEARCH (Research Agent)

**Responsibility:** Gather real-time company intelligence to prevent AI hallucinations.

**Directive:** `directives/company_research.md`

**Why Critical:**
> LLMs hallucinate company facts. This agent fetches REAL data for authentic cover letters.

**Triggers:**
- After Agent 2 approves job (Pillar 2)
- After user submits job URL (Pillar 1)

**Process:**

1. **Deep Company Research (Perplexity API)**
   ```python
   from perplexity import Client
   
   client = Client(api_key=os.getenv('PERPLEXITY_API_KEY'))
   
   research = client.chat.completions.create(
       model="sonar-pro",
       messages=[{
           "role": "user",
           "content": f"""
           Research {company_name} comprehensively:
           
           1. Company founding & history
           2. Core values & mission statement  
           3. Recent news (last 3 months)
           4. Press releases & milestones (2024-2026)
           5. Vision & strategic goals
           6. Company culture
           
           Format: Structured JSON with sources.
           """
       }],
       return_citations=True,
       search_recency_filter="month"
   )
   ```

2. **Quote Suggestions (Optional)**
   ```python
   quotes = client.chat.completions.create(
       model="sonar-pro",
       messages=[{
           "role": "user",
           "content": f"""
           Based on company values: {company_values}
           
           Find 3 matching quotes from:
           - Industry thought leaders
           - CEOs/Founders of relevant companies
           - Historical innovators
           
           Criteria:
           - Related to values
           - Not overused (not Steve Jobs)
           - Authentic & inspiring
           """
       }]
   )
   ```

**Output Schema:**
```json
{
  "company_name": "Stripe",
  "founded": "2010",
  "core_values": ["User-first", "Move fast", "Think rigorously"],
  "recent_news": [
    {
      "title": "Stripe launches Billing 2.0",
      "date": "2026-01-15",
      "url": "https://...",
      "relevance": "High"
    }
  ],
  "vision": "Increase the GDP of the internet",
  "suggested_quotes": [
    {
      "quote": "Payment infrastructure that scales...",
      "author": "Patrick Collison (Stripe CEO)",
      "match_score": 0.95
    }
  ],
  "citations": ["source1", "source2"],
  "researched_at": "2026-02-11T15:35:00Z"
}
```

**Database:** Store in `company_research` table.

**Caching Strategy:**
- Cache results for **30 days** (companies rarely change vision)
- Reuse intel for multiple applications to same company
- Update cache if job is > 30 days old

**Error Handling:**
- If Perplexity fails → Fallback to Serper API (Google search)
- If both fail → Proceed without company intel (flag as limited)
- Never hallucinate data

---

### AGENT 4: CV OPTIMIZATION (CV Agent)

**Responsibility:** Optimize master CV for specific job using company research.

**Directive:** `directives/cv_optimization.md`

**Triggers:**
- After Agent 3 completes research
- For BOTH Pillar 1 and Pillar 2

**Process:**

1. **Fetch Context**
   ```python
   job = get_job_details(job_id)
   company_intel = get_company_research(job.company)
   master_cv = get_user_cv(user_id)
   ```

2. **Claude Prompt with Full Context**
   ```python
   optimized_cv = anthropic.messages.create(
       model="claude-sonnet-4.5",
       messages=[{
           "role": "user",
           "content": f"""
           You are a professional CV optimizer.
           
           JOB DESCRIPTION:
           {job.description}
           
           JOB REQUIREMENTS:
           {job.requirements}
           
           COMPANY INTELLIGENCE (from Perplexity research):
           - Founded: {company_intel.founded}
           - Values: {company_intel.core_values}
           - Recent News: {company_intel.recent_news}
           - Vision: {company_intel.vision}
           
           MASTER CV:
           {master_cv.content}
           
           TASK:
           Optimize this CV to match the job requirements.
           
           RULES:
           1. Keep ALL facts truthful (use ONLY company_intel data)
           2. Reorder bullet points (most relevant first)
           3. Add missing keywords from job description
           4. Quantify achievements where possible
           5. Keep original format identical
           6. Maximum 2 pages
           7. NO hallucinated company facts
           
           Return optimized CV in Markdown format.
           """
       }],
       temperature=0.3  # Low temperature = less creativity
   )
   ```

3. **Convert to PDF**
   ```python
   from markdown_pdf import MarkdownPdf
   
   pdf = MarkdownPdf(toc_level=2)
   pdf.add_section(Section(optimized_cv.content))
   pdf.save(f"{user_id}/cv_{job_id}.pdf")
   ```

4. **Store Version**
   ```python
   supabase.table('cv_versions').insert({
       'user_id': user_id,
       'job_id': job_id,
       'content_markdown': optimized_cv.content,
       'file_url': f"storage/cvs/{user_id}/cv_{job_id}.pdf",
       'match_score_before': job.match_score,
       'match_score_after': calculate_new_score(optimized_cv),
       'created_at': datetime.now()
   })
   ```

**Quality Gate:**
- ✅ Match score increases by 10%+
- ✅ Format identical to master CV
- ✅ Generation time < 10 seconds
- ✅ NO hallucinated facts (validate against Agent 3 data)

**Output:** Optimized CV (markdown + PDF), passed to Agent 5.

---

### AGENT 5: COVER LETTER GENERATION (Writer Agent)

**Responsibility:** Generate authentic, individual cover letters with integrated QA.

**Directive:** `directives/cover_letter_generation.md`

**Why 3-Stage Generation:**
> LLMs cannot reliably critique their own output. A separate validation step catches clichés, hallucinations, and unnatural language.

**Triggers:**
- After Agent 4 completes CV optimization
- For BOTH Pillar 1 and Pillar 2

**The 3-Stage Process:**

```
STAGE 1: Generate (Sonnet 4.5)
   ↓
STAGE 2: Judge (Haiku 4)
   ↓
STAGE 3: Iterate (if score < 8) OR Approve (if score >= 8)
```

**Implementation:**

```python
MAX_ITERATIONS = 3

for iteration in range(MAX_ITERATIONS):
    # ═══════════════════════════════════════════════════════
    # STAGE 1: GENERATION (Claude Sonnet 4.5)
    # ═══════════════════════════════════════════════════════
    
    cover_letter = anthropic.messages.create(
        model="claude-sonnet-4.5",
        messages=[{
            "role": "user",
            "content": f"""
            CONTEXT:
            - Job: {job.title} at {job.company}
            - Company Values: {company_intel.core_values}
            - Recent News: {company_intel.recent_news[0]}
            
            USER PROFILE:
            {optimized_cv.content}
            
            WRITING STYLE (CRITICAL - EXACT IMITATION):
            
            Structure (from user's reference cover letters):
            - Paragraph 1: Quote opening (if quote selected)
            - Paragraph 2: Relevant experience
            - Paragraph 3: Additional expertise
            - Paragraph 4: Cultural fit
            - Closing: Personal, not generic
            
            Sentence Requirements:
            - Minimum 3 sentences starting with conjunctions:
              "Daher", "Deshalb", "Gleichzeitig", "Während"
            - Average length: 15-25 words
            - Vary structure (not all same pattern)
            
            Tone:
            - Professional but personal
            - First-person perspective
            - Moderately enthusiastic (not overly)
            
            User's Voice (phrases from reference letters):
            - "möchte ich gerne... einbringen"
            - "durfte ich eigenverantwortlich"
            - "fühle ich mich wohl"
            - "resoniert stark mit mir"
            
            COMPANY CONNECTION:
            Integrate subtly (don't force):
            - Recent news: {company_intel.recent_news[0].title}
            - Core value: {company_intel.core_values[0]}
            - Vision: {company_intel.vision}
            
            FORBIDDEN PHRASES:
            - "Hiermit bewerbe ich mich"
            - "I am excited to apply"
            - "I believe I would be a great fit"
            - "Mit großem Interesse habe ich"
            - Any generic opening/closing
            
            SELECTED QUOTE (if any):
            {selected_quote}
            
            Write the cover letter NOW in {language}.
            """
        }],
        temperature=0.7
    )
    
    # ═══════════════════════════════════════════════════════
    # STAGE 2: JUDGE (Claude Haiku 4)
    # ═══════════════════════════════════════════════════════
    
    judge_result = anthropic.messages.create(
        model="claude-haiku-4",
        messages=[{
            "role": "user",
            "content": f"""
            TASK: Strict quality check of this cover letter.
            
            COVER LETTER:
            {cover_letter.content}
            
            REFERENCE STYLE (the goal):
            {user_reference_letter}
            
            COMPANY FACTS (validate against these ONLY):
            {company_intel}
            
            EVALUATE (score 1-10 for each):
            
            1. NATURALNESS (no AI language)
               - Conjunctions at sentence start? (min 3x required)
               - Sentence length varies? (15-25 words avg)
               - NO forbidden phrases?
               - Sounds like a real person?
            
            2. STYLE MATCH (matches user's reference letters)
               - Tone matches references?
               - User's voice recognizable?
               - Structure followed?
               - Personal phrases used?
            
            3. FACTUAL ACCURACY (no hallucinations)
               - All company facts in company_intel?
               - No invented news/products?
               - No fake statistics?
            
            4. INDIVIDUALITY (not generic)
               - Concrete examples from CV?
               - Specific to THIS job?
               - Not interchangeable with other applications?
            
            FORMAT YOUR RESPONSE AS JSON:
            {{
              "naturalness_score": 8,
              "style_match_score": 7,
              "factual_accuracy_score": 10,
              "individuality_score": 8,
              "overall_score": 8.25,
              
              "issues_found": [
                "Only 1 sentence with conjunction start (need 3)",
                "Phrase 'freue mich auf' sounds generic"
              ],
              
              "suggestions": [
                "Start more sentences with 'Daher', 'Deshalb'",
                "Make closing more personal",
                "Add specific project example from CV"
              ],
              
              "hallucinations_detected": [],
              
              "decision": "ITERATE"  // or "APPROVE"
            }}
            """
        }],
        temperature=0.0  # Deterministic judging
    )
    
    # Parse judge result
    judge = json.loads(judge_result.content)
    
    # ═══════════════════════════════════════════════════════
    # STAGE 3: DECISION
    # ═══════════════════════════════════════════════════════
    
    if judge['overall_score'] >= 8.0:
        # APPROVED ✅
        break
    
    elif iteration < MAX_ITERATIONS - 1:
        # ITERATE with feedback
        previous_feedback = judge['suggestions']
        continue
    
    else:
        # Max iterations reached → Flag for human review
        flag_for_manual_review(job_id, judge)
        break
    
    # Log iteration
    supabase.table('generation_logs').insert({
        'job_id': job_id,
        'iteration': iteration + 1,
        'scores': judge,
        'issues': judge['issues_found'],
        'created_at': datetime.now()
    })

# Store final cover letter
supabase.table('cover_letters').insert({
    'user_id': user_id,
    'job_id': job_id,
    'content': cover_letter.content,
    'quality_scores': judge,
    'iterations_needed': iteration + 1,
    'created_at': datetime.now()
})

return {
    'cover_letter': cover_letter.content,
    'quality_scores': judge,
    'iterations': iteration + 1,
    'status': 'approved' if judge['overall_score'] >= 8 else 'needs_review'
}
```

**Quality Metrics to Track:**
- % of cover letters that pass first validation
- Average naturalness score
- Most common issues caught
- Iteration distribution (1x, 2x, 3x)

**Output:** Approved cover letter, ready for user review.

---

## 3. THE 3-LAYER ARCHITECTURE

### LAYER 1: DIRECTIVES (SOPs)

**Location:** `directives/`

**Purpose:** Standard Operating Procedures for each agent.

**Rule:** Never attempt a complex task without reading the directive first.

**Critical Directives:**
- `job_discovery.md` - How to scrape job boards (Version 2.0 - Platform Router)
- `job_matching.md` - How to calculate match scores
- `company_research.md` - How to research companies with Perplexity
- `cv_optimization.md` - How to optimize CVs with Claude
- `cover_letter_generation.md` - How to generate cover letters (3-stage)

**Directive Template:**
```markdown
# [AGENT NAME] DIRECTIVE

## Purpose
What this agent does and why it exists.

## When to Execute
Triggers that activate this agent.

## Input Requirements
What data this agent needs.

## Process
Step-by-step instructions.

## Output Specification
What this agent produces.

## Error Handling
What to do when things fail.

## Success Criteria
How to know if the agent succeeded.
```

---

### LAYER 2: ORCHESTRATION (The Router)

**Mode:** Plan → **STOP & ASK USER** → Execute

**Purpose:** Coordinate agents, manage workflow, handle errors.

**Orchestration Rules:**

1. **Sequential Execution** (for single job):
   ```
   Discovery → Matching → Research → CV → Cover Letter → User Review
   ```

2. **Parallel Execution** (for multiple jobs):
   ```python
   # Process multiple jobs in parallel
   from concurrent.futures import ThreadPoolExecutor
   
   with ThreadPoolExecutor(max_workers=5) as executor:
       futures = [executor.submit(process_job, job_id) 
                  for job_id in matched_jobs]
   ```

3. **Error Propagation**:
   - If Agent 1 fails → Retry 3x → Alert user
   - If Agent 3 fails → Continue without company intel (flag as limited)
   - If Agent 5 fails QA 3x → Flag for manual review

4. **Status Transitions**:
   ```
   scraped → matched → researched → cv_optimized → 
   cover_letter_generated → ready_for_review → ready_to_apply → submitted
   ```

**Example Workflow:**

```python
# User: "Apply to this job: https://..."

# PLAN MODE
plan = [
    "Step 1: Scrape job details from URL",
    "Step 2: Research company with Perplexity",
    "Step 3: Optimize CV for this job",
    "Step 4: Generate cover letter (3-stage QA)",
    "Step 5: Show to user for review"
]

# STOP & ASK USER
user_approval = ask_user(f"Here's the plan:\n{plan}\n\nProceed? [Y/N]")

if user_approval:
    # EXECUTION MODE
    job_data = agent_1_discover(url)
    company_intel = agent_3_research(job_data.company)
    optimized_cv = agent_4_optimize_cv(job_data, company_intel)
    cover_letter = agent_5_generate_cover_letter(
        job_data, company_intel, optimized_cv
    )
    
    # Update status
    update_job_status(job_id, "ready_for_review")
    notify_user(f"Your application for {job_data.title} is ready!")
```

**Motto:** "Edit the plan, not the code."

---

### LAYER 3: EXECUTION (Deterministic Scripts)

**Location:** `execution/`

**Purpose:** Production-ready scripts that execute agent directives.

**Rules for Execution Scripts:**

1. ✅ **Reproducible:** Same input = same output
2. ✅ **Wrapped in try/except:** No crashes
3. ✅ **Dry-run mode:** `--dry-run` flag for testing
4. ✅ **Logging:** Every action logged to Supabase
5. ✅ **Idempotent:** Can run multiple times safely

**Critical Scripts:**
- `scrape_job.py` - Execute Agent 1 (Job Discovery)
- `match_job.py` - Execute Agent 2 (Job Matching)
- `research_company.py` - Execute Agent 3 (Company Research)
- `optimize_cv.py` - Execute Agent 4 (CV Optimization)
- `generate_cover_letter.py` - Execute Agent 5 (Cover Letter Generation)
- `process_job_pipeline.py` - Orchestrate all agents

**Script Template:**

```python
#!/usr/bin/env python3
"""
Agent X Execution Script

Usage:
    python script_name.py --job-id <uuid> [--dry-run]
"""

import argparse
import logging
from datetime import datetime
from supabase import create_client

logger = logging.getLogger(__name__)

def main(job_id: str, dry_run: bool = False):
    """
    Execute Agent X workflow.
    
    Args:
        job_id: UUID of job to process
        dry_run: If True, don't commit changes
    """
    
    try:
        # 1. Fetch input data
        job = fetch_job_data(job_id)
        
        # 2. Execute agent logic
        result = agent_x_process(job)
        
        # 3. Validate output
        if not validate_output(result):
            raise ValueError("Output validation failed")
        
        # 4. Store result (unless dry-run)
        if not dry_run:
            save_result(job_id, result)
            log_success(job_id)
        else:
            logger.info(f"DRY RUN: Would save {result}")
        
        return result
        
    except Exception as e:
        logger.error(f"Agent X failed for job {job_id}: {e}")
        log_failure(job_id, str(e))
        raise

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--job-id", required=True)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    
    main(args.job_id, args.dry_run)
```

---

### LAYER 4: SKILLS (Reusable Modules)

**Location:** `skills/`

**Purpose:** DRY (Don't Repeat Yourself) - Modular, reusable code.

**Rule:** Before writing new code, check if a skill exists. If yes, IMPORT it.

**Critical Skills:**
- `scraping_router.py` - Platform-intelligent router
- `jina_reader.py` - HTML → Markdown converter
- `direct_api_scraper.py` - Greenhouse/Lever/Workday scraper
- `patchright_scraper.py` - StepStone/Monster/Xing scraper
- `perplexity_client.py` - Perplexity API wrapper with caching
- `claude_client.py` - Anthropic API wrapper with retry logic
- `pdf_generator.py` - Markdown to PDF converter
- `email_sender.py` - SMTP wrapper with templates
- `text_embeddings.py` - OpenAI embeddings with caching

**Skill Creation Protocol:**

If you write reusable code in `execution/`, ask:
> "Should I save this as a permanent Skill in /skills?"

**Example Skill:**

```python
# skills/perplexity_client.py

from perplexity import Client
import os
from functools import lru_cache

class PerplexityClient:
    def __init__(self):
        self.client = Client(api_key=os.getenv('PERPLEXITY_API_KEY'))
    
    @lru_cache(maxsize=100)
    def research_company(self, company_name: str) -> dict:
        """
        Research company with caching.
        Cache is valid for 30 days.
        """
        response = self.client.chat.completions.create(
            model="sonar-pro",
            messages=[{
                "role": "user",
                "content": f"Research {company_name}..."
            }],
            return_citations=True
        )
        
        return {
            "company_name": company_name,
            "intel": response.content,
            "citations": response.citations
        }
```

---

## 4. CHROME EXTENSION (Form Filler)

**Tech Stack:**
- **Framework:** Plasmo (React-based)
- **Manifest:** V3 (Chrome requirement)
- **Language:** TypeScript

**NOT an Agent** - It's a user interface tool.

**Architecture:** See `/docs/ARCHITECTURE.md` for complete implementation.

**Key Components:**

1. **Background Service Worker**
   - Checks for approved applications every 5 minutes
   - Updates badge count

2. **Content Script (Form Filler)**
   - Detects platform (Greenhouse, Lever, Workday, LinkedIn)
   - Fills form fields using saved selectors
   - Uploads CV & cover letter
   - Shows confirmation overlay

3. **Popup (User Interface)**
   - Lists pending applications
   - Quick actions (open job, start application)

**Flow:**
```
User approves application in Dashboard
  ↓
Status: ready_to_apply
  ↓
Chrome Extension detects
  ↓
User clicks "Start Application"
  ↓
Extension opens job URL
  ↓
Content script auto-fills form
  ↓
User reviews, clicks Submit
  ↓
Status: submitted
```

---

## 5. OPERATING PRINCIPLES

### A. DSGVO Compliance (Art. 22)

**No Full Automation:**
```
Status Flow:
pending → ready_for_review → ready_to_apply → submitted
            ↑ AI generates     ↑ User approves  ↑ User submits
```

**User MUST approve before:**
- ✅ CV is optimized
- ✅ Cover letter is sent
- ✅ Application is submitted

**Data Protection:**
- PII encrypted with Fernet
- Row-Level Security (RLS) enabled
- Audit logs for all AI operations
- User consent tracked

---

### B. Writing Style Requirements

**CRITICAL - Never Violate:**

1. **Conjunctions:** Minimum 3 sentences starting with:
   - "Daher", "Deshalb", "Gleichzeitig", "Während"

2. **No Clichés:**
   - ❌ "Hiermit bewerbe ich mich"
   - ❌ "I am excited to apply"
   - ❌ "Mit großem Interesse"

3. **Sentence Variety:**
   - Average: 15-25 words
   - Mix long and short sentences

4. **Company Integration:**
   - Use ONLY facts from Agent 3 (Perplexity research)
   - Subtle references (don't force)

5. **User Voice:**
   - Must sound like the user
   - Use phrases from reference letters

---

### C. Self-Annealing Loop

**Workflow:** Diagnose → Fix → Test → **Harden (Update Directive)**

**Limit:** Max 3 autonomous attempts before asking user.

**Example:**
```
1. LinkedIn changes HTML → Scraper fails
2. Agent: Diagnose (inspect new HTML)
3. Agent: Fix (update selectors)
4. Agent: Test (scrape 5 test jobs)
5. Agent: Harden (update directives/job_discovery.md)
```

---

### D. Visual Standards (Browser-First Development)

**Rule:** Always verify UI changes on `localhost:3000`.

**Checklist:**
- ✅ Page loads without console errors
- ✅ Framer Motion animations smooth (60 FPS)
- ✅ Dark mode works
- ✅ Mobile responsive (iPhone 14 Pro viewport)

**Visual Truth:** Trust the pixel, not the code.

---

## 6. FILE ORGANIZATION

```
pathly-v2/
├── AGENTS.md                 # This file (v2.1)
├── CLAUDE.md                 # AI assistant rules
├── mission.md                # North Star
├── actions.md                # Tactical backlog
├── stats.md                  # Metrics
│
├── docs/
│   └── ARCHITECTURE.md       # Complete system design
│
├── directives/               # Agent SOPs
│   ├── job_discovery.md      # v2.0 - Platform Router Architecture
│   ├── job_matching.md
│   ├── company_research.md
│   ├── cv_optimization.md
│   └── cover_letter_generation.md
│
├── execution/                # Production scripts
│   ├── scrape_job.py
│   ├── match_job.py
│   ├── research_company.py
│   ├── optimize_cv.py
│   ├── generate_cover_letter.py
│   └── process_job_pipeline.py
│
├── skills/                   # Reusable modules
│   ├── scraping_router.py    # NEW: Platform-intelligent router
│   ├── jina_reader.py        # NEW: HTML → Markdown
│   ├── direct_api_scraper.py # NEW: Greenhouse/Lever/Workday
│   ├── patchright_scraper.py # NEW: StepStone/Monster/Xing
│   ├── perplexity_client.py
│   ├── claude_client.py
│   ├── pdf_generator.py
│   ├── email_sender.py
│   └── text_embeddings.py
│
├── app/                      # Next.js Frontend
│   ├── (dashboard)/
│   ├── (auth)/
│   └── api/
│
├── components/               # React Components
│   ├── ApplicationTable.tsx
│   ├── JobCard.tsx
│   └── ReviewModal.tsx
│
├── database/                 # Supabase
│   ├── schema.sql
│   ├── migrations/
│   └── seed.sql
│
└── chrome-extension/         # Plasmo Extension
    ├── background/
    ├── content/
    └── popup/
```

---

## 7. AGENT COORDINATION MATRIX

**Pillar 1: Manual Application**
```
User Submits Job URL
   ↓
Agent 1: Scrape job details (Platform Router)
   ↓
Agent 3: Research company (Perplexity)
   ↓
Agent 4: Optimize CV
   ↓
Agent 5: Generate cover letter (3-stage QA)
   ↓
Status: ready_for_review
   ↓
User reviews & approves
   ↓
User applies manually OR Chrome Extension fills form
   ↓
Status: submitted
```

**Pillar 2: Automation**
```
Cron Job (8-10 AM daily)
   ↓
Agent 1: Scrape matching jobs (Platform Router)
   ↓
Agent 2: Calculate match score for each job
   ↓
[Filter: only match_score >= 70%]
   ↓
Agent 3: Research companies (parallel)
   ↓
Agent 4: Optimize CVs (parallel)
   ↓
Agent 5: Generate cover letters (parallel, 3-stage QA)
   ↓
Status: ready_for_review (notify user)
   ↓
User reviews & approves selected applications
   ↓
Status: ready_to_apply
   ↓
Chrome Extension fills forms
   ↓
User clicks Submit
   ↓
Status: submitted
```

**Parallel Processing:**
- Agent 3, 4, 5 can run in parallel for multiple jobs
- Rate limits respected (Claude: 50/min, Perplexity: 20/min)

**Error Handling:**
- If Agent fails → Retry 3x → Log error → Continue with next job
- If QA fails 3x → Flag for human review
- If no jobs match → Log, wait for next cron run

---

## 8. INTERNAL CHECKLIST

Before marking any task DONE:

1. ✅ Did I follow the Directive?
2. ✅ Did I update `stats.md` with metrics?
3. ✅ Did I append to `past.md` if milestone?
4. ✅ Is the code in `execution/` deterministic?
5. ✅ Did I visually verify UI on `localhost:3000`?
6. ✅ Did I test with `--dry-run` first?
7. ✅ Did I handle errors gracefully?
8. ✅ Did I log actions to Supabase?
9. ✅ Is data DSGVO compliant?
10. ✅ Did I check if reusable Skill exists in `/skills`?
11. ✅ Did Agent 5 QA validate the output (for cover letters)?
12. ✅ Did I use cached company intel if available?

---

## 9. EMERGENCY PROTOCOLS

### Scraper Blocked
**Action:**
1. Router automatically switches to fallback (Patchright)
2. Log to `failed_scrapes` table
3. Alert user if Pillar 1 (manual submission)
4. Continue with next job if Pillar 2 (automation)

### AI API Rate Limit
**Action:**
1. Queue requests in `pending_generations`
2. Switch to GPT-4 fallback (if Claude rate-limited)
3. Alert user: "Rate limited, processing queue"

### QA Rejects 3 Times
**Action:**
1. **STOP automated process**
2. Alert user: "Quality issues, manual review required"
3. Show: original draft + QA feedback + suggestions
4. Ask: "Approve current OR regenerate with feedback?"

### DSGVO Incident
**Action:**
1. **CRITICAL:** Immediately notify user
2. Log to `security_incidents`
3. Freeze all automated actions
4. Require user approval to continue

---

## 10. TECH STACK

**Frontend:**
- Next.js 15 (App Router)
- Tailwind CSS + shadcn/ui
- Zustand (state) + React Query (server)
- Zod + React Hook Form (validation)
- Framer Motion (animations)

**Backend:**
- Supabase (PostgreSQL + Auth + Storage)
- pg_cron (scheduled jobs with jitter)
- Row-Level Security (RLS)

**AI:**
- Claude Sonnet 4.5 (generation)
- Claude Haiku 4 (QA/judging)
- Perplexity Sonar Pro (research)
- OpenAI text-embedding-3-small (embeddings)

**Scraping:**
- **Bright Data API** (LinkedIn)
- **Direct JSON APIs** (Greenhouse/Lever/Workday)
- **Patchright** (StepStone/Monster/Xing)
- **Jina Reader** (HTML → Markdown post-processing)
- ScraperAPI (future: Indeed)
- Firecrawl (future: other platforms)

**Chrome Extension:**
- Plasmo Framework
- Manifest V3
- TypeScript

---

**System Status:** ✅ ACTIVE (Agent 1 Phase 1 Complete)  
**Version:** 2.1  
**Last Updated:** 2026-02-12  
**Next Review:** After 500 scrapes with new architecture  

---

**Major Changes from v2.0:**
- Agent 1: Complete rewrite with Platform-Router Architecture
- New Skills: scraping_router, jina_reader, direct_api_scraper, patchright_scraper
- Scraping Strategy: Platform-specific optimizations (98% LinkedIn, 99% Greenhouse, 75-85% StepStone)
- Cost Optimization: $345-493/month for 100k jobs (vs $800+ with ScraperAPI-only)
- Directive v2.0: directives/job_discovery.md fully updated
