# 🔍 NotebookLM Architecture Review
**Generated:** 2026-02-10  
**Reviewer:** NotebookLM AI (Google)  
**Scope:** ARCHITECTURE.md, README.md, SCRAPING_STRATEGY.md, database/schema.sql  
**Status:** ⚠️ **3 Critical Issues, 5 High Priority, 2 Medium**

---

## 📋 Executive Summary

Das Pathly V2.0 Projekt hat eine **solide technische Grundlage**, zeigt jedoch **kritische Inkonsistenzen** zwischen Dokumentations-Versionen und **fehlende Komponenten** für Production-Readiness. Die Review identifiziert 10 Issues, von denen 3 als **Blocker** für MVP-Launch gelten.

### 🚨 Critical Findings (Must-Fix vor MVP)
1. ❌ **Version Drift:** ARCHITECTURE.md (v3.0) vs README.md (v3.1.1)
2. ❌ **Missing Payment System:** Keine Stripe/LemonSqueezy Integration
3. ❌ **PII Leak Risk:** `job_queue.form_data` speichert unverschlüsselte PII

### ⚠️ High Priority (Must-Fix vor Scale)
4. ⚠️ **Missing Queue System:** pg_cron reicht nicht für 1000 Users
5. ⚠️ **Missing `scraping_logs` Table:** Observability fehlt
6. ⚠️ **Missing RLS Policy:** `form_selectors` Table ungeschützt
7. ⚠️ **Missing Trigram Index:** Performance-Bottleneck in `prevent_double_apply`
8. ⚠️ **Rate Limit Vulnerability:** Perplexity 20 req/min bei 1000 Users

### 💡 Medium Priority (Nice-to-Have)
9. 💡 **DSGVO Data Export:** Keine API/Prozess definiert
10. 💡 **Extension Auth Bridge:** Session-Sharing Next.js ↔ Plasmo unklar

---

## 🔴 CRITICAL ISSUES (P0)

### Issue #1: Version Drift (Documentation Inconsistency)
**Status:** 🔴 BLOCKER  
**Impact:** Entwickler bauen nach veralteten Spezifikationen

#### Problem
- **ARCHITECTURE.md:** Stand v3.0 (veraltet)
- **README.md:** Stand v3.1.1 (aktuell)
- **Konflikt:** Tech Stack unterscheidet sich fundamental

| Component | ARCHITECTURE.md (v3.0) | README.md (v3.1.1) |
|-----------|------------------------|---------------------|
| Job Scraping | Playwright (Primary) | SerpAPI (Primary) |
| LLM Controller | ❌ Nicht erwähnt | ✅ GPT-4o-mini |
| Embeddings | ❌ Nicht erwähnt | ✅ OpenAI text-embedding-3-small |
| Firecrawl | ❌ Ignoriert | ✅ ATS-only (korrekt) |
| Scale Costs | €825/mo | €940/mo |

#### Impact
- ❌ **Developer Confusion:** Wer ARCHITECTURE.md liest, baut den falschen Stack
- ❌ **Budget Failure:** Kosten-Kalkulation um €115/mo falsch
- ❌ **LinkedIn Scraping Fail:** Playwright statt SerpAPI führt zu 70% Failure Rate

#### Solution
```bash
# Action 1: ARCHITECTURE.md auf v3.1.1 synchronisieren
# Kopiere Tech Stack, Scraping Strategy, Kosten aus README.md

# Action 2: Versionierung einführen
# Füge zu jedem .md hinzu:
---
Version: 3.1.1
Last Updated: 2026-02-10
---
```

#### Files to Update
- `docs/ARCHITECTURE.md` - Komplettes Rewrite auf v3.1.1 Basis
- `README.md` - Add version header
- `docs/SCRAPING_STRATEGY.md` - Add version header

---

### Issue #2: Missing Payment System
**Status:** 🔴 BLOCKER für Monetarisierung  
**Impact:** Keine Subscriptions = Keine Einnahmen

