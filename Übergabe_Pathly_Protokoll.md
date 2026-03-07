# Übergabe & Onboarding Protokoll: Pathly V2.0

Dieses Dokument ist die erste Anlaufstelle für jeden neuen KI-Agenten. Es liefert die essenzielle Orientierung: Wo liegt was, was sind die Regeln, was darf nicht gebrochen werden.

---

## SCHRITT 1: PFLICHTLEKTÜRE (vor jedem Code-Eingriff)

| Datei | Inhalt |
|---|---|
| `CLAUDE.md` | **Visual Standards & UI-Philosophie** — Farbsystem, Tailwind-Patterns, "Extreme Clean" UX-Standard. Immer zuerst lesen, bevor UI angefasst wird. |
| `ARCHITECTURE.md` | **Systemarchitektur** — Next.js 15 App Router, Inngest-Queues, Supabase, API-Schichtung. |
| `docs/SICHERHEITSARCHITEKTUR.md` | **Sicherheits- & Datenschutzregeln** — DSGVO, RLS, User-Auth-Muster. Obligatorisch vor jedem DB/API-Eingriff. |
| `AGENTS.md` | **Agent-Protokoll** — Wie dieser Codebase mit KI-Agenten arbeitet, welche Konventionen gelten. |
| `directives/FEATURE_IMPACT_ANALYSIS.md` | **Pflichtanalyse vor jedem neuen Feature** — Cross-Feature-Abhängigkeiten und Blast-Radius prüfen. |
| `directives/FEATURE_COMPAT_MATRIX.md` | **Kompatibilitätsmatrix** — Welche Features miteinander interferieren können. |

---

## Tech Stack (faktisch)

| Layer | Technologie |
|---|---|
| Framework | Next.js 15 (App Router, Server Components) |
| Styling | CSS (global, kein Tailwind-Utility-First) + Tailwind als Helfer |
| Animation | Framer Motion |
| UI Primitives | Radix UI, Lucide Icons |
| State | Zustand (persistent via `zustand/middleware/persist`) |
| Datenbank & Auth | Supabase (PostgreSQL + RLS + Server-Side Auth) |
| Background Jobs | Inngest (LLM-Calls, Report-Pipelines, langlaufende Tasks) |
| AI | Anthropic Claude (via Vercel AI SDK), OpenAI (Whisper für Voice) |
| MCP | `.mcp.json` im Root — definiert Model Context Protocol Server-Anbindungen |
| Error Tracking | Sentry (`sentry.client.config.ts`, `sentry.server.config.ts`) |

---

## Kritische Dateipfade & Orientierung

### Einstiegspunkte
- `middleware.ts` — Schützt alle `/dashboard`-Routes. Auth-Redirect auf `/auth`.
- `app/dashboard/layout.tsx` — Haupt-Layout (Sidebar, Header, Store-Init).
- `store/` — Alle globalen Zustand-Stores. **Wichtigster:** `use-calendar-store.ts` (Tasks, Pomodoro, Pulse).

### API-Schicht (`app/api/`)
- Jeder Route Handler prüft Auth **serverseitig** via `supabase.auth.getUser()`.
- `user_id` **niemals** aus dem Client-Payload nehmen — immer aus der Session.
- Langlaufende Operationen (>5s) → **nicht** im Route Handler, sondern als Inngest-Job.

### Inngest (`lib/inngest/`)
- Background-Job-Runner. Enthält alle AI-Pipelines.
- `coaching-report-pipeline.ts` — Generiert Coaching-Analyse aus Session-Daten.
- `model-router.ts` — Zentraler AI-Modell-Router. **Nicht** unnötig erweitern — Feature-spezifische APIs bevorzugen.

### Typen (`types/`)
- `types/supabase.ts` — Auto-generiert aus Supabase-Schema.
- `types/coaching.ts` — Coaching-spezifische Typen (`FeedbackReport`, `TopicSuggestion`).

### Datenbank (`supabase/migrations/`)
- Alle Schema-Änderungen als `.sql`-Migration.
- Nach Änderung: `npx supabase db push` (remote) + `npx supabase gen types typescript --local > types/supabase.ts`.
- **Bekanntes Problem:** Migration-History-Konflikte bei älteren Migrationen → im Zweifel SQL direkt im Supabase Dashboard ausführen.

### Directives (`directives/`)
- Agent-spezifische Direktiven (z.B. `AGENT_2.3_QUALITY_JUDGE.md`).
- `MASTER_PROMPT_TEMPLATE.md` — Template für systemische Prompts.

---

## Implementierungs-Direktiven (unveränderlich)

**REDUCE COMPLEXITY**
State-Hierarchie: `useState` → `Zustand` → `Supabase`. Server-State nur bei echter Persistenz-Notwendigkeit.

**FEATURE SILOS**
Neue Features kapseln. Den `model-router.ts` und globale APIs nicht aufblähen — dedizierte Route Handler bevorzugen.

**NO FAKE DATA**
Keine erfundenen URLs oder Firmen. Suchanfragen statt statischer Links generieren (z.B. YouTube Search Query Pattern).

**SECURITY FIRST**
Kein Client-Trust. Jede API-Route check auth eigenständig. PII (Name, Email, Standort) niemals in Logs.

---

## Feature-Silo Übersicht (aktueller Stand)

| Feature | Hauptdateien |
|---|---|
| Coaching | `app/dashboard/coaching/`, `lib/inngest/coaching-report-pipeline.ts`, `types/coaching.ts` |
| Job Queue | `app/dashboard/job-queue/`, `app/api/job-queue/` |
| Today's Goals (Kalender) | `app/dashboard/components/calendar/`, `store/use-calendar-store.ts` |
| Cover Letter | `app/dashboard/components/workflow-steps/cover-letter-wizard/` |
| Gap Analyse | `app/dashboard/job-queue/[id]/gap-analyse/` |
| Volunteering | `app/dashboard/community/volunteering/` |
| Settings & Profil | `app/dashboard/settings/`, `app/api/settings/` |
| Admin | `app/dashboard/admin/` (nur für autorisierte E-Mails) |
