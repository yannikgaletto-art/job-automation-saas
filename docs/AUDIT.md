# PATHLY V2.0 — VOLLSTÄNDIGER BESTANDSAUDIT

**Datum:** 2026-02-24  
**Erstellt von:** Senior Engineer (Read-Only Audit)  
**Scope:** Gesamtes Repository `yannikgaletto-art/job-automation-saas`  
**Kein Code wurde geändert.**

---

## ABSCHNITT 1 — ROOT-LEVEL DATEIEN (Nicht-Standard)

Folgende Standard-Konfigurationsdateien wurden **nicht** auditiert (gelten als ⛔️ NIEMALS LÖSCHEN):
`package.json`, `tsconfig.json`, `next.config.js`, `tailwind.config.ts`, `.gitignore`, `.env.example`, `postcss.config.js`, `jest.config.js`, `middleware.ts`, `README.md`, `CLAUDE.md`, `AGENTS.md`, `ARCHITECTURE.md`, `package-lock.json`, `.env.local`, `next-env.d.ts`, `tsconfig.tsbuildinfo`

### Nicht-Standard Root-Dateien

| Datei | Wird irgendwo importiert? | Wird sie von localhost genutzt? | Letzter Commit (Datum) | Einschätzung |
|-------|--------------------------|--------------------------------|------------------------|--------------|
| `components.json` | Nein (wird von `npx shadcn` CLI gelesen) | Nein (Build-Tool-Konfiguration) | 2026-02-15 | ⛔️ NIEMALS LÖSCHEN — shadcn/ui Config |
| `empty-module.js` | Ja — `next.config.js` Zeile 18-19 (webpack alias für `canvas`, `encoding`) | Ja (Build-kritisch) | 2026-02-22 | 🟢 AKTIV — Build-kritisch, nicht anfassen |
| `next.d.ts` | Nein (TypeScript Declaration, wird vom Compiler erkannt) | Ja (erweitert NextConfig Types für `serverActions.bodySizeLimit`) | Kein eigener Commit | 🟡 UNKLAR — Möglicherweise durch neuere Next.js-Version obsolet geworden |
| `.mcp.json` | Nein (MCP Server-Konfiguration für Supabase) | Nein | Kein eigener Commit | 🟡 UNKLAR — Wird von Claude Code IDE gelesen, nicht vom Projekt selbst |
| `.next_dev_log.txt` | Nein | Nein (1.3 MB Dev-Server-Logdatei) | Kein eigener Commit | 🔴 VERMUTLICH TOT — Automatisch generiertes Logfile, 1.3 MB groß |
| `delete_dummies.ts` | Nein | Nein | Kein eigener Commit | 🔴 VERMUTLICH TOT — Einmaliges Script zum Löschen von Testdaten (Stripe, Tesla, N26) |
| `get-db.ts` | Nein | Nein | 2026-02-20 | 🔴 VERMUTLICH TOT — Ad-hoc Debug-Script, liest letzten `job_queue` Eintrag |
| `query_db.js` | Nein | Nein | 2026-02-24 | 🔴 VERMUTLICH TOT — Ad-hoc Script, sucht nach Roboyo in `job_queue` |
| `test-ingest.js` | Nein | Nein | Kein eigener Commit | 🔴 VERMUTLICH TOT — Test-Script für `/api/jobs/ingest` Endpoint |
| `test-jobs.ts` | Nein | Nein | 2026-02-20 | 🔴 VERMUTLICH TOT — Debug-Script, listet 5 Jobs aus `job_queue` |
| `test_apis.py` | Nein | Nein | Kein eigener Commit | 🔴 VERMUTLICH TOT — Python-Testskript, Projekt ist TypeScript/Next.js |
| `test_env.py` | Nein | Nein | Kein eigener Commit | 🔴 VERMUTLICH TOT — Python-Skript zum Testen von Umgebungsvariablen |
| `test_query.sql` | Nein | Nein | 2026-02-24 | 🔴 VERMUTLICH TOT — Einzeilige SQL-Query |
| `sql-steckbrief.md` | Nein | Nein | 2026-02-20 | 🔴 VERMUTLICH TOT — Einmalige SQL-Migration-Notiz, Migration existiert bereits als `013_add_steckbrief_columns.sql` |
| `sql-steckbrief.txt` | Nein | Nein | 2026-02-20 | 🔴 VERMUTLICH TOT — Duplikat von `sql-steckbrief.md` in Textformat |
| `BRIEFING-REVIEW.md` | Nein | Nein | 2026-02-20 | 🟡 UNKLAR — Handover-Dokument für Agenten-Wechsel. Historisch wertvoll, aber veraltet |
| `FLUID_MOTION_COMPLETE.md` | Nein | Nein | 2026-02-10 | 🔴 VERMUTLICH TOT — Completion Report für Motion-Rebuild, rein historisch |
| `Kalender-Task-Sync.md` | Nein | Nein | 2026-02-24 | 🟡 UNKLAR — Detaillierte Feature-Spezifikation, noch nicht implementiert. Gehört besser nach `docs/` oder `directives/` |
| `mission.md` | Nein | Nein | 2026-02-11 | 🟢 AKTIV — Produkt-Mission Statement, strategisches Dokument |
| `stats.md` | Nein | Nein | 2026-02-20 | 🟡 UNKLAR — Metrik-Template, alle Werte noch auf 0/TBD. Kein aktueller Nutzen |
| `QUALITY_REPORT.md` | Nein | Nein | 2026-02-15 | 🟡 UNKLAR — QA Report von Phase 1-3, teilweise veraltet (z.B. Issues wurden gefixt) |

