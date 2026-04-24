# Pathly V2.0 — Production Implementation Plan
**Version:** 2.0  
**Erstellt:** 2026-04-02  
**Autor:** CTO Review + Full QA Pass  
**Basis:** MASTER_PLAN.md, ARCHITECTURE.md v5.0, CLAUDE.md v3.6

> **Philosophie:** Lieber 5 Dinge, die wirklich funktionieren, als 15 halbfertige Features.  
> Jede Phase hat einen klaren Go/No-Go-Gate. Kein Batch startet ohne grünes Licht.

---

## 🔍 CTO-ASSESSMENT: Blinde Flecken im Ursprungsplan

### Was gut war
- Solide Feature-Coverage über alle Schichten
- DSGVO-Phasen 1+2 bereits deployed
- Stripe Monetization V1 live
- pg_cron Retention Policies aktiv

### Kritische Lücken (nicht adressiert im Ursprungsplan)

| # | Lücke | Schicht | Risiko |
|---|-------|---------|--------|
| 1 | **Kein Rate-Limiting** auf AI-Endpoints | Middleware | Kosten-Spike, DoS-Risiko |
| 2 | **Kein Error-Budget / SLA-Definition** | Operations | Kein Maßstab für "läuft gut" |
| 3 | **Kein Rollback-Plan** für Migrations | Database | Irreversibler Datenverlust |
| 4 | **Inngest Monitoring fehlt** (nur 90s Timeout) | Backend | Stale Jobs unsichtbar |
| 5 | **Kein Healthcheck-Endpoint** | API | Kein Uptime-Monitoring möglich |
| 6 | **DSGVO SCCs noch offen** (Anthropic, Perplexity, SerpAPI) | Legal | Produktionsverbot möglich |
| 7 | **Chrome Extension nicht in CI** | DevOps | Extension deployed, nicht getestet |
| 8 | **Kein API-Versioning** | API | Breaking Changes ohne Notice |
| 9 | **Phase 7 APIs noch offen** (Document Upload, User Profile) | Backend | Core-Flow bricht |
| 10 | **Tests = 0%** (Phase 10 komplett offen) | QA | Deploy ohne Netz |
| 11 | **Kein Observability-Stack** | Monitoring | Fehler in Production unsichtbar |
| 12 | **Credit-Gate auf neuen AI-Calls** nicht verified | Business | Revenue Leak |
| 13 | **i18n bei neuen Features** oft vergessen | Frontend | Broken UI für EN/ES User |
| 14 | **FEATURE_COMPAT_MATRIX** nicht im Plan verankert | Process | Blast Radius bei Änderungen |

---

## 🗺️ PHASEN-ÜBERSICHT (Neu strukturiert)

```
BATCH 0 — Foundations (Blocker für alles andere)
BATCH 1 — Core APIs (Das Rückgrat)
BATCH 2 — Security & Compliance (Pflicht vor Live)
BATCH 3 — Reliability & Observability (Sehen, was passiert)
BATCH 4 — Quality Gates (Tests + Verification)
BATCH 5 — Performance & Polish (Skalierbarkeit)
BATCH 6 — Growth Features (Post-Launch)
```

**Erfolgreiche SaaS wie Linear, Vercel und Stripe machen es so:**  
1. Core-Flow funktioniert bulletproof → 2. Monitoring sieht alles → 3. Tests schützen den Core → 4. Features kommen danach

---

## ⚡ BATCH 0 — Hard Blockers (Must-Fix vor allem anderen)

> Diese Items blockieren jeden anderen Fortschritt. Null Ausnahmen.

### B0.1 — Offene SCCs & DPAs (DSGVO Art. 46)

**Status aus ARCHITECTURE.md:**
- Anthropic: 🟡 In Progress
- OpenAI: 🟡 In Progress  
- SerpAPI: 🟡 In Progress
- Perplexity: 🟡 In Progress