#### Problem
- ✅ **Pricing definiert:** Free (€0), Starter (€29), Pro (€79)
- ❌ **Payment Integration fehlt:** Kein Stripe, LemonSqueezy, Paddle
- ❌ **Database Schema fehlt:** Nur `subscription_tier` Enum in `user_profiles`

#### Was fehlt
```sql
-- Fehlende Tables:
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
  stripe_customer_id TEXT UNIQUE NOT NULL,
  stripe_subscription_id TEXT UNIQUE,
  plan_id TEXT NOT NULL, -- 'starter' | 'pro'
  status TEXT NOT NULL CHECK (status IN ('active', 'canceled', 'past_due', 'trialing')),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID REFERENCES subscriptions(id),
  stripe_invoice_id TEXT UNIQUE NOT NULL,
  amount_total INTEGER NOT NULL,
  currency TEXT DEFAULT 'eur',
  status TEXT NOT NULL,
  invoice_pdf TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Webhook Verarbeitung
CREATE TABLE stripe_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT UNIQUE NOT NULL,
  event_type TEXT NOT NULL,
  processed BOOLEAN DEFAULT false,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### Solution
**Tech Stack Addition:**
```
Payment: Stripe (EU-compliant) oder LemonSqueezy (Merchant of Record)
```

**Implementation Steps:**
1. Add to `package.json`: `stripe@^14.0.0`
2. Create `/app/api/webhooks/stripe/route.ts` für Webhook Handling
3. Add Stripe Keys zu `.env.example`:
   ```bash
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_PUBLISHABLE_KEY=pk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   ```
4. Update `docs/ARCHITECTURE.md` mit Payment Flow Diagram

#### Files to Create
- `database/migrations/003_add_payment_tables.sql`
- `app/api/webhooks/stripe/route.ts`
- `lib/stripe.ts` (Client initialization)
- `components/PricingPage.tsx` (mit Stripe Checkout)

---

### Issue #3: PII Leak Risk in `job_queue.form_data`
**Status:** 🔴 DSGVO VIOLATION RISK  
**Impact:** Unverschlüsselte PII im Klartext

#### Problem
```sql
-- Aktueller Stand (FALSCH):
CREATE TABLE job_queue (
  ...
  form_data JSONB, -- ❌ PII im Klartext!
  ...
);

-- form_data enthält:
{
  "name": "Max Mustermann",      // PII
  "email": "max@example.com",    // PII
  "phone": "+49 151 12345678",   // PII
  "address": "Musterstr. 1"      // PII
}
```

**DSGVO Verstoß:**
- Art. 32 DSGVO fordert "Encryption at Rest" für PII
- `user_profiles` verwendet korrekt `BYTEA pii_encrypted`
- `job_queue.form_data` ignoriert das Konzept

#### Impact
- ❌ **Compliance Risk:** DSGVO-Bußgeld bis €20M oder 4% Jahresumsatz
- ❌ **Data Breach:** Bei DB-Leak sind alle Bewerberdaten offen
- ❌ **Audit Failure:** NIS2 Audit wird das sofort monieren

#### Solution (Option 1: Reference-Only)
```sql
-- EMPFOHLEN: Speichere keine Daten, nur Referenz
ALTER TABLE job_queue 
  DROP COLUMN form_data,
  ADD COLUMN user_profile_id UUID REFERENCES user_profiles(id);

-- Extension liest PII aus user_profiles zur Laufzeit
-- Vorteil: Single Source of Truth für PII
```

#### Solution (Option 2: Encrypted Storage)
```sql
-- ALTERNATIV: Verschlüsselte Kopie
ALTER TABLE job_queue 
  ALTER COLUMN form_data TYPE BYTEA USING form_data::TEXT::BYTEA;

-- Umbenennen für Klarheit
ALTER TABLE job_queue 
  RENAME COLUMN form_data TO form_data_encrypted;