---

## ABSCHNITT 2 — DOKUMENTATIONS-DATEIEN (.md)

### Root-Level Markdown

| Datei | Beschreibung (1 Satz) | Referenziert von CLAUDE.md/AGENTS.md? | Inhalt noch aktuell? | Einschätzung |
|-------|----------------------|--------------------------------------|----------------------|--------------|
| `CLAUDE.md` | Developer Operating Manual — Regeln, Tech Stack, Patterns. | Ist selbst die zentrale Referenz | Weitgehend ja, Version 2.1 (2026-02-13) | 🟢 AKTIV |
| `AGENTS.md` | Agent-Übersicht mit Status pro Agent. | Von CLAUDE.md nicht explizit referenziert | Veraltet — zeigt nur 6 Agents, viele als "Planned" die bereits implementiert sind | 🟡 UNKLAR |
| `ARCHITECTURE.md` | Vollständige Systemarchitektur (1129 Zeilen, v3.1.1). | Ja — CLAUDE.md referenziert `/docs/ARCHITECTURE.md` (aber Datei liegt im Root!) | Teilweise veraltet — referenziert `company_slug` (entfernt), Python-Code (Projekt ist TS), Scraper-System (wurde entfernt laut Commit) | 🟡 UNKLAR |
| `README.md` | Projekt-Readme mit Setup-Anleitung. | Nein | Nicht geprüft (Standard-Datei) | 🟢 AKTIV |
| `mission.md` | Produktvision, ICP, Prinzipien. | Nein | Ja, strategisches Grundlagendokument | 🟢 AKTIV |
| `BRIEFING-REVIEW.md` | Handover-Dokument für Agent-Wechsel (2026-02-20). | Nein | Überholt — beschreibt Stand vor 4 Tagen, mehrere Änderungen seitdem | 🟡 UNKLAR |
| `FLUID_MOTION_COMPLETE.md` | Completion Report: Framer Motion Rebuild. | Nein | Historisch — 2026-02-10, beschreibt erledigtes Feature | 🔴 VERMUTLICH TOT |
| `Kalender-Task-Sync.md` | Feature-Spec: Timeblocking + Pomodoro (572 Zeilen). | Nein | Aktuell — frisch erstellt (2026-02-24), aber noch nicht implementiert | 🟡 UNKLAR |
| `QUALITY_REPORT.md` | QA-Audit Report von Phase 1-3. | Nein | Teilweise veraltet (Bugs gefixt, Schema geändert) | 🟡 UNKLAR |
| `stats.md` | Metrik-Template, komplett leer (alle 0). | Nein | Veraltet — kein einziger Wert gefüllt | 🟡 UNKLAR |

### docs/ Verzeichnis

