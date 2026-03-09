---
Version: 5.0.0
Last Updated: 2026-03-09
---

# PATHLY V2.0 - SYSTEM ARCHITECTURE

> [!IMPORTANT]
> **Reduce Complexity!**
> Schreibe das in jede Directive!
> Prüfe jedes mal, wenn du etwas neues machst, ob es wirklich notwendig ist, oder man auch später machen kann.

**Status:** Production-Ready Design
**Last Updated:** 2026-03-09
**Version:** 5.0.0

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
| **Data Harvester** | OpenAI GPT-4o-mini |
| **AI Judge / Analysis** | Anthropic Claude Haiku 4 |
| **AI Generation** | Anthropic Claude Sonnet 4.5 |
| **Company Research** | Perplexity Sonar Pro |

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
- `/api/cover-letter/kill-fluff` (POST — Anti-Fluff-Processing)

#### CV
- `/api/cv/match` (POST → Inngest `cv-match/analyze`)
- `/api/cv/download` (GET — optimierten CV downloaden)

#### Certificates
- `/api/certificates/generate` (POST — Zertifikats-Empfehlungen generieren)
- `/api/certificates/[jobId]` (GET — Zertifikats-Empfehlungen abrufen)

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

## 4. DATENBANKSTRUKTUR

**Autoritäre Quelle:** `supabase/migrations/` (das alte `database/migrations/` ist veraltet).
**Referenz-Snapshot:** `database/schema.sql` (Version 4.0, Stand 2026-03-09).

### Kern-Tabellen:
- `auth.users` (Supabase Auth)
- `user_profiles` (PII-Verschlüsselung, CV Structured Data, Preferences)
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
- `generation_logs` (AI Audit: Token usage & Scores)
- `validation_logs` (Cover Letter Validation Audit)
- `job_certificates` (KI-generierte Zertifikats-Empfehlungen)
- `tasks` (Timeblocking + Focus Mode, source: manual/pulse/coaching)
- `pomodoro_sessions` (Pomodoro Tracking + Heatmap View)
- `mood_checkins` (Stimmungs-Tracking)
- `daily_energy` (Energie-Tracking)
- `daily_briefings` (Tägliche Briefing-Nachrichten)
- `coaching_sessions` (Interview-Training Sessions)
- `community_profiles`, `community_posts`, `community_comments`, `community_upvotes`
- `volunteering_opportunities`, `volunteering_bookmarks`, `volunteering_votes`
- `schema_version` (Interne Versionierung)

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
