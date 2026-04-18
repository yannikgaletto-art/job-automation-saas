---
Version: 5.2.0
Last Updated: 2026-04-18
---

# PATHLY V2.0 - SYSTEM ARCHITECTURE

> [!IMPORTANT]
> **Reduce Complexity!**
> Schreibe das in jede Directive!
> Prüfe jedes mal, wenn du etwas neues machst, ob es wirklich notwendig ist, oder man auch später machen kann.

**Status:** Production-Ready Design
**Last Updated:** 2026-04-18
**Version:** 5.2.0

---

## 1. TECH STACK

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 15 App Router |
| **Language** | TypeScript |
| **Backend & Base** | Supabase (Auth + DB) |
| **UI** | Tailwind CSS + shadcn/ui |
| **Motion** | Framer Motion (→ `docs/MOTION_PRINCIPLES.md`) |
| **Queue** | Inngest (Background Jobs) |
| **Job Search** | SerpAPI |
| **Deep Scraping** | Firecrawl |
| **Data Harvester** | Mistral Small 4 (EU-native) |
| **AI Judge / Analysis** | Anthropic Claude Haiku 4.5 |
| **AI Generation** | Anthropic Claude Sonnet 4.5 |
| **Company Research** | Perplexity Sonar Pro |
| **Payments** | Stripe (Checkout, Webhooks, Portal) |
| **Rate Limiting** | Upstash Redis (EU) |
| **Analytics** | PostHog (EU, DSGVO) |
| **Error Monitoring** | Sentry (PII gestrippt) |
| **AI Observability** | Helicone (⏸️ DPA pending) |

---

## 2. AKTUELLE ROUTE-STRUKTUR

### Public Routes
- `/` (Landing Page)
- `/login` (Authentifizierung)
- `/signup` (Registrierung)
- `/onboarding` (Initiale Einrichtung)

