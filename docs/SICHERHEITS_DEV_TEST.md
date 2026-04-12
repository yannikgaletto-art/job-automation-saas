---
Version: 2.0.0
Last Updated: 2026-04-12
Status: AKTIV — PFLICHTLEKTÜRE vor jedem Gate Test
Gehört zu: SICHERHEITSARCHITEKTUR.md, DEPLOYMENT_CHECKLIST.md
---

# 🧪 SICHERHEITS_DEV_TEST — Pathly V2.0

> **Zweck:** Dieses Dokument speichert alle operativen Learnings aus echten Gate Tests.
> Die SICHERHEITSARCHITEKTUR.md definiert WAS gebaut wird.
> Die DEPLOYMENT_CHECKLIST.md definiert WIE wir deployen.
> Dieses Dokument definiert WIE wir testen — und welche Fallen wir bereits kennen.

---

## 1. ENVIRONMENT RULES (Pflicht)

### Browser
- ✅ **Nur Chrome** für lokale Dev-Tests
- ❌ **Nie Safari** — Safari und Chrome haben separate Cookie-Stores. Eine defekte Safari-Session täuscht einen Bug vor, der keiner ist.
- Nach jedem Wechsel des Test-Accounts: Cookies in Chrome löschen (DevTools → Application → Cookies → Delete)

### Port
- ✅ Immer auf **Port 3000** entwickeln und testen
- Wenn Port 3000 belegt ist: `pkill -f "next dev"` → neu starten
- ❌ Nie auf Port 3001 testen — alle Daten, Konfiguration und Vercel-Redirects sind auf 3000 ausgelegt
- Symptom: `npm run dev` zeigt `⚠ Port 3000 is in use, trying 3001` → sofort killen und neu starten

### Port 3001 — NUR für Pathly Website
- `/Users/yannik/.gemini/antigravity/pathly-website/` ist die Marketing-Landing-Page
- **Separates Repo**, keine shared DB, kein shared Code mit SaaS
- Läuft auf Port 3001 wenn gleichzeitig mit SaaS entwickelt wird

### Git
- ✅ Vor jedem Pull: `git log --oneline origin/main` lesen
- ✅ Vor jedem `git pull --rebase`: prüfen ob lokale Commits bereits auf GitHub sind
- ❌ Nie blind pullen wenn `git status` zeigt `ahead by N commits`
- Wenn Merge Conflict entsteht: `git rebase --abort` → `git reset --hard origin/main`

---

## 2. DEV-SERVER ABHÄNGIGKEITEN

Für vollständige lokale Entwicklung sind **3 Prozesse** nötig:

| # | Befehl | Port | Pflicht? |
|---|--------|------|----------|
| 1 | `npm run dev` | 3000 | ✅ Immer |
| 2 | `npx inngest-cli@latest dev` | 8288 | ✅ Für Background Jobs |
| 3 | Chrome Browser (nicht Safari) | — | ✅ Immer |

**Symptome fehlender Prozesse:**
- Ohne Inngest: Job-Extract, CV-Match, Cover Letter Polish, Coaching Report — hängen alle im "processing" Status
- Ohne Chrome: Auth-Cookies verhalten sich anders (Safari-Artefakt)

---

## 3. DB-RESET NACH GATE TESTS (Pflicht)

Nach jedem Gate Test **kann** der DB-Zustand zurückgesetzt werden:

| Test | Was geändert wurde | Reset-Query |
|------|-------------------|-------------|
| Gate A (Onboarding Loop) | `onboarding_completed = false` | `UPDATE user_settings SET onboarding_completed = true WHERE user_id = '<deine_user_id>';` |
| Gate B (Persistenz) | Test-Job in Queue | Manuell löschen oder stehen lassen |
| Gate C (CV Dateiname) | Test-CV hochgeladen | Kein Reset nötig |
| Gate D (Credits) | Credits verbraucht | `UPDATE user_credits SET credits_used = 0 WHERE user_id = '<user_id>';` |
| Gate E (Rate Limit) | Upstash Rate Counter | Expire automatisch (1-10 min Window) |

**Deine user_id (yannik.galetto@gmail.com):** `39a9b432-ef4f-49f9-b590-9b3a6ea2de0e`

---

## 4. AKTIVER SECURITY STACK (Stand: 2026-04-12)