| Datei | Beschreibung (1 Satz) | Referenziert? | Inhalt noch aktuell? | Einschätzung |
|-------|----------------------|--------------|----------------------|--------------|
| `docs/MASTER_PLAN.md` | Master-Plan mit Phasen-Übersicht. | Nicht direkt | 🟡 Status unklar | 🟡 UNKLAR |
| `docs/DESIGN_SYSTEM.md` | UI/UX Design Tokens, Farben, Typografie. | Ja (BRIEFING-REVIEW, FLUID_MOTION) | Wahrscheinlich aktuell | 🟢 AKTIV |
| `docs/DASHBOARD.md` | Dashboard-Beschreibung. | Nein | Kurz (2 KB), vermutlich veraltet | 🟡 UNKLAR |
| `docs/DASHBOARD_NAVIGATION_ARCHITECTURE.md` | Tab-Layout und Navigation (27 KB). | Nein | Kürzlich erstellt/geändert | 🟢 AKTIV |
| `docs/JOB_SEARCH_SPEC.md` | Job-Search Feature-Spezifikation (28 KB). | Nein | Kürzlich erstellt | 🟢 AKTIV |
| `docs/MOTION_IMPLEMENTATION.md` | Framer Motion Implementierungsleitfaden. | Ja (FLUID_MOTION_COMPLETE) | Ja | 🟢 AKTIV |
| `docs/SCRAPING_STRATEGY.md` | Scraping-Strategien (SerpAPI, Firecrawl etc.). | Ja (ARCHITECTURE.md) | 🟡 Scraper wurde teilweise entfernt | 🟡 UNKLAR |
| `docs/CACHE_MANAGEMENT.md` | Company Research Cache (7-Tage TTL). | Nein | Klein (1.7 KB), wahrscheinlich aktuell | 🟢 AKTIV |
| `docs/COVER_LETTER_PHASE_1.md` | Cover Letter Spec Phase 1 (31 KB). | Nein | Historisch — Phase 1 ist abgeschlossen | 🟡 UNKLAR |
| `docs/PATHLY_EXTENSION.md` | Chrome Extension Spec (39 KB). | Nein | 🟡 Extension noch nicht implementiert | 🟡 UNKLAR |
| `docs/BEWERBUNG_TRAINING.md` | Bewerbungstraining-Konzept (44 KB). | Nein | 🟡 Nicht klar ob implementiert | 🟡 UNKLAR |
| `docs/ANALYTICS_HARRIS_VALLEY.md` | Analytics-Dashboard Spec (48 KB). | Nein | Kürzlich hinzugefügt | 🟢 AKTIV |
| `docs/PROGRESSIVE_WORKFLOW_UI.md` | Workflow-UI Spec (6 KB). | Nein | Wahrscheinlich aktuell | 🟢 AKTIV |
| `docs/AGENT_5.1_INTEGRATION_SUMMARY.md` | Integration Summary für Agent 5.1. | Nein | Klein, historisch | 🟡 UNKLAR |
| `docs/vertrieb.md` | Vertriebsstrategie (15 KB). | Nein | 🟡 Business-Dokument | 🟡 UNKLAR |
| `docs/implementation/01_SETUP_DATABASE.md` | DB Setup Anleitung. | Nein | 🟡 | 🟡 UNKLAR |

### directives/ Verzeichnis (30 Dateien)