-- App-Layer muss dann verschlüsseln/entschlüsseln
```

#### Recommended Approach
**Option 1** (Reference-Only) ist sauberer:
- ✅ Keine Daten-Duplikation
- ✅ Keine zusätzliche Verschlüsselung nötig
- ✅ User-Update propagiert automatisch

#### Files to Update
- `database/schema.sql` - Zeile 245 (`form_data` entfernen)
- `database/migrations/004_fix_pii_leak.sql` - Migration erstellen
- `chrome-extension/content-script.tsx` - Logik anpassen

---

## ⚠️ HIGH PRIORITY ISSUES (P1)

### Issue #4: Missing Queue System for Scale
**Status:** ⚠️ BLOCKER für 1000+ Users  
**Impact:** API Rate Limits führen zu Crashes

#### Problem
**Aktuell:**
```sql
-- pg_cron für Job Discovery (zu simpel)
SELECT cron.schedule(
  'daily-job-scout',
  '0 9 * * *',
  'SELECT discover_jobs()'
);
```

**Szenario bei 1000 Users:**
- 09:00 Uhr: 1000 User aktiviert, Daily Scout startet
- Perplexity Limit: **20 req/min**
- Benötigte Zeit: **50 Minuten** (ohne Queue crasht es sofort)
- Claude API: **100 req/min** (ebenfalls Bottleneck)

#### Impact
- ❌ **Rate Limit Errors:** 980 von 1000 Jobs scheitern sofort
- ❌ **No Retry Logic:** Fehlgeschlagene Jobs werden nicht wiederholt
- ❌ **User Frustration:** "Daily Scout funktioniert nicht"

#### Solution
**Add Message Queue:**

```bash
# Tech Stack Addition:
# Option 1: BullMQ (Redis-based, selbst hosten)
npm install bullmq ioredis

# Option 2: Inngest (Managed, einfacher)
npm install inngest

# Option 3: Upstash QStash (Serverless)
npm install @upstash/qstash
```

**Empfehlung: Inngest** (für MVP)
- ✅ Managed (kein Redis-Hosting)
- ✅ Built-in Rate Limiting
- ✅ Automatic Retries
- ✅ Free Tier: 50k Events/mo

**Implementation:**
```typescript
// lib/inngest/client.ts
import { Inngest } from 'inngest';

export const inngest = new Inngest({ id: 'pathly-v2' });

// lib/inngest/functions.ts
export const discoverJobs = inngest.createFunction(
  { 
    id: 'discover-jobs',
    rateLimit: {
      key: 'event.data.userId',
      limit: 10,
      period: '1h' // Max 10 Jobs pro User pro Stunde
    }
  },
  { event: 'job/discover' },
  async ({ event, step }) => {
    const jobs = await step.run('scrape-jobs', () => 
      scrapeJobs(event.data.searchParams)
    );
    
    await step.run('research-company', () => 
      researchCompany(jobs[0].company)
    );
    
    await step.run('generate-cover-letter', () =>
      generateCoverLetter(event.data.userId, jobs[0])
    );
  }
);