### 4.1 Authentication & Authorization
- **Supabase Auth** — JWT-basiert, Cookie-Session, auto-refresh
- **Middleware** (`middleware.ts`) — prüft `getUser()` für alle `/dashboard/*` und `/onboarding` Routes
- **RLS** (Row Level Security) — alle User-Tabellen haben `user_id = auth.uid()` Policies
- **Service Role Key** — nur in API Routes (server-side), nie im Client

### 4.2 Rate Limiting (Upstash Redis)
- **12 Rate Limiters** in `lib/api/rate-limit-upstash.ts`
- Geschützte Endpunkte: Cover Letter, CV Match/Optimize/Bullet, Video Script, Job Ingest, Job Search, Coaching Message/Transcribe, Feedback, Waitlist
- **Vercel-Pflicht:** `UPSTASH_REDIS_URL` + `UPSTASH_REDIS_TOKEN` (⚠️ NICHT `_REST_URL`!)
- **Fallback:** Ohne Upstash → alle Requests gehen durch (bewusstes Dev-Verhalten, MUSS in Prod konfiguriert sein)

### 4.3 Credit System (Stripe)
- **Atomic `debit_credits()` RPC** — Supabase DB Function, Race-Condition-sicher
- **`withCreditGate()`** — Middleware für AI-Operationen, Auto-Refund bei Fehlern
- **Stripe Webhook** — Idempotent via `processed_stripe_events` Tabelle
- **402 Responses** — `CREDITS_EXHAUSTED` / `QUOTA_EXHAUSTED` mit Upgrade-URL

### 4.4 PII Sanitization (DSGVO)
- **`sanitizeForAI()`** — Pseudonymisiert Namen, Emails, Telefonnummern, IBANs
- **Aktiv auf:** Coaching, Job Ingest, Job Extract, Company Enrichment
- **Bewusste Ausnahme:** Cover Letter + CV Optimize (brauchen echte Karrieredaten, aber `personalInfo` wird vor AI-Call gelöscht)
- **Audit:** `content_hash` (SHA256) in `generation_logs`, `quality_summary.pii_flags`

### 4.5 Security Headers (next.config.js)
- X-Frame-Options: DENY
- HSTS: 2 Jahre + preload
- X-Content-Type-Options: nosniff
- Referrer-Policy: strict-origin-when-cross-origin
- Permissions-Policy: camera/mic self-only
- CSP: Explizite Allowlist für alle Domains

### 4.6 Error Monitoring
- **Sentry** — Client + Server, PII gestrippt (`beforeSend` löscht email/IP/username)
- **PostHog** — EU-Endpoint, localStorage (keine Cookies), all inputs masked
- **Helicone** — ⏸️ Deferred bis DPA unterzeichnet (Art. 46 DSGVO)

### 4.7 Data Retention (pg_cron)
- Coaching: 90d `conversation_history → '[]'`, 180d DELETE
- SerpAPI Raw: 30d → NULL
- Firecrawl Markdown: 14d → NULL
- Generation Logs: `generated_text` auf NULL (5 Write-Pfade)

---

## 5. DIAGNOSE-CHECKLISTEN

### 5.1 Redirect-Bugs (Onboarding Loop)
Wenn `/dashboard` zu `/onboarding` redirected obwohl `onboarding_completed = true`:

1. **Browser:** Chrome? (nicht Safari)
2. **Cookie:** DevTools → Application → Cookies → `sb-...-auth-token` vorhanden?
3. **DB:** `SELECT us.user_id, us.onboarding_completed, pg_typeof(us.onboarding_completed) FROM user_settings us WHERE user_id = '<id>';` → Typ muss `boolean` sein
4. **Fix:** Cookies löschen → neu einloggen

### 5.2 Rate Limiting funktioniert nicht
1. **Upstash Vars korrekt?** `UPSTASH_REDIS_URL` (NICHT `_REST_URL`)
2. **Console-Warnung?** `[rate-limit-upstash] ⚠️ UPSTASH_REDIS_URL/TOKEN not set`
3. **Redis verbunden?** Upstash Dashboard → Request Counter steigt

### 5.3 Stripe Webhook kommt nicht an
1. **URL korrekt?** `https://app.path-ly.eu/api/stripe/webhook`
2. **Secret korrekt?** `STRIPE_WEBHOOK_SECRET` auf Vercel ≠ local `.env.local`
3. **Signatur:** Log `❌ [Stripe Webhook] Signature verification failed` → Secret falsch
4. **Idempotenz:** `⏭️ Event already processed` → Event wurde schon verarbeitet (ok)