| Datei | Beschreibung (1 Satz) | Einschätzung |
|-------|----------------------|--------------|
| `MASTER_PROMPT_TEMPLATE.md` | Template für Agent-Prompts. | 🟢 AKTIV |
| `AGENT_1.1_JOB_SCRAPING.md` | Job Scraping Directive (32 KB). | 🟡 UNKLAR — Scraper teilweise entfernt |
| `AGENT_2.1_COMPANY_RESEARCH.md` | Company Research V1. | 🟡 UNKLAR — Duplikat? Siehe AGENT_3.1 |
| `AGENT_2.2_CV_OPTIMIZATION.md` | CV Optimization Directive. | 🟢 AKTIV |
| `AGENT_2.3_QUALITY_JUDGE.md` | Quality Judge Directive. | 🟢 AKTIV |
| `AGENT_2.4_DOUBLE_APPLY.md` | Double-Apply Prevention. | 🟢 AKTIV |
| `AGENT_2.5_QUOTE_AWARE_JUDGE.md` | Quote-Aware Quality Judge. | 🟢 AKTIV |
| `AGENT_3.1_COMPANY_RESEARCH.md` | Company Research V2 (4 KB). | 🟡 UNKLAR — Duplikat von AGENT_2.1? |
| `AGENT_3.2_QUOTE_SUGGESTION.md` | Quote Suggestion. | 🟢 AKTIV |
| `AGENT_3.3_COMPANY_DISPLAY.md` | Company Display Component. | 🟢 AKTIV |
| `AGENT_3.4_CACHE_MANAGEMENT.md` | Cache Management. | 🟢 AKTIV |
| `AGENT_4.1_CV_OPTIMIZATION_SERVICE.md` | CV Optimization Service. | 🟢 AKTIV |
| `AGENT_4.2_CV_DISPLAY.md` | CV Display Component. | 🟢 AKTIV |
| `AGENT_5.1_WRITING_STYLE_ANALYSIS.md` | Writing Style Analysis. | 🟢 AKTIV |
| `AGENT_5.2_COVER_LETTER_FRONTEND.md` | Cover Letter Frontend. | 🟢 AKTIV |
| `AGENT_5.3_COVER_LETTER_VALIDATION.md` | Cover Letter Validation. | 🟢 AKTIV |
| `AGENT_5.4_COVER_LETTER_COMPONENTS.md` | Cover Letter Components. | 🟢 AKTIV |
| `AGENT_5.5_GENERATION_LOGS.md` | Generation Logs. | 🟢 AKTIV |
| `AGENT_6.1_APPLICATION_HISTORY_BACKEND.md` | Application History Backend. | 🟢 AKTIV |
| `AGENT_6.2_APPLICATION_HISTORY_UI.md` | Application History UI. | 🟢 AKTIV |
| `AGENT_8.1_DATABASE_DEPLOYMENT.md` | Database Deployment. | 🟢 AKTIV |
| `AGENT_9.3_CONSENT_MANAGEMENT.md` | Consent Management. | 🟢 AKTIV |
| `AGENT_12.1_LOADING_STATES.md` | Loading States. | 🟢 AKTIV |
| `AGENT_12.2_EMPTY_STATES.md` | Empty States. | 🟢 AKTIV |
| `AGENT_PHASE_1.5_WORKFLOW_FIX.md` | Phase 1.5 Workflow Fix. | 🟡 UNKLAR |
| `DIRECTOR_QUALITY_TESTING.md` | Quality Testing Director. | 🟡 UNKLAR |
| `PHASE_2_EXECUTION_PLAN.md` | Phase 2 Execution Plan. | 🟡 UNKLAR |
| `company_research.md` | Company Research (dritte Version, 8.9 KB). | 🟡 UNKLAR — Duplikat? |
| `cover_letter_generation.md` | Cover Letter Generation. | 🟢 AKTIV |
| `job_discovery.md` | Job Discovery. | 🟢 AKTIV |

### Sonstige Markdown-Dateien

| Datei | Beschreibung (1 Satz) | Einschätzung |
|-------|----------------------|--------------|
| `database/deployment-log.md` | Deployment-Log für DB-Migrationen. | 🟢 AKTIV |
| `components/README.md` | Component-Übersicht. | 🟢 AKTIV |
| `components/motion/README.md` | Motion Components Dokumentation. | 🟢 AKTIV |
| `skills/company_intel_enrichment.md` | Skill-Datei für Company Intel. | 🟡 UNKLAR |

### Besondere Prüfungen

**ARCHITECTURE.md — Stimmt sie mit dem aktuellen /app Ordner überein?**
- ❌ **Nein.** ARCHITECTURE.md referenziert Python-Code (`from perplexity import Client`), das Projekt ist aber vollständig TypeScript.
- ❌ Referenziert `company_slug` in `application_history`, aber Commit-Message sagt "Schema v3.0, using company_name as identifier" — widersprüchlich.
- ❌ Referenziert Scraping-System (SerpAPI → ScraperAPI → Playwright Cascade), aber `scraper system` wurde laut Commit `1a0c1f0` (2026-02-20) entfernt.
- ❌ Referenziert `/components/ApplicationHistoryTable.tsx` — diese Datei existiert nicht in diesem Pfad.
- ❌ Dashboard-Tabs in ARCHITECTURE.md (4 Tabs) stimmen nicht mit `app/dashboard/` überein (hat `analytics`, `job-queue`, `job-search`, `extension`, `settings`, `security`).