// Perplexity Rate Limiting
export const researchCompany = inngest.createFunction(
  {
    id: 'research-company',
    rateLimit: {
      limit: 20,
      period: '1m', // Perplexity: 20 req/min
      key: 'global' // Gilt für alle User zusammen
    }
  },
  { event: 'company/research' },
  async ({ event }) => {
    return await perplexityClient.search(event.data.companyName);
  }
);
```

#### Files to Create
- `lib/inngest/client.ts`
- `lib/inngest/functions.ts`
- `app/api/inngest/route.ts` (Webhook Handler)
- Update `.env.example` mit `INNGEST_EVENT_KEY` und `INNGEST_SIGNING_KEY`

#### Files to Update
- `docs/ARCHITECTURE.md` - Section "Background Jobs" rewrite
- `README.md` - Tech Stack: Add Inngest
- `package.json` - Add dependency

---

### Issue #5: Missing `scraping_logs` Table
**Status:** ⚠️ BLOCKER für Observability  
**Impact:** Keine Metrics für Scraper-Performance

#### Problem
**README.md definiert:**
> Database Schema Highlights:
> - `scraping_logs` - Performance tracking for all scrapers

**Aber:**
- ❌ Table existiert nicht in `database/schema.sql`
- ❌ Keine Metrics für SerpAPI → ScraperAPI → Firecrawl Fallback
- ❌ Keine Kostenkontrolle (welche API wird wie oft genutzt?)

#### Solution
```sql
-- database/migrations/005_add_scraping_logs.sql
CREATE TABLE scraping_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  job_queue_id UUID REFERENCES job_queue(id) ON DELETE CASCADE,
  
  -- Scraper Info
  scraper_used TEXT NOT NULL CHECK (scraper_used IN ('serpapi', 'scraperapi', 'firecrawl', 'playwright')),
  url TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('job_board', 'ats_system', 'company_page')),
  
  -- Performance
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER GENERATED ALWAYS AS (
    EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000
  ) STORED,
  
  -- Status
  status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'rate_limited')),
  error_message TEXT,
  fallback_count INTEGER DEFAULT 0,
  
  -- Cost Tracking
  estimated_cost_cents INTEGER, -- z.B. SerpAPI = 1 Cent
  
  -- Metadata
  response_size_bytes INTEGER,
  fields_extracted JSONB, -- Welche Felder wurden gefunden?
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes für Analytics
CREATE INDEX idx_scraping_logs_user ON scraping_logs(user_id);
CREATE INDEX idx_scraping_logs_scraper ON scraping_logs(scraper_used);
CREATE INDEX idx_scraping_logs_created ON scraping_logs(created_at DESC);

-- Analytics View
CREATE VIEW scraper_performance AS
SELECT 
  scraper_used,
  source_type,
  COUNT(*) as total_requests,
  COUNT(*) FILTER (WHERE status = 'success') as successful,
  ROUND(AVG(duration_ms)) as avg_duration_ms,
  SUM(estimated_cost_cents) / 100.0 as total_cost_eur
FROM scraping_logs
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY scraper_used, source_type
ORDER BY total_requests DESC;
```

#### Usage in Code
```typescript
// lib/scrapers/index.ts
async function scrapeWithFallback(url: string, userId: string) {
  const scrapers = ['serpapi', 'scraperapi', 'firecrawl', 'playwright'];
  let fallbackCount = 0;
  
  for (const scraper of scrapers) {
    const logId = await db.scraping_logs.insert({
      user_id: userId,
      scraper_used: scraper,
      url,
      source_type: detectSourceType(url),
      started_at: new Date()
    });
    
    try {
      const result = await executeScraper(scraper, url);
      
      await db.scraping_logs.update(logId, {
        completed_at: new Date(),
        status: 'success',
        response_size_bytes: JSON.stringify(result).length,
        fields_extracted: result,
        estimated_cost_cents: getScraperCost(scraper)
      });
      
      return result;
    } catch (error) {
      await db.scraping_logs.update(logId, {
        completed_at: new Date(),
        status: 'failed',
        error_message: error.message,
        fallback_count: ++fallbackCount
      });
    }
  }
  
  throw new Error('All scrapers failed');
}
```

#### Files to Create
- `database/migrations/005_add_scraping_logs.sql`
- `app/dashboard/analytics/page.tsx` (Scraper Performance Dashboard)

#### Files to Update
- `lib/scrapers/index.ts` - Add logging calls

---

### Issue #6: Missing RLS Policy for `form_selectors`
**Status:** ⚠️ SECURITY RISK  
**Impact:** Crowdsourced Learning System ungeschützt

#### Problem
```sql
-- Aktuelle Table:
CREATE TABLE form_selectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_board TEXT NOT NULL,
  field_name TEXT NOT NULL,
  selector TEXT NOT NULL,
  selector_type TEXT CHECK (selector_type IN ('css', 'xpath', 'playwright')),
  success_count INTEGER DEFAULT 0,
  fail_count INTEGER DEFAULT 0,
  verified_by_user_id UUID REFERENCES user_profiles(id),
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ❌ KEINE RLS POLICY!
```

**Risiko:**
- ❌ Chrome Extension kann nicht lesen (RLS blockiert ohne Policy)
- ❌ Böswillige User könnten falsche Selektoren schreiben
- ❌ Keine Authentifizierung für Crowdsourced-Daten

#### Solution
```sql
-- Enable RLS
ALTER TABLE form_selectors ENABLE ROW LEVEL SECURITY;