### 5.4 AI-Calls schlagen fehl
1. **API Key vorhanden?** Prüfe `ANTHROPIC_API_KEY`, `MISTRAL_API_KEY`, `OPENAI_API_KEY`
2. **Rate Limit?** Anthropic/Mistral haben eigene Limits
3. **maxDuration?** Vercel Free = 10s, Pro = 60s. Cover Letter braucht 120s → Vercel Pro pflicht
4. **Model-Router Fallback:** Ohne `MISTRAL_API_KEY` → automatischer Haiku-Fallback (teurer, aber funktioniert)

### 5.5 PostHog sendet keine Events
1. **CSP:** Browser Console → `Refused to connect to 'eu.i.posthog.com'` → CSP `connect-src` vergessen
2. **Key:** `NEXT_PUBLIC_POSTHOG_KEY` gesetzt? Auf Vercel NICHT als "Sensitive" markiert?
3. **Init:** PostHog initialisiert? Prüfe ob `initPostHog()` in der App aufgerufen wird

---

## 6. GATE TEST PROTOKOLL (Vorlage)

```
Datum: ___________
Batch: ___________
Tester: ___________
Browser: Chrome ✅
Port: 3000 ✅
Inngest Dev: Running ✅
Git HEAD: ___________
tsc: 0 errors ✅

Gate A — Onboarding Loop: ✅/❌
Gate B — Datenpersistenz: ✅/❌
Gate C — CV Upload + Extraction: ✅/❌
Gate D — Credit Debit/Refund: ✅/❌
Gate E — Rate Limiting (5 rapid calls → 429): ✅/❌
Gate F — Cover Letter Generate: ✅/❌
Gate G — Stripe Webhook (Test Event): ✅/❌
Gate H — PostHog Event sichtbar: ✅/❌
Gate I — Sentry Error sichtbar: ✅/❌

Offene Punkte: ___________
Freigabe für Deploy: JA / NEIN
```

---

## 7. RLS VERIFIKATION (nach jeder neuen Migration)

```sql
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE tablename IN (
    'job_queue', 'application_history', 'generation_logs', 'documents',
    'user_credits', 'credit_events', 'coaching_sessions', 'video_scripts',
    'community_posts', 'volunteering_bookmarks'
)
ORDER BY tablename;
```

Erwartung: Mindestens 1 Policy pro Tabelle. Leere Liste → Migration nochmal ausführen.

---

## 8. BEKANNTE FALLEN (wächst mit jedem Batch)

| # | Problem | Ursache | Fix |
|---|---------|---------|-----|
| 1 | `/dashboard` → redirect zu `/onboarding` obwohl DB = true | Defekte Safari-Session | Chrome nutzen, Cookies löschen |
| 2 | `npm run dev` startet auf 3001 | Port 3000 belegt | `pkill -f "next dev"` → neu starten |
| 3 | Merge Conflict beim Pull | Lokale Commits nicht gepusht | `git rebase --abort` → `git reset --hard origin/main` |
| 4 | Gate A schlägt fehl nach Test | `onboarding_completed` nicht zurückgesetzt | DB-Reset SQL |
| 5 | Rate Limiting deaktiviert auf Vercel | `UPSTASH_REDIS_REST_URL` statt `UPSTASH_REDIS_URL` | Variable umbenennen (ohne `_REST`) |
| 6 | PostHog blockiert im Browser | CSP `connect-src` fehlt `eu.i.posthog.com` | `next.config.js` CSP updaten |
| 7 | `NEXT_PUBLIC_*` als Sensitive auf Vercel | Variable nicht im Client-Bundle | Sensitive-Flag entfernen |
| 8 | Cover Letter timeout auf Vercel Free | `maxDuration: 120` > Vercel Free Limit (10s) | Vercel Pro erforderlich |
| 9 | ADMIN_SECRET leer → Cost Report offen | `process.env.ADMIN_SECRET \|\| ''` → `'' === ''` ist true | ADMIN_SECRET setzen |

---

> Dieses Dokument wird nach jedem Batch um neue Learnings erweitert.
> Letzte Aktualisierung: 2026-04-12 — Upstash, PostHog, Stripe, Credit System, PII Sanitizer