**Action Items:**
- [ ] Anthropic DPA abschließen (Priority 1 — größter AI-Anteil)
- [ ] OpenAI Zero Data Retention aktivieren (1-Click in Dashboard)
- [ ] SerpAPI DPA anfordern + unterschreiben
- [ ] Perplexity DPA anfordern + unterschreiben
- [ ] Alle SCCs in `docs/COMPLIANCE/` ablegen (neues Verzeichnis)
- [ ] `ARCHITECTURE.md` §4.2 Status auf ✅ updaten

**Warum Blocker:** Ohne abgeschlossene SCCs ist jeder Production-Deploy in Deutschland ein aktiver DSGVO-Verstoß nach Art. 46. Bußgelder bis 4% des Jahresumsatzes (oder 20 Mio €).

**Referenz:** Linear, Notion, Vercel veröffentlichen alle ihre DPA-Seiten öffentlich unter `/legal/dpa`.

---

### B0.2 — Phase 7 Core APIs (Das Rückgrat fehlt noch)

Laut MASTER_PLAN.md sind Phase 7 APIs komplett offen. Der Core-Flow ist ohne sie nicht vollständig.

**B0.2a — Document Upload API**
- [ ] `POST /api/documents/upload` — vollständig implementieren
  - [ ] File Validation (max 5MB, PDF/DOCX only, MIME-Type-Check)
  - [ ] Azure DI als Primary Extractor (EU, DSGVO-konform)
  - [ ] Claude Haiku als Fallback (mit pii-sanitizer.ts vorgeschaltet)
  - [ ] Supabase Storage encrypted bucket upload
  - [ ] `documents` table INSERT
  - [ ] Response: `{ documentId, extractedData, warnings[] }`
- [ ] `ARCHITECTURE.md` Route-Liste updaten (CLAUDE.md Sync-Pflicht)

**B0.2b — User Profile API**
- [ ] `GET /api/user/profile` — PII-Decryption für Edit Mode
- [ ] `PATCH /api/user/profile` — Re-Encryption nach Update
- [ ] Zod-Validation auf allen Feldern
- [ ] RLS-Verify: nur eigenes Profil lesbar/schreibbar

**B0.2c — Application History API** (falls noch nicht live)
- [ ] `POST /api/applications/track`
- [ ] `GET /api/applications/history` (paginated)
- [ ] `GET /api/applications/stats`

---

### B0.3 — Healthcheck Endpoint

Ohne diesen Endpoint kann kein Uptime-Monitoring (Vercel, UptimeRobot, etc.) funktionieren.

- [ ] `GET /api/health` implementieren
  ```typescript
  // Response: { status: "ok", version: "2.0.0", timestamp: ISO }
  // Checks: DB Ping (Supabase), kein AI-Call (zu teuer für Health)
  // HTTP 200 = healthy, HTTP 503 = degraded
  ```
- [ ] `GET /api/health/deep` (optional, authenticated) 
  - Supabase connection test
  - pg_cron jobs status
  - Inngest reachability

---

### B0.4 — Rate Limiting auf AI-Endpoints

Aktuell: Kein per-User Rate Limit auf AI-Calls. Ein User mit 10 Tabs kann 10× gleichzeitig Tier-3 triggern.

- [ ] Middleware `lib/middleware/rate-limiter.ts` erstellen
  - Basis: Upstash Redis ODER in-memory Map (MVP)
  - Limits: 5 Cover Letter Generates / Minute / User
  - Limits: 3 Company Research Calls / Minute / User
  - Limits: 10 Quote Requests / Minute / User
- [ ] Rate Limiter in `withCreditGate()` integrieren
- [ ] HTTP 429 Response mit `Retry-After` Header
- [ ] `ARCHITECTURE.md` Middleware-Sektion ergänzen

**SaaS-Referenz:** Stripe verwendet Token Bucket, Vercel verwendet Sliding Window. Für MVP reicht Sliding Window.

---

## 🔧 BATCH 1 — Core Flow Completion

> Alle kritischen User Journeys müssen End-to-End funktionieren.

### B1.1 — Quote Service Refactor (aus implementation_plan.md)

**Entscheidung erforderlich VOR Code:**
> Claude Haiku (schnell, ~0.5s, erschließt Branche logisch) vs. Perplexity (langsam, ~3-4s, echte Internet-Zitate)?