**CLAUDE.md — Ist sie der single source of truth?**
- ✅ Ja, für Regeln und Prinzipien.
- ⚠️ Referenziert `/docs/ARCHITECTURE.md` — aber die Datei liegt im Root als `ARCHITECTURE.md`, nicht unter `docs/`.
- ⚠️ Version 2.1, letzte Aktualisierung 2026-02-13 — 11 Tage alt, seitdem gab es erhebliche Änderungen.

**AGENTS.md — Hat sie Inhalte die NICHT in CLAUDE.md stehen?**
- ✅ Ja: Agent-Übersichtstabelle mit Zuständigkeiten und Status. CLAUDE.md enthält diese Zuordnung nicht.
- ⚠️ AGENTS.md ist veraltet: Zeigt nur 6 Agents, markiert mehrere als "Planned" die laut Code bereits implementiert sind (z.B. CV Optimization, Quality Judge).

---

## ABSCHNITT 3 — DOPPELTE / KONKURRIERENDE DATEIEN

### Möglicher Duplikat-Konflikt: Company Research Card vs. Company Intel Card

- **Datei A:** `components/company-research-card.tsx` (11.5 KB) — Company Research Display Component
- **Datei B:** `components/company/company-intel-card.tsx` (in Unterordner) — Company Intelligence Display Component
- **Wird genutzt:** Nur `company-intel-card.tsx` wird importiert (von `app/company-display-demo/page.tsx`). `company-research-card.tsx` hat **null Imports** im gesamten Projekt.
- **Risiko:** Ein Agent könnte die ältere `company-research-card.tsx` bearbeiten, obwohl nur `company-intel-card.tsx` tatsächlich gerendert wird.

---

### Möglicher Duplikat-Konflikt: Company Research Directives (3×)

- **Datei A:** `directives/AGENT_2.1_COMPANY_RESEARCH.md` (8.3 KB) — Company Research Directive v1
- **Datei B:** `directives/AGENT_3.1_COMPANY_RESEARCH.md` (4.2 KB) — Company Research Directive v2
- **Datei C:** `directives/company_research.md` (8.9 KB) — Company Research (unnummeriert)
- **Wird genutzt:** Unklar — Directives werden von Agents gelesen, nicht importiert. Kein klarer Verweis welche die aktuelle ist.
- **Risiko:** Ein Agent liest die falsche Directive und implementiert veraltete Logik.

---

### Möglicher Duplikat-Konflikt: Migrations-Verzeichnisse (2×)

- **Datei A:** `database/migrations/` — 11 Migrationen (003 bis 013)
- **Datei B:** `supabase/migrations/` — 10 Migrationen (011 bis 20260228)
- **Überlappung:** `011_rename_job_queue_company.sql` existiert in **beiden** Verzeichnissen.
- **Wird genutzt:** Unklar — `supabase/migrations/` hat neuere Dateien (20260221+), `database/migrations/` hat die älteren.
- **Risiko:** Widersprüchliche Migrationen, doppelte Ausführung, oder vergessene Migrationen.

---

### Möglicher Duplikat-Konflikt: Root-Level Ad-hoc DB-Scripts (4×)

- **Datei A:** `get-db.ts` — Liest letzten `job_queue` Eintrag mit eigener Supabase-Client-Instanz
- **Datei B:** `query_db.js` — Sucht nach Roboyo in `job_queue` mit eigener Supabase-Client-Instanz
- **Datei C:** `test-jobs.ts` — Listet 5 Jobs aus `job_queue` mit eigener Supabase-Client-Instanz
- **Datei D:** `delete_dummies.ts` — Löscht Stripe/Tesla/N26 Testdaten mit eigener Supabase-Client-Instanz
- **Wird genutzt:** Keine davon. Alle erstellen eigene `createClient()`-Instanzen statt `lib/supabase/server.ts` zu nutzen.
- **Risiko:** Gering — keine davon wird importiert. Aber sie blähen das Repo unnötig auf.

---

### Möglicher Duplikat-Konflikt: sql-steckbrief.md vs sql-steckbrief.txt

- **Datei A:** `sql-steckbrief.md` (304 Bytes) — SQL Migration als Markdown
- **Datei B:** `sql-steckbrief.txt` (269 Bytes) — Identische SQL Migration als Textdatei
- **Wird genutzt:** Keine — Migration existiert bereits als `database/migrations/013_add_steckbrief_columns.sql`.
- **Risiko:** Keines, aber unnötige Duplikate.

---

### Möglicher Duplikat-Konflikt: Test-Scripts in Root vs. scripts/

