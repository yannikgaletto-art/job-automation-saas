---
Version: 4.0.0
Last Updated: 2026-02-24
---

# PATHLY V2.0 - SYSTEM ARCHITECTURE

> [!IMPORTANT]
> **Reduce Complexity!**
> Schreibe das in jede Directive!
> Ich will einen Lean-laufenden MVP haben; du hast die Tendenz alles zu viel zu machen; das ist nicht notwendig und provoziert viele Fehler. Lass uns bei den einfachen Grundstrukturen bleiben, die funktionieren. D.h. prüfe jedes mal, wenn du etwas neues machst, ob es wirklich notwendig ist, oder man auch später machen kann, um das Ziel zu erreichen.

**Status:** Production-Ready Design  
**Last Updated:** 2026-02-24  
**Version:** 4.0.0

---

## 1. TECH STACK

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 14 App Router |
| **Language** | TypeScript |
| **Backend & Base** | Supabase (Auth + DB) |
| **UI** | Tailwind CSS + shadcn/ui |
| **Motion** | Framer Motion (→ `docs/MOTION_PRINCIPLES.md` für Details) |
| **Queue** | Inngest (Background Jobs) |
| **Job Search** | SerpAPI |
| **Deep Scraping** | Firecrawl |
| **Data Harvester** | OpenAI GPT-4o-mini |
| **AI Judge** | Anthropic Claude |

*(Hinweis: Python, Playwright und ScraperAPI werden in dieser Architektur nicht verwendet.)*

---

## 2. AKTUELLE ROUTE-STRUKTUR

Die Anwendung basiert auf dem Next.js App Router (`app/` Verzeichnis):

### Public Routes
- `/` (Landing Page)
- `/login` (Authentifizierung)
- `/signup` (Registrierung)
- `/onboarding` (Initiale Einrichtung)

### Dashboard (`/dashboard`)
- `/dashboard` (Today's Goals / Übersicht)
- `/dashboard/analytics` (Auswertungen & Statistiken)
- `/dashboard/extension` (Chrome Extension Infos)
- `/dashboard/job-queue` (Verwaltung von Jobs & Bewerbungen)
- `/dashboard/job-search` (Suche nach neuen Jobs)
- `/dashboard/security` (Sicherheitseinstellungen)
- `/dashboard/settings` (Benutzereinstellungen)
- `/dashboard/applications` → **⚠️ FEHLT — Route existiert nicht in der Ordnerstruktur!**

### Legal Routes (`/legal`)
- `/legal/ai-processing` (KI-Verarbeitungsrichtlinien)
- `/legal/cookie-policy` (Cookie-Richtlinien)
- `/legal/privacy-policy` (Datenschutzerklärung)
- `/legal/terms-of-service` (AGB)

### Demo & Testing
- `/company-display-demo` (UI Demo für Company Research)
- `/demo` (Allgemeine Component Demo)
- `/template-demo` (UI Demo für Templates)

### API Routes (Internal Auth)
- `/api/cover-letter/generate` (Zentrale Generierung)
- `/api/cover-letter/critique` (Hiring Manager Simulator)
- `/api/cover-letter/setup-data` (Wizard Daten-Enrichment)
- `/api/certificates/generate` (Zertifikats-Empfehlungen generieren — POST)
- `/api/certificates/[jobId]` (Zertifikats-Empfehlungen abrufen — GET)
- `/api/jobs/extract` (Slim Trigger → Inngest `job/extract` — POST)
- `/api/cv/match` (Slim Trigger → Inngest `cv-match/analyze` — POST)

---

## 3. SCRAPING PIPELINE (AKTUELL)

Die Job-Daten-Extraktion ist in `lib/services/job-search-pipeline.ts` als mehrstufiger Prozess definiert:

1. **Suche (SerpAPI):** Sammelt Basisdaten von Jobbörsen anhand von Keywords, Standort und Werte-Filtern.
2. **Deep Scrape (Firecrawl):** Ruft den Markdown-Inhalt der `apply_link`s ab (umgeht LinkedIn URL-Blockaden).
3. **Data Harvester (GPT-4o-mini):** Extrahiert strukturierte JSON-Daten (den "Steckbrief", u.a. Gehalt, Anforderungen, Firmeninfos) aus dem Markdown.
4. **Scoring Judge (Claude):** Bewertet Culture Fit und Erfolgschancen basierend auf dem extrahierten Profil und den persönlichen Werten des Nutzers.

---

## 3.1 INNGEST RESILIENCE

Alle Inngest-Funktionen sind gegen "Silent Hangs" abgesichert:

| Function              | retries | NonRetriableError triggers                     |
|-----------------------|---------|------------------------------------------------|
| `generate-certificates` | 2     | Job not found, 0 recs, Anthropic 400/401/404   |
| `analyze-cv-match`      | 2     | Job/CV not found (via thrown Error)             |
| `extract-job`            | 2     | Job desc missing/too short (via thrown Error)   |

Frontend-Polling (`certificate-kanban-board.tsx`) hat einen **90s Timeout** — danach wird der Spinner durch einen Fehlertext ersetzt.

---

## 4. DATENBANKSTRUKTUR

Das DB-Schema basiert auf PostgreSQL und wird exklusiv über `supabase/migrations/` versioniert (**Klarstellung: `supabase/migrations/` ist das autoritative Migrationsverzeichnis!** Das alte Verzeichnis `database/migrations/` ist veraltet).

### Kern-Tabellen (`database/schema.sql`):
- `auth.users` (Supabase Auth Basis)
- `user_profiles` (Erweitertes Profil via PII-Verschlüsselung, Preferences)
- `consent_history` (Tracking von AGB/DSGVO Zustimmungen)
- `documents` (Verschlüsselte Lebensläufe & Anschreiben, inkl. Writing Style Vector Embeddings)
- `auto_search_configs` (Konfiguration für automatisierte Jobsuche)
- `search_trigger_queue` (Inngest/Cron Job Steuerung für auto_searches)
- `job_queue` (Zentrale Job-Tabelle: Steckbrief-Felder, Generierte Dokumente, Reviews)
- `company_research` (Perplexity Caching für tiefergehende Unternehmens-Analysen)
- `application_history` (Manuelles & Auto Tracking. Jobs werden über `company_name` identifiziert, `company_slug` wird operativ nicht mehr genutzt)
- `form_selectors` (Lernsystem für externe Bewerbungsformulare)
- `generation_logs` (AI Audit: Token usage & Scores)
- `job_certificates` (KI-generierte Zertifikats-Empfehlungen pro Job, Kanban-Board)
- `schema_version` (Interne Versionierung)

---

## 5. AGENT-DIREKTIVEN

Alle Verhaltensregeln für Agenten befinden sich im `directives/` Verzeichnis.

**Wichtigste Direktiven:**
- `MASTER_PROMPT_TEMPLATE.md`: Template für neue Agent-Prompts.
- `company_research.md`: **Aktuelle Company Research Directive** (die Versionen `AGENT_2.1_COMPANY_RESEARCH.md` und `AGENT_3.1_COMPANY_RESEARCH.md` sind veraltet/gelöscht).
- `cover_letter_generation.md`: KI-Schreibprozess für Cover Letters.
- `job_discovery.md`: KI-Job-Scraping und Pre-Selection.
- _Zusätzlich exisiteren zahlreiche AGENT_[Phase].[Schritt]_XXX.md Dateien für verschiedene Microservices._