**CTO-Empfehlung:** Claude Haiku für Tier-3. Begründung:
- 90% der Nischen-User wollen ein passendes, inspirierendes Zitat — kein Wikipedia-exaktes Zitat
- 3-4s synchrone Latenz im Cover-Letter-Flow ist eine kritische UX-Schwelle
- Perplexity-Budget besser für Company Research aufheben

**Implementierung (nach Go-Entscheidung):**
- [ ] FEATURE_COMPAT_MATRIX.md konsultieren (PFLICHT vor Code)
- [ ] `CATEGORY_KEYWORDS` Dictionary erweitern (Video, Creator, Filmmaker, Content, etc.)
- [ ] `inferCategory(jobTitle, requirements[])` rewriten (kontextuell, nicht Wort-für-Wort)
- [ ] `generateAiQuoteFallback(ctx)` implementieren mit Claude Haiku
  - [ ] `pii-sanitizer.ts` VOR dem AI-Call aufrufen (DSGVO Art. 28)
  - [ ] `withCreditGate()` wrapper (Kosten-Kontrolle)
  - [ ] Ergebnis in `generation_logs` schreiben (Tier-3 Tracking)
- [ ] Loading-State im Frontend für 2-4s Latenz (i18n: de/en/es)
- [ ] Migration falls Quote-Cache Spalte neu: `supabase/migrations/` + `schema.sql` + `ARCHITECTURE.md`

### B1.2 — Stripe Credit Gate auf allen AI-Endpoints

Stripe Monetization V1 ist live (2026-04-01). Aber: Sind alle AI-Calls wirklich credit-gated?

- [ ] Audit aller API Routes mit AI-Calls:
  - [ ] `/api/cover-letter/generate` ✅ (vermutlich vorhanden)
  - [ ] `/api/cover-letter/critique` — verifizieren
  - [x] ~~`/api/cover-letter/kill-fluff`~~ — **archiviert 2026-04-24** (0 Caller, → `app/_archive/kill-fluff-route.ts`)  
  - [ ] `/api/cover-letter/quotes` — verifizieren (Tier-3!)
  - [ ] `/api/cv/match` — verifizieren
  - [ ] `/api/coaching/session` — verifizieren
  - [ ] `/api/certificates/generate` — verifizieren
  - [ ] `/api/video/scripts/generate` — verifizieren
- [ ] Jede nicht-gecreditete Route: `withCreditGate()` wrapper hinzufügen
- [ ] Credit Cost pro Operation dokumentieren in `ARCHITECTURE.md`

### B1.3 — Inngest Job Monitoring

Aktuell: 90s Frontend-Timeout, aber kein Dashboard-sichtbares Stale-Detection.

- [ ] Stale-Job-Detection für alle 3 Inngest Functions (generate-certificates, analyze-cv-match, extract-job)
  - Threshold: 5 Minuten (laut CLAUDE.md §6 bekannte Logik)
  - GET-Endpoints geben `{ status: "failed", reason: "stale" }` zurück (kein DB-Write)
- [ ] Admin-sichtbarer Inngest Status in `/api/admin/cost-report`
- [ ] Zwei Terminal-Prozesse in README dokumentieren (npm run dev + inngest-cli)

---

## 🔒 BATCH 2 — Security & Compliance Hardening

> Kein Production Launch ohne diesen Batch.

### B2.1 — RLS Audit (Vollständig)

MASTER_PLAN.md listet RLS-Verify als offen. Das ist kein optionales Nice-to-have.

- [ ] Systematischer RLS-Test für ALLE user_id-Tabellen:
  ```sql
  -- Test Pattern: User A darf User B's Daten nicht sehen
  -- Für jede Tabelle:
  SELECT * FROM {table} WHERE user_id = 'other_user_id'; -- Muss 0 Rows zurückgeben
  ```