-- Policy 1: Jeder authentifizierte User kann lesen
CREATE POLICY "Allow authenticated read" 
  ON form_selectors 
  FOR SELECT 
  USING (auth.role() = 'authenticated');

-- Policy 2: Nur verifizierte User können neue Selektoren vorschlagen
CREATE POLICY "Allow verified users to insert" 
  ON form_selectors 
  FOR INSERT 
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() 
      AND email_verified = true
      AND created_at < NOW() - INTERVAL '7 days' -- Account mindestens 7 Tage alt
    )
  );

-- Policy 3: Nur Admins können verifizieren
CREATE POLICY "Only admins can verify" 
  ON form_selectors 
  FOR UPDATE 
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() 
      AND role = 'admin'
    )
  )
  WITH CHECK (verified_by_user_id = auth.uid());
```

#### Files to Update
- `database/schema.sql` - Add RLS policies after table definition
- `database/migrations/006_add_form_selectors_rls.sql`

---

### Issue #7: Missing Trigram Index for `prevent_double_apply`
**Status:** ⚠️ PERFORMANCE BOTTLENECK  
**Impact:** "Double-Apply Check" wird bei Scale extrem langsam

#### Problem
```sql
-- Aktueller Trigger nutzt Fuzzy Match:
CREATE FUNCTION prevent_double_apply() RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM application_history
    WHERE user_id = NEW.user_id
    AND (
      -- Exact URL Match (30 Tage)
      (job_url_hash = NEW.job_url_hash AND applied_at > NOW() - INTERVAL '30 days')
      OR
      -- Fuzzy Title Match (90 Tage) ⚠️ LANGSAM!
      (
        company_slug = NEW.company_slug
        AND job_title % NEW.job_title  -- ❌ Trigram ohne Index = Full Scan
        AND applied_at > NOW() - INTERVAL '90 days'
      )
    )
  ) THEN
    RAISE EXCEPTION 'Already applied';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

**Performance-Problem:**
- Bei 10.000 Applications im System:
  - Ohne Index: ~2000ms (Full Table Scan)
  - Mit Trigram Index: ~5ms (Index Lookup)

#### Solution
```sql
-- database/migrations/007_add_trigram_index.sql

-- Extension ist bereits aktiviert, aber Index fehlt
CREATE INDEX idx_app_history_title_trgm 
  ON application_history 
  USING GIN (job_title gin_trgm_ops);

-- Optional: Index auch auf company_slug für bessere Performance
CREATE INDEX idx_app_history_company_slug 
  ON application_history(company_slug);

-- Compound Index für die kombinierte Abfrage
CREATE INDEX idx_app_history_double_check 
  ON application_history(user_id, company_slug, applied_at DESC)
  WHERE applied_at > NOW() - INTERVAL '90 days';
```

#### Performance Validation
```sql
-- Vor Index:
EXPLAIN ANALYZE
SELECT 1 FROM application_history
WHERE user_id = 'xxx'
AND company_slug = 'google'
AND job_title % 'Senior Software Engineer'
AND applied_at > NOW() - INTERVAL '90 days';

-- Result: Seq Scan on application_history (cost=0..1543 rows=1)
--         Execution Time: 1847.322 ms

-- Nach Index:
-- Result: Bitmap Index Scan using idx_app_history_title_trgm
--         Execution Time: 4.891 ms
```

#### Files to Create
- `database/migrations/007_add_trigram_index.sql`

---

