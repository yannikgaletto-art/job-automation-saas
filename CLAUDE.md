# Pathly V2.0 - DEVELOPER OPERATING MANUAL

**Status:** MANDATORY FOR ALL AI AGENTS
**Version:** 3.6
**Last Updated:** 2026-04-01

---

## ⚠️ PFLICHTLEKTÜRE VOR ANIMATIONEN
→ docs/MOTION_PRINCIPLES.md
Kein Framer Motion Code ohne diese Datei gelesen zu haben.

## ⚠️ MIGRATIONS — AUTORITÄRER PFAD
→ supabase/migrations/ ist das einzige aktive Migrationsverzeichnis.
→ database/migrations/ ist veraltet — NIEMALS neue Migrationen dort anlegen.
→ Neue Migrationen IMMER in: supabase/migrations/

## ⚠️ COMPANY RESEARCH DIRECTIVE
→ directives/company_research.md (die einzige aktuelle Version)
→ AGENT_2.1 und AGENT_3.1 wurden gelöscht

## ⛔ CROSS-FEATURE-SHIELD (NEUE PFLICHT ab 2026-03-03)
→ directives/FEATURE_COMPAT_MATRIX.md
**PFLICHT bei JEDEM Task — keine Ausnahmen.**

Was das ist:
- Abschnitt 1: Feature-spezifische Kompatibilitäts-Matrizen (Cover Letter Modules)
- Abschnitt 2: **Generische Cross-Feature-Ownership-Regeln** — gilt für ALLE Features
- Abschnitt 3: Forbidden Files Liste — Dateien die NUR mit expliziter Freigabe angefasst werden dürfen

Warum das wichtig ist:
- Verhindert, dass ein Fix in Feature A die Features B, C, D crasht
- `model-router.ts` wird von CV Match, Steckbrief, Cover Letter UND Certificates genutzt
- Eine ungeplante Änderung dort hat Blast Radius auf ALLE Features
- Das kostet Zeit, Geld und Vertrauen

**Workflow:**
1. Task erhalten
2. FEATURE_COMPAT_MATRIX.md lesen (Abschnitt 2 + 3)
3. Prüfen: Berührt mein Task eine Forbidden File?
4. Wenn JA: STOPP → User fragen → Freigabe abwarten
5. Wenn NEIN: Fortfahren

## ⚠️ NEUES FEATURE? PFLICHT-ANALYSE ZUERST
→ directives/FEATURE_IMPACT_ANALYSIS.md
Jedes neue Feature braucht eine Impact Map BEVOR Code geschrieben wird.
Impact Map Yannik vorlegen und auf "Go" warten.

## 🔒 DOCUMENTATION SYNC PFLICHT (ab 2026-03-09)
Jede Änderung an der Datenbank oder den API-Routen erfordert zwingend Doku-Updates:
- **Neue SQL-Migration in `supabase/migrations/`** → `database/schema.sql` UND `ARCHITECTURE.md` Tabellenliste aktualisieren
- **Neue API-Route in `app/api/`** → `ARCHITECTURE.md` Route-Struktur aktualisieren
- **Neue DB-Tabelle mit `user_id`** → `docs/SICHERHEITSARCHITEKTUR.md` §3 (SESSION CONTRACT) aktualisieren

Kein PR/Commit ohne diese Updates. Diese Regel existiert, weil die Doku in den letzten Wochen vom Code abgedriftet ist und Agenten dann veraltete Informationen nutzen.

## ⚠️ i18n PROTOCOL (ab 2026-03-17)
→ directives/i18n_protocol.md
Jede Komponente mit User-sichtbaren Strings MUSS `useTranslations()` verwenden.
Kein hardcoded Text in JSX. Neuer key → de + en + es gleichzeitig.

## ⚠️ CV & COVER LETTER QUALITY
→ directives/QUALITY_CV_COVER_LETTER.md
Diese Standards sind BINDEND für alle Dokument-Generationen.
Qualitätsreferenz ist immer T1 (Mission Wertvoll).