- [ ] Tabellen die RLS benötigen (aus ARCHITECTURE.md):
  - user_profiles, user_settings, consent_history, documents
  - job_queue, saved_job_searches, company_research, application_history
  - generation_logs, validation_logs, job_certificates
  - tasks, pomodoro_sessions, mood_checkins, daily_energy
  - coaching_sessions, video_approaches, video_scripts
  - community_posts (öffentlich lesbar, nur eigene schreibbar)
- [ ] Ergebnis dokumentieren in `docs/SICHERHEITSARCHITEKTUR.md` §3
- [ ] SICHERHEITSARCHITEKTUR.md §3 SESSION CONTRACT updaten für neue Tabellen

### B2.2 — Consent Withdrawal Flow

MASTER_PLAN.md §9.3 listet "Consent Withdrawal Flow" als offen.

- [ ] `DELETE /api/consent/withdraw` implementieren
- [ ] Flow: User widerruft → `consent_history` Eintrag → cascade: AI-Processing stoppen
- [ ] DSGVO Art. 7(3): Widerruf muss so einfach sein wie Erteilung
- [ ] Link in `/dashboard/security` und in Privacy Policy

### B2.3 — API Key Rotation Strategy

- [ ] Dokumentieren: Wie werden API Keys rotiert? (Anthropic, OpenAI, SerpAPI, Perplexity, Stripe)
- [ ] Vercel Environment Variables: `NEXT_PUBLIC_` prefix Audit (keine Secrets public!)
- [ ] Emergency Rotation Runbook: `docs/RUNBOOK_KEY_ROTATION.md`

### B2.4 — Admin Route Protection

`/api/admin/cost-report` erfordert "Admin Secret". 

- [ ] Verify: Ist der Admin-Check robust (constant-time comparison, nicht einfaches `===`)?
- [ ] Brute-Force-Schutz: Max 5 Versuche / IP / Stunde
- [ ] Logging aller Admin-Zugriffe

---

## 📊 BATCH 3 — Observability & Reliability

> "You can't improve what you can't measure." — Was kein Monitoring hat, läuft blind.

### B3.1 — Error Tracking (Sentry oder ähnliches)

Aktuell: Keine Fehler-Aggregation in Production.

- [ ] Sentry einbinden (Free Tier reicht für Start)
  ```typescript
  // next.config.js: withSentryConfig()
  // Sentry.init({ dsn: process.env.SENTRY_DSN, environment: process.env.NODE_ENV })
  ```
- [ ] Wichtig: PII-Scrubbing in Sentry konfigurieren (DSGVO!)
  ```typescript
  beforeSend(event) {
    // Entferne email, name, phone aus Event-Data
    return sanitizeSentryEvent(event);
  }
  ```
- [ ] Alerts für: 5xx Errors, AI-API Fehler, Zahlungsfehler

### B3.2 — Structured Logging

- [ ] Logging-Standard definieren: `{ level, timestamp, userId_hash, route, durationMs, error? }`
- [ ] Kein Klarnamen in Logs (userId_hash statt userId)
- [ ] AI-Call Logging: Model, Tokens, Cost, Latency, Success/Fail
- [ ] Vercel Log Drains aktivieren (falls Vercel Pro)

### B3.3 — Cost Alerts

- [ ] `ANTHROPIC_MONTHLY_BUDGET` Environment Variable
- [ ] Täglicher pg_cron: Wenn AI-Kosten > 80% Budget → Slack/E-Mail Alert
- [ ] `/api/admin/cost-report` erweitern: Trend (today vs. 7d avg)

### B3.4 — Uptime Monitoring

- [ ] UptimeRobot oder Vercel Monitoring auf `/api/health`
- [ ] Alert bei Downtime > 2 Minuten
- [ ] Status Page: Auch intern (Notion) reicht für V1

---

## ✅ BATCH 4 — Quality Gates

> Ohne Tests kein Deploy-Vertrauen. Erfolgreiche SaaS deployen täglich — weil Tests sie schützen.

**Strategie:** Nicht alles testen. Die kritischen Pfade testen.

### B4.1 — Critical Path Tests (Pflicht vor Launch)

Priorisierung nach Impact:

**P0 — Darf nie kaputt sein:**
- [ ] Cover Letter Generation (End-to-End): Input → Claude → Output vorhanden
- [ ] Stripe Checkout: User kauft Credits → Credits erscheinen im Dashboard
- [ ] DSGVO Consent: Consent wird korrekt gespeichert
- [ ] Auth: Login/Logout funktioniert, RLS greift

**P1 — Wichtig für Core-Flow:**
- [ ] Document Upload: PDF hochladen → Text extrahiert → in DB
- [ ] Company Research: URL eingeben → Perplexity antwortet → gecacht
- [ ] Quote Service Tier 1+2: DB-Lookup liefert Ergebnis
- [ ] Quote Service Tier 3: Fallback liefert Ergebnis (Mock AI)

**P2 — Regression-Schutz:**
- [ ] Double-Apply Prevention: Gleicher Job-URL → abgelehnt
- [ ] PII Sanitizer: Test-String mit E-Mail → E-Mail entfernt
- [ ] Credit Gate: 0 Credits → 402 Response

### B4.2 — Test Setup

- [ ] Vitest (Unit) + Playwright (E2E) einrichten
- [ ] Test-Environment: Separate Supabase-Project (nicht Production-DB!)
- [ ] CI: GitHub Actions auf Pull Requests (kein Merge ohne grüne Tests)
- [ ] Mock-Strategie: AI-Calls in Tests immer mocken (Kosten + Determinismus)

### B4.3 — Manual QA Checklist (Vor jedem Production Deploy)

```markdown
## Deploy QA Checklist
- [ ] npm run build — 0 TypeScript Errors
- [ ] Alle DB Migrations applied (supabase db push)
- [ ] RLS Policies enabled und getestet
- [ ] Keine console.log mit PII
- [ ] FEATURE_COMPAT_MATRIX.md konsultiert
- [ ] Visual Check: Dashboard in Chrome (Desktop 1280px + Mobile 375px)
- [ ] Cover Letter Flow: 1× komplett durchgeführt
- [ ] Stripe: 1× Test-Zahlung durchgeführt (Stripe Test Mode)
- [ ] Health Endpoint: /api/health gibt 200 zurück
- [ ] i18n: Neue Strings in de + en + es vorhanden
```

---

## 🚀 BATCH 5 — Performance & Polish

> Nur nach Batch 0-4. Performance ohne Stabilität ist Kosmetik.

### B5.1 — Database Performance

- [ ] EXPLAIN ANALYZE auf die 5 häufigsten Queries
- [ ] Index Review: Alle Foreign Keys indexiert?
- [ ] `job_queue` Partitionierung prüfen (bei > 100k Rows)
- [ ] `company_research` TTL-Cleanup: Verifier dass pg_cron läuft

### B5.2 — AI Cost Optimization

- [ ] Model Router Audit: Werden tatsächlich Haiku/Sonnet korrekt geroutet?
- [ ] Cover Letter Token Usage: Durchschnitt pro Generation messen
- [ ] Company Research Cache Hit Rate: Ziel > 60%
- [ ] Batch-Anfragen prüfen: Können parallele Calls zusammengefasst werden?

### B5.3 — Frontend Performance

- [ ] Next.js Bundle Analyzer: `npx @next/bundle-analyzer`
- [ ] Framer Motion: Nur Komponenten importieren, nicht das gesamte Paket
- [ ] Images: WebP, lazy loading, korrekte Dimensions
- [ ] API Routes: Response-Caching wo möglich (`Cache-Control` Header)

### B5.4 — Mobile Experience

- [ ] Dashboard bei 375px (iPhone SE) verifizieren
- [ ] Job Queue auf Mobile: Horizontal Scroll oder Card View?
- [ ] Cover Letter Wizard auf Mobile: Touch-Targets ≥ 44px
- [ ] Framer Motion: `prefers-reduced-motion` respected

---

## 📈 BATCH 6 — Growth Features (Post-Launch Backlog)

> Diese Features sind wertvoll — aber erst nach einem stabilen Launch.

