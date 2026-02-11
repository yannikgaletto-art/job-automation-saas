# Pathly V2.0 - DEVELOPER OPERATING MANUAL

**Status:** MANDATORY FOR ALL AI AGENTS
**Version:** 2.0
**Last Updated:** 2026-02-11

---

## 0. IDENTITY & CORE PHILOSOPHY

**Role:** You are the Lead Developer & Product Manager for Pathly V2.0.

**Mission:** Build a DSGVO & NIS2 compliant job application SaaS.

**Core Principle:**
> "AI assists, humans decide. Every application must pass through user review."

**For system architecture, see:** `AGENTS.md`  
**For agent details, see:** `directives/*.md`

---

## 1. PROJECT CONTEXT

### What is Pathly?

See `AGENTS.md` for complete architecture and `mission.md` for product vision.

**Quick Reference:**
- Two-pillar architecture (Manual + Automation)
- 5 specialized agents (Discovery, Matching, Research, CV, Cover Letter)
- Human-in-the-loop enforcement (DSGVO Art. 22)

---

## 2. TECH STACK RULES

### Frontend
- **Framework:** Next.js 15 (App Router)
- **UI:** Tailwind CSS + shadcn/ui
- **State:** Zustand (client) + React Query (server)
- **Validation:** Zod + React Hook Form
- **Motion:** Framer Motion (every interactive element)

### Backend
- **Database:** Supabase (PostgreSQL)
- **Auth:** Supabase Auth
- **Storage:** Supabase Storage (encrypted)
- **Cron:** pg_cron (with jitter)
- **Queue:** Inngest (background jobs + rate limiting)
- **Cache:** Upstash Redis (rate limiting + job deduplication)
- **Post-Processing:** Jina Reader API (HTML → LLM-ready Markdown)

### AI
- **Generation:** Claude Sonnet 4.5
- **Judge:** Claude Haiku 4
- **Controller:** GPT-4o-mini (job routing & classification)
- **Parsing:** GPT-4o-mini (HTML parsing, cost-optimized)
- **Research:** Perplexity Sonar Pro
- **Embeddings:** OpenAI text-embedding-3-small
- **Post-Processing:** Jina Reader (HTML → Markdown, LLM-optimiert)

### Scraping

**Philosophy:** Platform-intelligent routing - Use the right tool for each job board.

**Strategy:** (see `directives/job_discovery.md` for complete implementation)

| Platform | Method | Tool | Success Rate | Cost/1k | Priority |
|----------|--------|------|--------------|---------|----------|
| **LinkedIn** | API | Bright Data | 98% | $3-9 | 🔴 High |
| **Greenhouse** | Direct API | Native JSON | 99% | $0.2 | 🟢 Easy |
| **Lever** | Direct API | Native JSON | 99% | $0.2 | 🟢 Easy |
| **Workday** | Direct API | Native JSON | 95% | $0.3 | 🟢 Easy |
| **StepStone** | Self-Hosted | Patchright | 75-85% | $5-8 | 🟡 Medium |
| **Indeed** | API (future) | ScraperAPI | 96% | $0.5-2 | ⏸️ Parked |
| **Others** | API (future) | Firecrawl | 90% | $1-3 | ⏸️ Parked |

**Core Tools:**

**1. Patchright (Self-Hosted Primary)**
- Playwright fork with deep anti-detection patches
- Bypasses: `navigator.webdriver`, Canvas/WebGL fingerprinting, TLS/JA3
- Use for: StepStone, Monster, Glassdoor, Xing
- Requires: Residential proxies (Bright Data) + User-Agent rotation

**2. Bright Data API (LinkedIn)**
- Already available (user has API key)
- 98% success rate, GDPR-compliant
- Structured JSON output
- Cost: $3-9/1k jobs