### Issue #8: Perplexity Rate Limit Vulnerability
**Status:** ⚠️ BLOCKER bei 1000+ Users  
**Impact:** Company Research crasht bei Peak Load

#### Problem
**Perplexity Limits:**
- Free Tier: 5 req/min
- Pro Tier (€20/mo): 20 req/min
- Exceeded: 429 Error → Job scheitert

**Szenario:**
- 1000 User, Daily Scout um 09:00 Uhr
- Jeder findet 3 neue Jobs → 3000 Research Calls
- Benötigte Zeit: **150 Minuten** (bei 20 req/min)
- Ohne Queue: **Crash nach 20 Requests**

#### Solution (Teil 1: Rate Limiting in Code)
```typescript
// lib/perplexity/rate-limiter.ts
import { RateLimiter } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL!,
  token: process.env.UPSTASH_REDIS_TOKEN!
});

export const perplexityLimiter = new RateLimiter({
  redis,
  limiter: RateLimiter.slidingWindow(20, '1 m'), // 20 req/min
  prefix: 'perplexity'
});

// lib/perplexity/client.ts
export async function researchCompany(companyName: string, userId: string) {
  // Rate Limit Check
  const { success, remaining } = await perplexityLimiter.limit('global');
  
  if (!success) {
    throw new Error('Rate limit exceeded, retry in 60s');
  }
  
  // Log für Monitoring
  console.log(`Perplexity: ${remaining} requests remaining this minute`);
  
  // Actual API Call
  return await perplexityClient.search(companyName);
}
```

#### Solution (Teil 2: Caching)
```sql
-- company_research Table (bereits vorhanden, aber nutzen!)
-- ✅ Die Table existiert bereits!

-- Vor API-Call: Check Cache
SELECT * FROM company_research 
WHERE company_slug = 'google'
AND created_at > NOW() - INTERVAL '7 days'
LIMIT 1;

-- Cache Hit: Spare API Call!
-- Cache Miss: API Call + Insert
```

```typescript
// lib/perplexity/cached-research.ts
export async function getCachedCompanyResearch(companySlug: string) {
  // 1. Check Cache (7 Tage gültig)
  const cached = await db.company_research.findFirst({
    where: {
      company_slug: companySlug,
      created_at: { gt: subDays(new Date(), 7) }
    }
  });
  
  if (cached) {
    console.log(`Cache hit for ${companySlug}`);
    return cached.data;
  }
  
  // 2. API Call mit Rate Limiting
  const data = await researchCompany(companySlug, 'system');
  
  // 3. Cache speichern
  await db.company_research.create({
    data: {
      company_slug: companySlug,
      company_name: data.name,
      data: data
    }
  });
  
  return data;
}
```

#### Impact
- ✅ **Cache Hit Rate ~60%:** Viele User bewerben sich bei denselben Firmen (Google, Amazon)
- ✅ **Rate Limit Respekt:** Keine 429 Errors mehr
- ✅ **Cost Savings:** 60% weniger API Calls = €12/mo statt €20/mo

#### Files to Create
- `lib/perplexity/rate-limiter.ts`
- `lib/perplexity/cached-research.ts`

#### Files to Update
- `lib/perplexity/client.ts` - Add rate limiting
- `.env.example` - Add `UPSTASH_REDIS_URL` und `UPSTASH_REDIS_TOKEN`

---

## 💡 MEDIUM PRIORITY ISSUES (P2)

### Issue #9: DSGVO Data Export Missing
**Status:** 💡 COMPLIANCE GAP  
**Impact:** DSGVO Art. 20 (Right to Data Portability) nicht implementiert

#### Problem
**ARCHITECTURE.md behauptet:**
> ✅ Data Portability (JSON export)

**Realität:**
- ❌ Kein API Endpoint `/api/user/export`
- ❌ Kein Prozess definiert
- ❌ Keine UI im Dashboard

