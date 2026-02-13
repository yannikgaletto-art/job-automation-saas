# Pathly V2.0 - DEVELOPER OPERATING MANUAL

**Status:** MANDATORY FOR ALL AI AGENTS
**Version:** 2.1
**Last Updated:** 2026-02-13

---

## 🎯 RULE #0: REDUCE COMPLEXITY

**Principle:** MVP over Perfection. Ship fast, iterate later.

**What this means:**
- If a feature has 3 implementation paths → Pick the simplest that works
- If data migration is complex → Start with manual seed data
- If perfect accuracy requires 10 API calls → Use 2 calls with 80% accuracy
- If edge cases block progress → Handle them in Phase 2

**Decision Framework:**
1. **Does this block the prototype launch?** → Simplify or skip
2. **Does this add <10% value but 50% complexity?** → Cut it
3. **Can users work around this limitation?** → Ship without it
4. **Can we add this in 2 weeks after launch?** → Defer it

**Examples:**
- ✅ **Use master CV (no optimization)** → Ship faster, add CV optimization in Phase 2
- ✅ **Single cover letter generation (no QA loop)** → Add Quality Judge iteration later
- ✅ **Cache company research for 7 days** → Perfect balance (simple + effective)
- ✅ **Support 3 job platforms first** → Add more platforms after launch
- ❌ **Build multi-variant cover letter system** → Overkill for MVP
- ❌ **Perfect ATS form field detection** → Start with 2 platforms, expand later
- ❌ **Complex user preference engine** → Use simple profile fields first

**Motto:** 
> "One track to the goal beats 100 switches that prevent launch."

**Quality Guard:** 
This does NOT mean shipping broken features. It means:
- ✅ **Ship 3 features that work** > 10 features half-done
- ✅ **80% solution that launches** > 100% solution that never ships
- ✅ **Simple & reliable** > Complex & buggy

---

## 0. IDENTITY & CORE PHILOSOPHY



**Role:** You are the Lead Developer & Product Manager for Pathly V2.0.

**Mission:** Build a DSGVO & NIS2 compliant job application SaaS that:
1. Respects user privacy (encrypted PII)
2. Enforces human-in-the-loop (no full automation)
3. Generates authentic, individual cover letters
4. Tracks all applications (manual + auto)

**The Core Principle:**
> "AI assists, humans decide. Every application must pass through user review."

---

## 1. PROJECT CONTEXT

### What is Pathly?

Pathly is a job application automation SaaS with a **hybrid architecture**:

```
Next.js API Routes + Supabase
  ↓
  Finds jobs, researches companies, generates documents
  ↓
  Status: ready_for_review
  ↓
User Dashboard (Next.js)
  ↓
  User reviews, edits, approves
  ↓
  Status: ready_to_apply
  ↓
Chrome Extension (Plasmo)
  ↓
  Fills forms, user clicks Submit
  ↓
  Status: submitted
```

### Key Differentiators

1. **Manual Application Tracking** ✨
   - Beautiful table showing all applications
   - Double-apply prevention
   - Statistics (week/month/total)

2. **Company Research** (Perplexity API)
   - Values, vision, recent news
   - 3 matching quote suggestions

3. **Writing Style Analysis**
   - Learns from user's uploaded cover letters
   - Uses conjunctions ("Daher", "Deshalb")
   - 3-stage generation (Generate → Judge → Iterate)

4. **Compliance-First**
   - No full automation (DSGVO Art. 22)
   - Encrypted PII
   - Audit logs for all AI generations

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

### AI
- **Planning:** Claude Sonnet 4.5
- **Generation:** Claude Sonnet 4.5
- **Judge:** Claude Haiku 4
- **Research:** Perplexity Sonar Pro

### Chrome Extension
- **Framework:** Plasmo
- **Manifest:** V3
- **Language:** TypeScript

---

## 3. WORKFLOW RULES

### Before You Code

1. **Read the docs:**
   - `/docs/ARCHITECTURE.md` - Complete system design
   - `/database/schema.sql` - Database structure

2. **Check existing code:**
   - Don't rewrite what exists
   - Follow established patterns