## ⚠️ ZURÜCKGESTELLTE FEATURES (Backlog)
→ directives/DEFERRED_FEATURES.md
Liste aller Features, die für V2.0 depriorisiert wurden.

## ⚠️ KANONISCHE IMPORT-PFADE
| Service | Korrekter Import |
|---------|----------------|
| Supabase (Server) | @/lib/supabase/server |
| Supabase (Client) | @/lib/supabase/client |
| Job Search Pipeline | @/lib/services/job-search-pipeline |
| Onboarding Store | @/store/use-onboarding-store |
| Company Card | @/components/company/company-intel-card |
| Mood Symbols (Tag/Nacht) | @/lib/mood/mood-symbols |
| Supabase Admin (Service) | @/lib/supabase/admin |
| Credit Service | @/lib/services/credit-service |
| Credit Gate Middleware | @/lib/middleware/credit-gate |
| Stripe Service | @/lib/services/stripe-service |

---

## 🚀 RECENT FIXES
| Feature | Fix / Implementation |
|---------|----------------------|
| PDF Download | New API route `/api/documents/download` |
| Company Research | URL validation in research route |
| CV Match | Null guards (Array.isArray) + safeResult normalization in pipeline |
| Certificates | `company` → `company_name` DB column fix; Parallel Perplexity; Stale detection |
| Coaching | Text-Chat Mock Interview, Gap-Analyse, 3 Runden, PREP/3-2-1/CCC frameworks |
| Cover Letter Polish | Inngest `cover-letter/polish` pipeline: Audit Trail, Quote Injection, Critique |
| Cover Letter | `generationWarnings` pipeline fix — correctly passed to API response + UI |
| **Video Script Studio** | **`app/api/video/scripts/generate/route.ts` — Claude Haiku keyword categorization + block generation, `video_scripts` table** |
| **Avatar Picker** | **Animal avatar in Sidebar — 20 choices, saved to `user_profiles.avatar_animal`, Pathly brand colors** |
| **Morning Briefing** | **Popup removed (`morning-briefing.tsx` → returns null)** |
| **QR Code** | **Consent dialog before generation, embedded in Valley/Tech PDF templates** |
| **Azure Document Intelligence** | **PRIMARY CV/Cover Letter extractor (EU, DSGVO-konform). Claude Haiku = Fallback** |
| **CV Optimizer (2026-03-10)** | **Hydration-Fix, Summary-Toggle, Error-Handling with German messages, Zod-Schema generisch** |
| **ValleyTemplate (2026-03-10)** | **Max 3 Bullet-Points hard-cap. Zertifikate in rechte Spalte. KI-Prompt: 2-Seiten HARD RULE** |
| **CV Parser (2026-03-10)** | **Chrono-Sort: `sortExperienceByDate()` post-processing (Heute/MM.YYYY/MM/YYYY/YYYY)** |
| **i18n Tier 1 (2026-03-17)** | **`OptimizerWizard`, `DiffReview`, `command-palette` vollständig i18n. 3 neue Namespaces: `cv_optimizer`, `diff_review`, `command_palette`. ~55 Keys pro Locale (de/en/es).** |
| **Cover Letter i18n (2026-03-18)** | **`HookCard`, `StepHookSelection`, `StepStationMapping`, `StepToneConfig` vollständig i18n. 23 neue Keys (de/en/es). Fixes: `as any` → Union-Type, `intent`-Feld locale-aware für AI-Prompt, `useMemo` Import** |
| **Tone Config Key-Fix (2026-03-18)** | **`tone_data-driven` (Bindestrich) → `tone_data_driven` (Underscore) via `.replace(/-/g, '_')` in `toneOptionIds` useMemo. Root cause: dynamic key generation mit Hyphen statt Underscore** |
| **Formality Toggle i18n (2026-03-18)** | **`language === 'de'` → `language !== 'en' && locale !== 'en'`. ES zeigt Usted/Tú. EN komplett ausgeblendet (kein formell/informell). EN-Locale-Keys von German auf English korrigiert** |
| **Numbers Saved Button (2026-03-18)** | **Redesign: kleiner right-aligned button → full-width dark-navy matching "Start optimization". Label vereinfacht: "OK — numbers saved" → "Numbers Saved" / "Zahlen gespeichert"** |
| **Hiring Manager Critique (2026-03-18)** | **Fix: API 400-Error bei leerem `companyName` → Fallback "the company". Locale-aware Prompts: DE/EN/ES. `locale` Prop in `CoverLetterResultView` via `useLocale()` → Critique antwortet in App-Locale** |
| **Mood Check-in V2 (2026-03-19)** | **Adaptive Check-in mit Tag/Nacht-Symbolen (🌧️→☀️ / 🌑→🌕). Progressive Reduction: 5× Skip → auto-hide. `MoodCheckinContext` in `layout.tsx`. `useMoodCheckIn.tsx` mit Ref-basierter Auth-Subscription (kein Memory Leak). API GET/POST/PATCH mit `.maybeSingle()` und Fail-open. `CheckinSettingsCard` in Settings. i18n (de/en/es). `lib/mood/mood-symbols.ts` als kanonische Utility.** |
| **Cover Letter Language Fix (2026-03-25)** | **Locale-aware generation pipeline. `t(de, en)` helper used across `cover-letter-prompt-builder.ts`, `cover-letter-polish.ts`, `multi-agent-pipeline.ts`, and `cover-letter-judge.ts`. Complete prevention of DE/EN language mix when 'Eng' tone is selected.** |
| **CL Style Anti-Generic (2026-03-25)** | **Extended `StyleAnalysis` with 3 structural fields (`max_commas_per_sentence`, `uses_em_dash`, `rhetorical_contrast_pattern`). Haiku uses 1000 tokens for 9 fields. Prompt builder injects locale-aware structural constraints (blocking em-dashes, "nicht X, sondern Y", enforcing comma budget) natively in `customStyleBlock`.** |
| **CV Match Pipeline (2026-03-26)** | **Local dev fix: `inngest dev` server must be running to process `cv-match/analyze` events. Frontend stale detection aligned with Backend (4min threshold) to prevent dead-zone where frontend looped but API rejected retries.** |
| **CV Optimizer Reload Bug (2026-03-26)** | **Added missing `onComplete` callback in `OptimizerWizard` and bound it to `optimisticStep` in `UnifiedJobRow`. The Job Queue now instantly advances to "Cover Letter" visually after "Save" without requiring a page reload.** |
| **Stripe Monetization V1 (2026-04-01)** | **Credit-basiertes System: Free(6)/Starter(€9,90/20)/Durchstarter(€19,90/50). Atomic `debit_credits()` RPC mit FOR UPDATE Lock. `withCreditGate()` API-Wrapper. Stripe Checkout/Webhook/Portal. Idempotent webhook via `processed_stripe_events`. Centralized `lib/supabase/admin.ts` singleton. `getUserCreditsForClient()` strips `stripeCustomerId`. Billing i18n (de/en/es, 45+ Keys). Feature-Silo §9 in FEATURE_COMPAT_MATRIX.md.** |