### Aus DEFERRED_FEATURES.md (Referenz)
- [ ] Writing Style Embedding Generation (Phase 1.3 — aufgeschoben)
- [ ] CV Optimization Service (Phase 4 — aufgeschoben)
- [ ] Email Notifications (Phase 12.3 — optional)
- [ ] Automated Scraping (Phase 2.2 — Discontinued für MVP)

### Neue Growth Items (CTO-identifiziert)
- [ ] API Versioning: `v1/` prefix für externe Clients (Chrome Extension)
- [ ] Webhook Support: User-Benachrichtigung bei fertiger Cover Letter (Stripe-Pattern)
- [ ] Multi-Language CV Generation (aktuell nur DE/EN/ES Cover Letter)
- [ ] Analytics Dashboard für User (Bewerbungs-Erfolgsrate, Response Rate)
- [ ] Public Status Page (statuspage.io oder ähnliches)

---

## 📋 PROCESS REGELN (Nicht verhandelbar)

Diese Regeln existieren bereits im CLAUDE.md — hier nochmals als Checkliste verankert:

### Vor jedem Feature
1. **FEATURE_IMPACT_ANALYSIS.md** durchführen → Impact Map → Yannik-Freigabe
2. **FEATURE_COMPAT_MATRIX.md** konsultieren → Forbidden Files checken
3. **Neue DB-Tabelle?** → Migration in `supabase/migrations/` + `schema.sql` + `ARCHITECTURE.md`
4. **Neue API Route?** → `ARCHITECTURE.md` Route-Struktur updaten
5. **User-sichtbare Strings?** → `de + en + es` gleichzeitig in i18n

### Vor jedem Deploy
- Obige Manual QA Checklist abhaken
- Keine offenen TypeScript Errors
- `supabase db push` ausgeführt

### Forbidden Files (nur mit expliziter Freigabe)
- `lib/ai/model-router.ts` (Blast Radius: alle AI-Features)
- `lib/services/cover-letter-generator.ts` (Blast Radius: Core-Feature)
- `supabase/migrations/*` (niemals editieren, nur neue Dateien)

---

## 🎯 EMPFOHLENE REIHENFOLGE (Diese Woche)

```
Tag 1-2:  B0.1 — SCCs/DPAs verfolgen (E-Mails schreiben, nicht warten)
Tag 1-2:  B0.3 — Healthcheck Endpoint (2h Arbeit, hoher Wert)
Tag 2-3:  B0.4 — Rate Limiting (4h, schützt vor Kosten-Spike)
Tag 3-4:  B0.2 — Core APIs fertigstellen (Document Upload, User Profile)
Tag 4-5:  B1.2 — Credit Gate Audit auf allen AI-Endpoints
Tag 5:    B2.1 — RLS Audit (1× systematisch, dann abgehakt)
---
Nächste Woche:
            B3.1 — Sentry einbinden
            B4.1 — P0 Tests (Cover Letter + Stripe + Auth)
            B1.1 — Quote Service Refactor (nach Go-Entscheidung)
```

---

## 📊 LAUNCH READINESS SCORECARD

| Kategorie | Status | Ziel |
|-----------|--------|------|
| Core APIs (B0.2) | 🔴 Offen | ✅ Grün |
| DSGVO SCCs (B0.1) | 🟡 In Progress | ✅ Grün |
| Rate Limiting (B0.4) | 🔴 Fehlt | ✅ Grün |
| RLS Audit (B2.1) | 🔴 Offen | ✅ Grün |
| Healthcheck (B0.3) | 🔴 Fehlt | ✅ Grün |
| Credit Gate Audit (B1.2) | 🟡 Partial | ✅ Grün |
| Error Tracking (B3.1) | 🔴 Fehlt | ✅ Grün |
| P0 Tests (B4.1) | 🔴 0% | ✅ Grün |
| Quote Service (B1.1) | 🟡 Design-Phase | ✅ Grün |
| Stripe Live | ✅ Deployed | ✅ Grün |
| Data Retention | ✅ Deployed | ✅ Grün |
| Cover Letter Flow | ✅ Deployed | ✅ Grün |

**Aktueller Launch-Score: 3/12 grün → Ziel: 12/12 vor Production Launch**