### Dashboard (`/dashboard`)
- `/dashboard` (Today's Goals / Übersicht — Pulse Board, Kalender, Drag-and-Drop Tasks)
- `/dashboard/analytics` (Auswertungen & Statistiken, Pomodoro Heatmap)
- `/dashboard/coaching` (Interview-Training: Sessions, Analyse, Empfehlungen)
- `/dashboard/community` (Skill-Share, Career, Entrepreneurship Boards)
- `/dashboard/extension` (Chrome Extension Infos)
- `/dashboard/job-queue` (Verwaltung von Jobs & Bewerbungen — Workflow-Steps)
- `/dashboard/job-search` (Suche nach neuen Jobs via SerpAPI Pipeline)
- `/dashboard/security` (Sicherheitseinstellungen, Datenexport)
- `/dashboard/settings` (Benutzereinstellungen, CV-Upload, Profil)
- `/dashboard/volunteering` (Ehrenamt-Angebote, Bookmarks, Category Voting)

### Legal Routes (`/legal`)
- `/legal/ai-processing`, `/legal/cookie-policy`, `/legal/privacy-policy`, `/legal/terms-of-service`

### API Routes

#### Jobs & Pipeline
- `/api/jobs/list` (GET — alle Jobs des Users)
- `/api/jobs/ingest` (POST — manuelles Hinzufügen eines Jobs)
- `/api/jobs/import` (POST — Browser Extension Job-Import, Bearer Auth, source: 'extension')
- `/api/jobs/extract` (POST → Inngest `job/extract`)
- `/api/jobs/enrich` (POST — Company Research Trigger)
- `/api/jobs/confirm` (POST — Steckbrief bestätigen)
- `/api/jobs/scrape` (POST — Firecrawl Scraping)
- `/api/jobs/delete` (DELETE — Job entfernen)
- `/api/jobs/mark-applied` (POST — als beworben markieren)
- `/api/jobs/[jobId]/context` (GET/PATCH — Company Website & Cache)
- `/api/jobs/search` (POST — SerpAPI Suche)
- `/api/jobs/search/process` (POST — Deep Pipeline: Firecrawl → Harvester → Judge)
- `/api/jobs/search/suggest-titles` (POST — Job-Titel-Vorschläge)

#### Job Search
- `/api/job-search/query` (POST — AI-gestützte Jobsuche)

#### Cover Letter (8 Endpunkte)
- `/api/cover-letter/generate` (POST — Zentrale Generierung)
- `/api/cover-letter/critique` (POST — Hiring Manager Simulator)
- `/api/cover-letter/setup-data` (GET — Wizard Daten-Enrichment)
- `/api/cover-letter/quotes` (GET — Company Quotes)
- `/api/cover-letter/drafts` (GET/POST — Draft Management)
- `/api/cover-letter/drafts/[id]` (GET/PUT/DELETE — Single Draft)
- `/api/cover-letter/resolve-personas` (POST — Hiring Manager Personas)
- `/api/cover-letter/kill-fluff` (POST — Scan-Only Fluff Detection, no AI call)

#### CV
- `/api/cv/match` (POST → Inngest `cv-match/analyze`)
- `/api/cv/download` (GET — optimierten CV downloaden)

#### Certificates
- `/api/certificates/generate` (POST — Zertifikats-Empfehlungen generieren)
- `/api/certificates/[jobId]` (GET — Zertifikats-Empfehlungen abrufen)

#### Video (8 Endpunkte)
- `/api/video/create-token` (POST — Video Token erstellen)
- `/api/video/status` (GET — Video Status abfragen)
- `/api/video/delete` (POST — Video sicher löschen)
- `/api/video/talking-points` (POST — Talking Points generieren, deprecated by scripts/generate)
- `/api/video/upload` (POST — Video Upload + Confirm)
- `/api/video/scripts` (GET — Script für Job laden)
- `/api/video/scripts/generate` (POST — Script + Keywords via Claude Haiku)
- `/api/video/scripts/save` (PUT — Script speichern + validieren)

#### Coaching (6 Endpunkte)
- `/api/coaching/session` (POST — neue Session starten)
- `/api/coaching/session/[id]/message` (POST — Nachricht senden)
- `/api/coaching/session/[id]/complete` (POST — Session abschließen)
- `/api/coaching/role-research` (POST — Gap-Analyse)
- `/api/coaching/cv-list` (GET — CV-Liste für Session)
- `/api/coaching/transcribe` (POST — Voice-to-Text)

#### Community (5 Endpunkte)
- `/api/community/posts` (GET/POST)
- `/api/community/posts/[id]` (GET/DELETE)
- `/api/community/comments` (POST)
- `/api/community/upvote` (POST/DELETE)
- `/api/community/profile` (GET/POST/PUT)

#### Volunteering (4 Endpunkte)
- `/api/volunteering/opportunities` (GET)
- `/api/volunteering/bookmarks` (GET/POST/PUT/DELETE)
- `/api/volunteering/votes` (GET/POST/DELETE)
- `/api/volunteering/scrape` (POST — Scraping Trigger)

#### Documents & User
- `/api/documents/upload` (POST — CV/Cover Letter Upload)
- `/api/documents/download` (GET — PDF Download)
- `/api/onboarding/complete` (POST)
- `/api/onboarding/status` (GET)
- `/api/consent/record` (POST/GET)
- `/api/settings/[...]` (GET/PUT)
- `/api/security/export` (GET — DSGVO Datenexport)
- `/api/user/export` (GET)

#### Analytics & Misc
- `/api/analytics/[...]` (GET)
- `/api/pulse/generate` (GET — deterministic task suggestions)
- `/api/pomodoro/[...]` (POST/GET)
- `/api/mood/[...]` (POST/GET)
- `/api/briefing/[...]` (GET)
- `/api/tasks/[...]` (GET/POST/PUT/DELETE)
- `/api/admin/cost-report` (GET — Admin Secret required)
- `/api/inngest` (Inngest Event Handler)

---

## 3. SCRAPING PIPELINE (AKTUELL)

1. **Suche (SerpAPI):** Sammelt Basisdaten anhand von Keywords, Standort und Werte-Filtern.
2. **Deep Scrape (Firecrawl):** Markdown-Inhalt der `apply_link`s.
3. **Data Harvester (GPT-4o-mini):** Extrahiert strukturierten Steckbrief aus Markdown.
4. **Scoring Judge (Claude Haiku):** Bewertet Culture Fit und Erfolgschancen.

---

## 3.1 INNGEST RESILIENCE

| Function              | retries | NonRetriableError triggers                     |
|-----------------------|---------|------------------------------------------------|
| `generate-certificates` | 2     | Job not found, 0 recs, Anthropic 400/401/404   |
| `analyze-cv-match`      | 2     | Job/CV not found (via thrown Error)             |
| `extract-job`            | 2     | Job desc missing/too short (via thrown Error)   |

Frontend-Polling hat einen **90s Timeout** — danach wird der Spinner durch einen Fehlertext ersetzt.

---

## 3.2 LOKALE ENTWICKLUNG — INNGEST (PFLICHTNOTIZ)

Zwei separate Terminal-Prozesse sind **IMMER** erforderlich:

1. `npm run dev` → Next.js (Port 3000)
2. `npx inngest-cli@latest dev` → Inngest Dev-Server (Port 8288)

---

## 3.3 CV OPTIMIZER — DATA INTEGRITY GUARANTEE

> Added: 2026-04-17 (Root Cause: corrupted `proposal.translated` in production DB)

**Mandatory pattern** for all code that writes to `job_queue.cv_optimization_proposal`.

### Pipeline Overview
```
cv_structured_data (user_profiles) — immutable source of truth
  ↓
translateCvIfNeeded()         [lib/services/cv-translator.ts]
  → PII Restore after AI     ← MANDATORY (AI may drop fields it was told not to translate)
  ↓
pruneForOptimizer()            [lib/utils/cv-payload-pruner.ts]
  → Deep Clone (never mutate original)
  → Strips PII for AI prompt (DSGVO Art. 25)
  ↓
Claude Sonnet AI Optimization
  ↓
applyCvChanges()               [app/api/cv/optimize/route.ts]
  ↓
INTEGRITY GUARD               ← MANDATORY before DB write
  → Restore PII from cv_structured_data (email, phone, location, linkedin, website, name)
  → Restore structures that must not shrink (languages, certifications)
  → Guard: if experience/education < 50% of original → restore + warn log
  ↓
proposal = { translated: safeTranslated, optimized, changes } → DB
```

### Rules
1. **`pruneForOptimizer()` only strips for AI prompt** — never stored. Stored `translated` must have full PII.
2. **`translatedCv` is NOT the storage object** — always create `safeTranslated = JSON.parse(JSON.stringify(translatedCv))` before the Integrity Guard.
3. **Source of truth** = `cv_structured_data` from the request body (loaded from `user_profiles`, RLS-scoped).
4. **Frontend Layout-Fix** must send raw `cvData` (from `user_profiles`), never display-filtered data.
5. **cv-merger.ts `applyOptimizations()`** must support entity-level removes (parity with backend `applyCvChanges()`).

### Key Files
| File | Role |
|------|------|
| `app/api/cv/optimize/route.ts` | Integrity Guard (lines 610-653) |
| `lib/services/cv-translator.ts` | PII + Structure Restore (lines 172-213) |
| `lib/utils/cv-payload-pruner.ts` | AI-only pruning — `certifications` (not `certificates`) |
| `lib/utils/cv-merger.ts` | Frontend apply logic — bullets + entity-level removes |
| `components/cv-optimizer/OptimizerWizard.tsx` | Layout-Fix sends `cvData` only |

---



## 4. DATENBANKSTRUKTUR

**Autoritäre Quelle:** `supabase/migrations/` (das alte `database/migrations/` ist veraltet).
**Referenz-Snapshot:** `database/schema.sql` (Version 4.0, Stand 2026-03-09).

### Kern-Tabellen:
- `auth.users` (Supabase Auth)
- `user_profiles` (PII-Verschlüsselung, CV Structured Data, Preferences, Mood Check-in: `checkin_skip_streak`, `show_checkin`)
- `user_settings` (Onboarding Status, Active CV, LinkedIn/Target Role)
- `consent_history` (DSGVO Art. 7 Zustimmungen)
- `documents` (CVs & Anschreiben, PII als JSONB)
- `auto_search_configs` (Konfiguration für automatisierte Jobsuche)
- `search_trigger_queue` (Inngest/Cron Steuerung)
- `job_queue` (Zentrale Job-Tabelle: Steckbrief, Pipeline, Judge-Scores)
- `user_values` (Soft-Filter für Job Matching)
- `saved_job_searches` (Persistierte Suchergebnisse)
- `company_research` (Perplexity-Cache für Unternehmens-Analysen)
- `application_history` (Manuelles & Auto Tracking)
- `form_selectors` (Lernsystem für Bewerbungsformulare)
- `generation_logs` (AI Audit: Token usage & Scores — `generated_text` nullable + cleared by Phase 1, write-path NULL'd by Phase 2. `content_hash` for audit.)
- `validation_logs` (Cover Letter Validation Audit)
- `job_certificates` (KI-generierte Zertifikats-Empfehlungen)
- `tasks` (Timeblocking + Focus Mode, source: manual/pulse/coaching)
- `pomodoro_sessions` (Pomodoro Tracking + Heatmap View)
- `mood_checkins` (Stimmungs-Tracking)
- `daily_energy` (Energie-Tracking)
- `daily_briefings` (Tägliche Briefing-Nachrichten)
- `coaching_sessions` (Interview-Training Sessions — 90d Anonymisierung, 180d Löschung via pg_cron)
- `community_profiles`, `community_posts`, `community_comments`, `community_upvotes`
- `volunteering_opportunities`, `volunteering_bookmarks`, `volunteering_votes`
- `video_approaches` (Video-Token, Upload-Status, Expiry)
- `video_scripts` (Script Studio: Blocks, Mode, Keywords)
- `script_block_templates` (System- und Custom-Blockvorlagen)
- `user_credits` (Credit-System: Plan, Credits, Coaching/Search Quotas, Stripe IDs — Beta-Defaults: 15/5/10)
- `credit_events` (Audit Trail: Debits, Refunds, Topups, Resets — DSGVO Art. 15)
- `processed_stripe_events` (Webhook-Idempotenz: Stripe Event-Dedup)
- `schema_version` (Interne Versionierung)

---

## 4.1 DATA RETENTION POLICIES (DSGVO — Migrations 20260319)

**Phase 1 — Datenbank-Härtung (deployed ✅):**

| pg_cron Job | Schedule | Aktion | Scope |
|---|---|---|---|
| `anonymize-coaching-daily` | 03:00 UTC täglich | 90d: `conversation_history → '[]'`, `coaching_dossier → NULL`. 180d: DELETE. | Nur `completed`/`abandoned` Sessions |
| `cleanup-serpapi-weekly` | 04:00 UTC montags | `serpapi_raw = NULL` nach 30 Tagen | Nur Terminal-States (`submitted`/`rejected`/`archived`) |
| `cleanup-firecrawl-weekly` | 05:00 UTC dienstags | `firecrawl_markdown = NULL` nach 14 Tagen | Nur Terminal-States |

**Phase 2 — App-Code-Härtung:**

- `lib/services/pii-sanitizer.ts` — Standalone PII-Pseudonymisierung (de/en/es) vor Claude-API-Calls (DSGVO Art. 28)
- 5 `generated_text` Write-Pfade auf NULL umgestellt (coaching-service, coaching-report, video-scripts, video-talking-points)
- `content_hash` (SHA256) für Audit ohne Klartext

**Phase 3 — Audit-Trail + Privacy Policy:**

- `quality_summary` JSONB in `generation_logs` befüllt (`pii_flags`, `sanitized` boolean)
- Privacy Policy: Azure DI als Sub-Processor, Pseudonymisierungs-Hinweis, Coaching-Retention

---

## 4.2 LEGAL — DRITTLANDTRANSFER STATUS (Art. 46 DSGVO)
> Last Updated: 2026-04-13

| Anbieter | SCCs | DPA | Zero Data Retention | Status |
|---|---|---|---|---|
| Anthropic | ⬜ Angefordert | ⬜ Pending | N/A | 🟡 In Progress |
| OpenAI | ✅ Standard ToS | ⬜ Pending | ⬜ Aktivieren | 🟡 In Progress |
| Azure | ✅ Enterprise Agreement | ✅ Inkludiert | N/A (EU Region) | ✅ Compliant |
| SerpAPI | ⬜ Angefordert | ⬜ Pending | N/A | 🟡 In Progress |
| Perplexity | ⬜ Angefordert | ⬜ Pending | N/A | 🟡 In Progress |
| Stripe | ✅ EU-SCCs + DPA | ⬜ Anfordern | N/A | 🟡 In Progress |
| Sentry | ✅ EU-Ingest | ⬜ Pending | PII gestrippt | 🟡 In Progress |
| Mistral | N/A (EU-native 🇫🇷) | ✅ Inkludiert | N/A | ✅ Compliant |
| PostHog | N/A (EU 🇪🇺) | ✅ DPA verfügbar | N/A | ✅ Compliant |
| Upstash | N/A (EU wählbar) | ✅ EU-Region | N/A | ✅ Compliant |
| Inngest | ⬜ Angefordert | ⬜ Pending | Nur IDs | 🟡 In Progress |

---

## 5. AGENT-DIREKTIVEN

Alle Verhaltensregeln befinden sich in `directives/`.

**Wichtigste Direktiven:**
- `MASTER_PROMPT_TEMPLATE.md`: Template für neue Agent-Prompts.
- `FEATURE_COMPAT_MATRIX.md`: Cross-Feature-Ownership (PFLICHT).
- `FEATURE_IMPACT_ANALYSIS.md`: Impact Map vor neuem Feature (PFLICHT).
- `company_research.md`: Aktuelle Company Research Directive.
- `cover_letter_generation.md`: KI-Schreibprozess für Cover Letters.
- `job_discovery.md`: KI-Job-Scraping und Pre-Selection.