---

## 🤖 AI STACK (AKTUELL — Stand 2026-03-09)

### Document Extraction (PRIMARY: EU, DSGVO-konform)
```
Azure Document Intelligence (prebuilt-read)
  Endpoint: https://pathly.cognitiveservices.azure.com/
  Region: West Europe (EU)
  Env: AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT / AZURE_DOCUMENT_INTELLIGENCE_KEY
  Fallback: pdf-parse (lokal, kein API)
```

### Metadata & PII Extraction (nach Azure-Extraktion)
```
Claude Haiku 4.5 (Anthropic US)
  Task: PII erkennen + Skills + Schreibstil
  Env: ANTHROPIC_API_KEY
```

### Routing-Logik (lib/ai/model-router.ts)
```
parse_html, extract_job_fields                              → Claude Haiku 4.5 (structured, deutsch)
detect_ats_system, classify_job_board, summarize             → GPT-4o-mini (cheap)
write_cover_letter, personalize_intro, optimize_cv      → Claude Sonnet 4.5 (premium)
cv_match, cv_parse, analyze_skill_gaps                  → Claude Haiku 4.5 (structured)
document_extraction (PRIMARY)                           → Azure Document Intelligence (EU)
```

**CRITICAL MODEL RULE:** 
ALLE neuen AI-Calls MÜSSEN zwingend die 4.5er Modelle nutzen (`claude-sonnet-4-5-20250929` oder `claude-haiku-4-5-20251001`). Die Verwendung von alten Modellen wie `claude-3-5-...` oder `claude-3-haiku-20240307` ist **STRENG VERBOTEN**.