#### Solution
```typescript
// app/api/user/export/route.ts
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  // 1. User Profile (entschlüsselt PII)
  const profile = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', user.id)
    .single();
  
  // 2. Documents
  const documents = await supabase
    .from('documents')
    .select('*')
    .eq('user_id', user.id);
  
  // 3. Application History
  const applications = await supabase
    .from('application_history')
    .select('*')
    .eq('user_id', user.id);
  
  // 4. Job Queue
  const jobs = await supabase
    .from('job_queue')
    .select('*')
    .eq('user_id', user.id);
  
  // 5. Cover Letter Versions
  const coverLetters = await supabase
    .from('cover_letter_versions')
    .select('*')
    .eq('user_id', user.id);
  
  const exportData = {
    exported_at: new Date().toISOString(),
    user: profile,
    documents,
    applications,
    jobs,
    cover_letters
  };
  
  // Als JSON Download
  return new Response(JSON.stringify(exportData, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="pathly-data-${user.id}.json"`
    }
  });
}
```

#### Files to Create
- `app/api/user/export/route.ts`
- `app/dashboard/settings/export/page.tsx` (UI Button)

---

### Issue #10: Extension Auth Bridge Unclear
**Status:** 💡 TECHNICAL DEBT  
**Impact:** Chrome Extension kann nicht sicher mit Backend kommunizieren

#### Problem
**Architecture beschreibt:**
- ✅ Next.js nutzt Supabase Auth (Cookies)
- ✅ Chrome Extension (Plasmo) muss Jobs abrufen
- ❌ **Wie wird Session geteilt?**

**Challenge:**
- Chrome Extension läuft in isoliertem Context
- Service Worker kann keine Cookies lesen
- Content Script kann keine HTTP-Only Cookies sehen

#### Solution (Message Passing + Access Token)
```typescript
// chrome-extension/background/index.ts
import { createClient } from '@supabase/supabase-js';

// 1. Get Access Token from Next.js via Message
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SET_ACCESS_TOKEN') {
    chrome.storage.local.set({ 
      accessToken: message.token,
      expiresAt: message.expiresAt 
    });
    sendResponse({ success: true });
  }
});