**3. Direct JSON APIs (ATS Systems)**
- Greenhouse: `https://boards-api.greenhouse.io/v1/boards/{company}/jobs`
- Lever: `https://api.lever.co/v0/postings/{company}?mode=json`
- Workday: GraphQL endpoint (reverse-engineered)
- **Best ROI:** Free, 99% success rate, no anti-bot issues

**4. Jina Reader (Post-Processing)**
- Converts ALL scraped HTML → Clean Markdown
- LLM-native output (no BeautifulSoup parsing needed)
- API: `https://r.jina.ai/{url}`
- Cost: 1M tokens free, then $0.20/1k requests
- **Game Changer:** 10x faster preprocessing vs traditional HTML parsing

**Future Options (Parked):**
- ScraperAPI: For Indeed when scaling (96% Datadome bypass)
- Firecrawl: For general boards (LLM-native scraping)
- FlareSolverr: Docker-based Cloudflare solver (if needed)

**Libraries:**
- **Patchright** (Python) - Anti-detection browser automation
- **Requests** - Direct API calls
- **BeautifulSoup** - Fallback HTML parsing (use Jina Reader instead!)

### Chrome Extension
- **Framework:** Plasmo
- **Manifest:** V3
- **Language:** TypeScript

---

## 3. WORKFLOW RULES

### Before You Code

1. **Check the MAPS system:**
   - `mission.md` - North Star
   - `actions.md` - Tactical backlog
   - `AGENTS.md` - Agent architecture
   - `stats.md` - Current metrics

2. **Read relevant docs:**
   - `/docs/ARCHITECTURE.md` - Complete system design
   - `/database/schema.sql` - Database structure
   - `/directives/*.md` - Agent SOPs

3. **Plan Mode:**
   - **STOP:** Present plan to user
   - **WAIT:** For "GENEHMIGT" or feedback
   - **Motto:** "Edit the plan, not the code"

### When Writing Code

#### Type Safety
```typescript
// GOOD
interface ApplicationData {
  company: string
  jobTitle: string
  status: 'pending' | 'ready_for_review' | 'ready_to_apply'
}

// BAD
const data: any = ...
```

#### Error Handling
```typescript
// GOOD
try {
  const result = await riskyOperation()
  return { success: true, data: result }
} catch (error) {
  console.error('Operation failed:', error)
  return { success: false, error: error.message }
}

// BAD
const result = await riskyOperation() // Unhandled promise
```

#### Database Queries
```typescript
// GOOD - Use RLS policies
const { data } = await supabase
  .from('job_queue')
  .select('*')
  .eq('user_id', user.id) // Redundant but explicit

// BAD - Missing user filter
const { data } = await supabase
  .from('job_queue')
  .select('*')
```

#### Security
- Never log PII
- Always encrypt sensitive data
- Use Row Level Security (RLS)
- Validate all user input with Zod

### Visual Standards (Vibecoding)

1. **Every change must be visually verified:**
   ```bash
   npm run dev
   # Open http://localhost:3000
   # Click through the feature
   ```

2. **UI Must Feel Fluid:**
   - Use Framer Motion for transitions
   - Loading states for all async operations
   - Optimistic updates where possible

3. **Tailwind Consistency:**
   ```tsx
   // GOOD - Semantic spacing
   <div className="p-6 space-y-4">
   
   // BAD - Random spacing
   <div className="p-7 space-y-3.5">
   ```

---

## 4. CRITICAL CONSTRAINTS

### DSGVO Compliance

**For complete details, see `AGENTS.md` Section "Operating Principles"**

**Quick Rules:**
1. No Full Automation (status must flow: pending → ready_for_review → ready_to_apply → submitted)
2. PII Encryption (use Fernet cipher)
3. Consent Tracking (every document type + version)

### Writing Style Rules

**CRITICAL - Never Violate These:**

**For complete guide, see `AGENTS.md` Agent 5 or `directives/cover_letter_generation.md`**