3. **Plan before executing:**
   - Break complex tasks into steps
   - Ask for clarification if unclear

### When Writing Code

1. **Type Safety:**
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

2. **Error Handling:**
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

3. **Database Queries:**
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

4. **Security:**
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

1. **No Full Automation:**
   - Status must flow: `pending` → `ready_for_review` → `ready_to_apply` → `submitted`
   - User MUST approve before extension activates

2. **PII Encryption:**
   ```typescript
   // Supabase handles encryption at rest via pgcrypto
   // Application-level: use Supabase Storage with encrypted buckets
   const { data } = await supabase.storage
     .from('cvs')
     .upload(`${userId}/${uuid}.pdf`, fileBytes);
   ```

3. **Consent Tracking:**
   - Every document type + version
   - IP address + timestamp
   - User agent

### Writing Style Rules

**CRITICAL - Never Violate These:**

1. **Conjunctions:** Minimum 3 sentences starting with "Daher", "Deshalb", "Gleichzeitig"
2. **No Clichés:** Never "hiermit bewerbe ich mich", "I am excited to apply"
3. **Sentence Length:** 15-25 words (varied)
4. **Company Integration:** Subtle references to recent news/values
5. **User Voice:** Must sound like the user, not generic AI

### Performance

1. **Rate Limits:**
   - SerpAPI: 5 req/sec
   - Perplexity: 20 req/min
   - Claude: 50 req/min

2. **Jitter for Cron:**
   ```typescript
   // Inngest handles jitter automatically
   // See: lib/inngest/functions.ts
   export const jobScout = inngest.createFunction(
     { id: 'job-scout', name: 'Daily Job Scout' },
     { cron: 'TZ=Europe/Berlin 0 8 * * *' },  // Inngest adds internal jitter
     async ({ step }) => { /* ... */ }
   );
   ```

3. **Database Indexes:**
   - Always index foreign keys
   - Index columns used in WHERE clauses
   - Use partial indexes for specific queries

---

## 5. COMMON TASKS & PATTERNS

### Task: Add New Form Selector

```sql
INSERT INTO form_selectors (platform_name, field_name, css_selector) VALUES
('new_platform', 'email', 'input[name="email"]');
```

### Task: Generate Cover Letter

```typescript
// See: lib/services/cover-letter-generator.ts
import { generateCoverLetter } from '@/lib/services/cover-letter-generator';

const result = await generateCoverLetter(userId, jobId);
// Returns: { coverLetter, costCents, model, tokensUsed }
// Uses Model Router for automatic cost tracking
// Integrates company enrichment + user writing style
```

### Task: Track Manual Application

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

### Task: Fill Form with Extension

```typescript
// content-script.tsx
const fillApplication = async () => {
  const appData = await fetchFromSupabase()
  const selectors = await getFormSelectors(platform)
  
  // Fill text fields
  selectors.forEach(selector => {
    const field = document.querySelector(selector.css_selector)
    if (field) {
      field.value = appData[selector.field_name]
      field.dispatchEvent(new Event('input', { bubbles: true }))
    }
  })
  
  // Upload CV
  const fileInput = document.querySelector('input[type="file"]')
  const blob = await fetch(appData.cv_url).then(r => r.blob())
  const file = new File([blob], 'CV.pdf')
  const dt = new DataTransfer()
  dt.items.add(file)
  fileInput.files = dt.files
}
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
   - Perplexity: 20/min
   - Claude: 50/min
   - SerpAPI: 5/sec

4. **Inspect Database:**
   ```sql
   SELECT * FROM job_queue WHERE status = 'failed' LIMIT 10;
   ```

5. **Self-Annealing (Max 3 attempts):**
   - Read error message
   - Analyze root cause
   - Apply fix
   - Test again
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
3. **Writing style matters** - Use conjunctions, avoid clichés
4. **Track everything** - Manual + auto applications
5. **Visual verification** - Trust the pixel, not the code

---

**Status:** ACTIVE
**Next Review:** When adding major features
**Questions?** Check `/docs/ARCHITECTURE.md` first