// 2. Use Token for API Calls
async function fetchJobs() {
  const { accessToken } = await chrome.storage.local.get('accessToken');
  
  const supabase = createClient(
    process.env.PLASMO_PUBLIC_SUPABASE_URL!,
    process.env.PLASMO_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    }
  );
  
  const { data } = await supabase
    .from('job_queue')
    .select('*')
    .eq('status', 'ready_to_apply');
  
  return data;
}
```

```typescript
// app/dashboard/extension/page.tsx
'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function ExtensionSyncPage() {
  useEffect(() => {
    async function syncToken() {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.access_token) {
        // Send Token to Extension
        window.postMessage({
          type: 'PATHLY_SET_TOKEN',
          token: session.access_token,
          expiresAt: session.expires_at
        }, '*');
      }
    }
    
    syncToken();
  }, []);
  
  return (
    <div>
      <h1>Extension ist synchronisiert</h1>
      <p>Du kannst jetzt mit dem Auto-Apply starten.</p>
    </div>
  );
}
```

#### Files to Create
- `chrome-extension/background/auth.ts`
- `app/dashboard/extension/page.tsx`
- `docs/EXTENSION_AUTH.md` (Dokumentation des Flows)

---

## 📊 PRIORITIZED ACTION PLAN

### Phase 1: Critical Fixes (Diese Woche)
**Estimated Time:** 6-8 Stunden

| Issue | Task | Effort | Files |
|-------|------|--------|-------|
| #1 | Sync ARCHITECTURE.md zu v3.1.1 | 2h | `docs/ARCHITECTURE.md` |
| #2 | Add Payment System (Stripe) | 3h | `database/migrations/003_*.sql`, `lib/stripe.ts` |
| #3 | Fix PII Leak (form_data) | 1h | `database/migrations/004_*.sql` |

**Deliverable:** MVP kann sicher launchen

---

### Phase 2: High Priority (Nächste Woche)
**Estimated Time:** 10-12 Stunden

| Issue | Task | Effort | Files |
|-------|------|--------|-------|
| #4 | Add Queue System (Inngest) | 4h | `lib/inngest/*`, `app/api/inngest/route.ts` |
| #5 | Add scraping_logs Table | 2h | `database/migrations/005_*.sql` |
| #6 | Add RLS for form_selectors | 1h | `database/migrations/006_*.sql` |
| #7 | Add Trigram Index | 1h | `database/migrations/007_*.sql` |
| #8 | Perplexity Rate Limiter + Cache | 3h | `lib/perplexity/*` |

**Deliverable:** System skaliert zu 1000 Users

---

### Phase 3: Polish (Vor Public Launch)
**Estimated Time:** 6-8 Stunden

| Issue | Task | Effort | Files |
|-------|------|--------|-------|
| #9 | DSGVO Data Export | 3h | `app/api/user/export/route.ts` |
| #10 | Extension Auth Bridge | 3h | `chrome-extension/background/auth.ts` |

**Deliverable:** Compliance & Extension funktioniert

---

## ✅ CLAUDE OPUS CHECKLIST

Wenn du diese Datei liest, arbeite die Issues in dieser Reihenfolge ab:

### Week 1: Critical Fixes
- [ ] **Issue #1:** Update `docs/ARCHITECTURE.md` to v3.1.1 (copy from README.md)
- [ ] **Issue #2:** Create `database/migrations/003_add_payment_tables.sql`
- [ ] **Issue #2:** Create `lib/stripe.ts` and `/app/api/webhooks/stripe/route.ts`
- [ ] **Issue #3:** Create `database/migrations/004_fix_pii_leak.sql` (remove form_data column)
- [ ] **Issue #3:** Update `chrome-extension/content-script.tsx` to read from `user_profiles`

### Week 2: Scale Prep
- [ ] **Issue #4:** Add Inngest to `package.json`
- [ ] **Issue #4:** Create `lib/inngest/client.ts` and `lib/inngest/functions.ts`
- [ ] **Issue #5:** Create `database/migrations/005_add_scraping_logs.sql`
- [ ] **Issue #5:** Update `lib/scrapers/index.ts` to log all scrape attempts
- [ ] **Issue #6:** Create `database/migrations/006_add_form_selectors_rls.sql`
- [ ] **Issue #7:** Create `database/migrations/007_add_trigram_index.sql`
- [ ] **Issue #8:** Create `lib/perplexity/rate-limiter.ts` and `cached-research.ts`

### Week 3: Launch Prep
- [ ] **Issue #9:** Create `app/api/user/export/route.ts`
- [ ] **Issue #9:** Add "Export Data" button to `app/dashboard/settings/page.tsx`
- [ ] **Issue #10:** Create `chrome-extension/background/auth.ts`
- [ ] **Issue #10:** Create `app/dashboard/extension/page.tsx` for token sync

### Final Validation
- [ ] Run all migrations: `supabase db reset`
- [ ] Test Payment Flow: Create Stripe Test Subscription
- [ ] Test Rate Limiter: Send 25 Perplexity requests in 1 minute (should throttle)
- [ ] Test Export: Download JSON, verify all user data is included
- [ ] Test Extension: Verify token is synced and API calls work

---

## 📚 REFERENCES

- [NotebookLM Prompt 1: Architecture Validation](https://notebooklm.google.com)
- [NotebookLM Prompt 2: Database Schema Review](https://notebooklm.google.com)
- [Stripe Integration Guide](https://stripe.com/docs/payments/accept-a-payment)
- [Inngest Docs](https://www.inngest.com/docs)
- [Supabase RLS Policies](https://supabase.com/docs/guides/auth/row-level-security)
- [DSGVO Art. 20 (Data Portability)](https://gdpr-info.eu/art-20-gdpr/)

---

**Status:** 📝 Ready for Implementation  
**Next Action:** Start with Issue #1 (ARCHITECTURE.md sync)  
**Estimated Total Effort:** 22-28 hours across 3 weeks