### AI Content Generation (Writing Rules)
Wenn Prompts für Textgenerierungen (wie Cover Letter, CV-Bulletpoints oder Critiques) erstellt werden, MÜSSEN folgende Constraints standardmäßig integriert sein:
1. **Satzlänge:** Maximal 30 Wörter pro Satz. Ideal sind 20–25 Wörter.
2. **Satzstruktur:** Keine langen Schachtelsätze oder komplexe Nebensätze. Gedanken müssen in zwei kurze Sätze geteilt werden.
3. **Anrede-Integrität:** Wenn ein Ansprechpartner definiert ist, darf Claude niemals auf generische Phrasen wie "Dear Hiring Manager" zurückfallen.





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

0. **Impact Analysis (PFLICHT bei jedem neuen Feature):**
   - Führe `directives/FEATURE_IMPACT_ANALYSIS.md` durch
   - Erstelle die Impact Map und lege sie Yannik vor
   - Warte auf "Go" — kein Code ohne Freigabe

1. **Read the docs:**
   - `/ARCHITECTURE.md` - Complete system design (V5.0)
   - `/database/schema.sql` - Database structure (⚠️ Referenz-Snapshot — autoritäre Quelle sind `supabase/migrations/`)
   - **`directives/FEATURE_COMPAT_MATRIX.md`** - Cross-Feature-Ownership (PFLICHT)

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
   ```
   - **Visual Style**:
     - MUST match Dashboard design: Clean, Light Mode (`#FAFAF9`), Notion-like aesthetics.
     - Primary Text: `#37352F`, Secondary Text: `#73726E`.
     - Borders: `#E7E7E5`.
     - NO dark mode by default unless specified.
     - Use `lucide-react` for icons.
     - Use `framer-motion` for subtle interactions.
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
  // company_slug removed in Schema v3.0, using company_name as identifier
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

6. **DB Column Alignment Check:**
    ```sql
    -- Before using .select() in Supabase, verify column names:
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'job_queue';
    ```
    - Common trap: `company` vs `company_name` in `job_queue`
    - Always verify `.select()` column names match actual schema
    - Pipeline errors like `column X does not exist` → column name mismatch

7. **Stale Processing Detection:**
    - Inngest pipelines can die on server restart → DB status stuck at `processing`
    - GET endpoints should check `updated_at` vs threshold (5 min)
    - Return `failed` response (not DB write) for stale records

---

## 8. DEPLOYMENT

### Pre-Deployment Checklist

- [ ] All tests pass
- [ ] Database migrations applied
- [ ] Environment variables set
- [ ] RLS policies enabled
- [ ] No console.logs with PII
- [ ] Visual verification complete
- [ ] **Cross-Feature-Compatibility verified** (FEATURE_COMPAT_MATRIX.md checked)

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
6. **Cross-Feature-Shield** - Check FEATURE_COMPAT_MATRIX.md before touching shared files
7. **No hardcoded strings** - Every UI text goes through `useTranslations()` → i18n_protocol.md

---

**Status:** ACTIVE
**Next Review:** When adding major features
**Questions?** Check `/docs/ARCHITECTURE.md` first