- **Root:** `test-ingest.js`, `test-jobs.ts`, `test_apis.py`, `test_env.py`, `test_query.sql`
- **scripts/:** `test-db.ts`, `test-cv-optimization.ts`, `test-e2e.ts`, `test-model-router.ts`, `test-parser.ts`, `test-ping.ts`, `test-quote-matcher.ts`, `test_processor.ts`
- **Wird genutzt:** Keine der Root-Test-Dateien wird importiert. scripts/ enthält strukturiertere Test-Scripts.
- **Risiko:** Verwirrung darüber welche Tests aktuell sind.

---

## ABSCHNITT 4 — LOCALHOST-ABGLEICH

Server läuft auf `http://localhost:3000` (npm run dev, seit >7h).

| Route | HTTP Status | Rendert fehlerfrei? | Bemerkung |
|-------|-------------|---------------------|-----------|
| `/` (Landing) | 200 | ✅ Ja | Zeigt "Setup Complete" Health-Check-Seite (Supabase, Database, Clerk Status) — **keine Marketing Landing Page** |
| `/onboarding` | 200 | ✅ Ja | Onboarding Flow Step 1: "Willkommen bei Pathly" |
| `/dashboard` | 200 | ✅ Ja | Dashboard mit "Today's Goals", Kalender, Inbox. Kein Login-Redirect im Dev-Modus |
| `/dashboard/job-search` | 200 | ✅ Ja | Job Search Interface mit "Active Job Searches" |
| `/dashboard/applications` | **404** | ❌ Nein | "This page could not be found." — Route existiert nicht in `app/dashboard/`. Kein `applications/`-Ordner vorhanden |
| `/legal/privacy-policy` | 200 | ✅ Ja | Datenschutzerklärung |
| `/legal/terms-of-service` | 200 | ✅ Ja | AGB |
| `/legal/ai-processing` | 200 | ✅ Ja | AI-Verarbeitungsrichtlinie |
| `/legal/cookie-policy` | 200 | ✅ Ja | Cookie-Richtlinie |

**Hinweis zu `/dashboard/applications`:** Die Route existiert nicht. Das Dashboard hat stattdessen `job-queue`, `job-search`, `analytics`, `extension`, `settings` und `security` als Unter-Routen. Application History ist vermutlich in `job-queue` integriert.

---

## ABSCHNITT 5 — ZUSAMMENFASSUNG & EMPFEHLUNGEN

### 🔴 Kandidaten für Löschung (erst nach menschlicher Freigabe)

| Datei | Begründung |
|-------|-----------|
| `.next_dev_log.txt` | Automatisch generiertes Dev-Server-Logfile (1.3 MB). Wird nirgends referenziert, hat keinen historischen Wert. Sollte in `.gitignore`. |
| `delete_dummies.ts` | Einmaliges Cleanup-Script für Testdaten (Stripe, Tesla, N26). Hat keinen Import, kein Git-Commit und die Testdaten existieren nicht mehr. |
| `get-db.ts` | Ad-hoc Debug-Script zum Lesen der `job_queue`. Erstellt eigene Supabase-Instanz, hat null Imports. Funktionalität über Supabase Dashboard oder `scripts/test-db.ts` verfügbar. |
| `query_db.js` | Einzeiliges Ad-hoc-Script zum Suchen von "Roboyo". Kein Import, obsolet. |
| `test-ingest.js` | Test-Script für `/api/jobs/ingest` Endpoint mit Node.js `http` Modul. Kein Import, kein Commit. |
| `test-jobs.ts` | Debug-Script, listet 5 Jobs. Erstellt eigene Supabase-Instanz. Kein Import. |
| `test_apis.py` | Python-Testskript in einem TypeScript/Next.js Projekt. Kein Import, kein Commit, falsche Sprache. |
| `test_env.py` | Python-Skript zum Testen von Umgebungsvariablen. Falsche Sprache für dieses Projekt. |
| `test_query.sql` | Einzeilige SQL-Query. Kein Import, kein Nutzen im Repo. |
| `sql-steckbrief.md` | Einmalige SQL-Migrations-Notiz. Migration existiert bereits als `database/migrations/013_add_steckbrief_columns.sql`. |
| `sql-steckbrief.txt` | Identisches Duplikat von `sql-steckbrief.md` im Textformat. |
| `FLUID_MOTION_COMPLETE.md` | Completion Report vom 2026-02-10. Rein historisch, beschreibt bereits erledigtes Feature. Keine Referenz von anderen Docs. |
| `components/company-research-card.tsx` | Hat null Imports im gesamten Projekt. Wurde durch `components/company/company-intel-card.tsx` ersetzt. |