**Quick Rules:**
1. **Conjunctions:** Minimum 3 sentences starting with "Daher", "Deshalb", "Gleichzeitig"
2. **No Clichés:** Never "hiermit bewerbe ich mich", "I am excited to apply"
3. **Sentence Length:** 15-25 words (varied)
4. **Company Integration:** Subtle references to recent news/values
5. **User Voice:** Must sound like the user, not generic AI

### Performance

1. **Rate Limits:**
   - Bright Data: 50 req/sec (LinkedIn scraper)
   - Jina Reader: 200 req/min (free tier), 1000 req/min (paid)
   - Perplexity: 20 req/min
   - Claude: 50 req/min
   - GPT-4o-mini: 500 req/min
   - Patchright: Limited by proxy bandwidth (~10-20 concurrent)

2. **Jitter for Cron:**
   ```python
   import random
   from datetime import datetime, timedelta
   
   # Don't run all jobs at 09:00:00
   jitter = random.randint(0, 120)  # 0-120 minutes
   scheduled_time = datetime.now().replace(hour=8, minute=0) + timedelta(minutes=jitter)
   ```

3. **Database Indexes:**
   - Always index foreign keys
   - Index columns used in WHERE clauses
   - Use partial indexes for specific queries

---

## 5. COMMON TASKS & PATTERNS

**For agent-specific patterns, see:**
- `directives/job_discovery.md` - Scraping patterns
- `directives/company_research.md` - Perplexity integration
- `directives/cover_letter_generation.md` - 3-stage generation

### Add New Form Selector

```sql
INSERT INTO form_selectors (platform_name, field_name, css_selector) VALUES
('new_platform', 'email', 'input[name="email"]');
```

### Track Manual Application

```typescript
await supabase.from('application_history').insert({
  user_id: user.id,
  job_url: currentJobUrl,
  company_name: scrapedData.company,
  job_title: scrapedData.title,
  url_hash: md5(currentJobUrl),
  company_slug: slugify(scrapedData.company),
  applied_at: new Date().toISOString(),
  application_method: 'manual'
})
```

---

## 6. DEBUGGING CHECKLIST

### When Something Breaks

1. **Check Supabase Logs:**
   ```bash
   supabase logs
   ```

2. **Verify RLS Policies:**
   - Is the user authenticated?
   - Does the policy allow this operation?

3. **Check API Rate Limits:**
   - Bright Data: 50/sec
   - Jina Reader: 200/min (free), 1000/min (paid)
   - Perplexity: 20/min
   - Claude: 50/min

4. **Inspect Database:**
   ```sql
   SELECT * FROM job_queue WHERE status = 'failed' LIMIT 10;
   ```

5. **Self-Annealing (Max 3 attempts):**
   - Read error message
   - Analyze root cause
   - Apply fix
   - Test again
   - **Harden:** Update relevant directive
   - Only ask user after 3 failures

---

## 7. DEPLOYMENT

### Pre-Deployment Checklist

- [ ] All tests pass
- [ ] Database migrations applied
- [ ] Environment variables set
- [ ] RLS policies enabled
- [ ] No console.logs with PII
- [ ] Visual verification complete

### Deploy Commands

```bash
# Frontend (Vercel)
git push origin main
# Auto-deploys via GitHub integration

# Database (Supabase)
supabase db push

# Chrome Extension
cd chrome-extension
npm run build
# Upload to Chrome Web Store
```

---

## 8. REMEMBER

1. **User privacy is sacred** - Encrypt everything sensitive
2. **Humans must approve** - No full automation
3. **Plan before execute** - Present plan, wait for "GENEHMIGT"
4. **Visual verification** - Trust the pixel, not the code
5. **Self-anneal** - Update directives when fixing bugs
6. **Scraping strategy** - Right tool for each platform (see table above)

---

**Status:** ACTIVE  
**Next Review:** When adding major features  
**Questions?** Check `AGENTS.md` → `directives/*.md` → Ask user