### 🟡 Braucht Entscheidung

| Datei | Frage an den Entwickler |
|-------|------------------------|
| `next.d.ts` | Wird die TypeScript-Augmentation für `NextConfig.experimental.serverActions.bodySizeLimit` noch benötigt? Neuere Next.js-Versionen haben diese Option eventuell nativ. |
| `.mcp.json` | Soll die MCP-Server-Konfiguration für Supabase im Repo bleiben oder in `.gitignore`? Sie enthält keine Secrets, aber ist IDE-spezifisch. |
| `BRIEFING-REVIEW.md` | Soll das Handover-Dokument archiviert oder gelöscht werden? Es beschreibt den Stand von vor 4 Tagen und ist durch neuere Änderungen überholt. |
| `Kalender-Task-Sync.md` | Diese 572-Zeilen Feature-Spec liegt im Root. Soll sie nach `docs/` oder `directives/` verschoben werden? Oder ist die Kalender-Feature geplant? |
| `stats.md` | Alle Werte sind 0/TBD seit 2026-02-11. Soll das Template behalten werden für spätere Befüllung, oder ist es obsolet? |
| `QUALITY_REPORT.md` | Der QA Report von 2026-02-15 listet 5 Issues. Welche davon wurden inzwischen gefixt? Soll das Dokument aktualisiert oder archiviert werden? |
| `AGENTS.md` | Die Agent-Übersicht ist veraltet (nur 6 Agents, viele als "Planned" markiert). Soll sie aktualisiert oder durch CLAUDE.md ersetzt werden? |
| `ARCHITECTURE.md` | Die 1129-Zeilen-Architektur ist in mehreren Punkten veraltet (Python-Code, Scraper-System, company_slug). Soll sie überarbeitet werden? |
| `directives/AGENT_2.1_COMPANY_RESEARCH.md` vs `directives/AGENT_3.1_COMPANY_RESEARCH.md` vs `directives/company_research.md` | Drei Dateien zum selben Thema. Welche ist die aktuelle? Können die anderen gelöscht werden? |
| `database/migrations/` vs `supabase/migrations/` | Zwei Migrations-Verzeichnisse mit Überlappung (`011_rename_job_queue_company.sql`). Welches ist die autoritative Quelle? |
| `docs/SCRAPING_STRATEGY.md` | Die Scraping-Strategie referenziert SerpAPI/ScraperAPI/Firecrawl/Playwright, aber das Scraper-System wurde laut Commit entfernt. Ist die Strategie noch relevant? |
| `/dashboard/applications` Route | Diese Route gibt 404. Ist Application History in `/dashboard/job-queue` integriert, oder fehlt hier eine Route? |

### 🟢 Nicht anfassen

**Kern-Konfiguration:**
- `package.json`, `package-lock.json`, `tsconfig.json`, `next.config.js`, `tailwind.config.ts`, `.gitignore`, `.env.local`, `.env.example`, `postcss.config.js`, `jest.config.js`, `middleware.ts`, `next-env.d.ts`, `tsconfig.tsbuildinfo`

**Kern-Dokumentation:**
- `CLAUDE.md` — Developer Operating Manual (Single Source of Truth für Regeln)
- `mission.md` — Produkt-Mission Statement
- `README.md` — Projekt-Readme
- `database/deployment-log.md` — Deployment Log

**Kern-Anwendung:**
- `app/` — Gesamtes App-Verzeichnis (108 Dateien, alle aktiv)
- `components/` — Alle UI-Komponenten (68 Dateien, bis auf `company-research-card.tsx`)
- `lib/` — Services, Supabase Clients, Utils (40 Dateien)
- `database/schema.sql` — Autoritatives DB-Schema
- `store/` — Zustand Stores
- `types/` — TypeScript Types

**Build-kritisch:**
- `components.json` — shadcn/ui CLI Konfiguration
- `empty-module.js` — Webpack-Alias in `next.config.js`

---

*Ende des Audits. Keine Dateien wurden verändert, kein Code wurde modifiziert.*
