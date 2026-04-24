# 🤝 AGENT ONBOARDING — Pathly V2.0

> **Lies mich ganz, bevor du Code schreibst.** ~10 Minuten. Dieser Guide ist der Einstiegspunkt für jeden neuen Claude-Agent in diesem Repo. Wenn du hier fertig bist, kennst du die Architektur, die Regeln, die Toolchain und die häufigsten Fehler anderer Agenten.

**Stand:** 2026-04-24 · Phase 5.3 (Cover Letter Hardening deployed)
**Projekt-Owner:** Yannik Galetto · yannik.galetto@gmail.com

---

## 1 · Was ist Pathly?

Pathly ist ein **DSGVO- und NIS2-konformes Job-Application-SaaS**. Kernfunktionen:
- **Job-Scraping** (SerpAPI + Jina) + Company Research (Perplexity)
- **CV Match / CV Optimizer** (Azure Document Intelligence + Claude Sonnet 4.6)
- **Cover Letter Generator** (Claude Sonnet 4.6, 3-Iter-Judge-Loop, 12+ Anti-Fluff-Regex, Pathly-DNA-Toggle)
- **Chrome Extension** (Plasmo) für Form-Fill (human-in-the-loop, DSGVO Art. 22)
- **Coaching** (Mock-Interview mit Voice-Note)
- **Billing** (Stripe Credits, atomic RPCs, FOR UPDATE Lock)
- **Video Scripts, Certificates, Community, Volunteering, Mood Check-in**

**Kern-Prinzip:** "AI assists, humans decide. Every application passes through user review."

---

## 2 · Tech Stack (SHORT)

| Layer | Stack |
|---|---|
| Frontend | Next.js 15 App Router, Tailwind + shadcn/ui, Zustand + React Query, Framer Motion, next-intl (de/en/es) |
| Backend | Next.js API Routes + Inngest (background jobs) |
| Database | Supabase (Postgres + Auth + Storage + RLS) |
| AI | Claude Sonnet 4.6 (premium), Claude Haiku 4.5 (cheap), Azure Document Intelligence (EU/DSGVO), Perplexity Sonar, GPT-4o-mini (classification) |
| Deployment | Vercel (auto on `main` push), Inngest Cloud |

Model-IDs (niemals ändern ohne Freigabe):
- `claude-sonnet-4-6` · `claude-haiku-4-5-20251001`

---

## 3 · Pflichtlektüre (in dieser Reihenfolge)

```
[10 min Pflicht]
1. AGENT_ONBOARDING.md          ← du bist hier
2. ARCHITECTURE.md (Root, V5.2+) ← Complete System Design (Tech Stack, Data Flow, Routes, DB)
3. CLAUDE.md                     ← Developer Operating Manual (§RECENT FIXES zeigt Code-Stand)
4. directives/FEATURE_COMPAT_MATRIX.md  ← Forbidden Files + Feature-Silos (Abschnitt 0)

[Kontextspezifisch — nur für dein Feature]
5a. Cover Letter → directives/QUALITY_CV_COVER_LETTER.md + lib/services/cover-letter-prompt-builder.ts
5b. CV Pipeline → directives/cv_generation.md + Übergang/CV_PIPELINE_LEARNINGS.md
5c. Security → docs/SICHERHEITSARCHITEKTUR.md (14 Contracts)
5d. Design → docs/DESIGN_SYSTEM.md (Notion-Linear Hybrid, #FAFAF9, Inter)
5e. Motion → docs/MOTION_PRINCIPLES.md (PFLICHT bei Framer Motion)
5f. i18n → directives/i18n_protocol.md (de/en/es gleichzeitig, kein hardcoded Text)

[Historisch — NICHT als Vorlage nutzen]
- directives/AGENT_*.md  ← Phase-1-MVP-Docs aus Feb 2026, überholt
- directives/cover_letter_generation.md  ← Feb 2026, überholt (jetzt Phase 5.3)
- directives/PHASE_2_EXECUTION_PLAN.md  ← historisch
```

**Die ehrliche Wahrheit:** Die Doku kann vom Code abdriften. Bei Widersprüchen gilt: **Code > ARCHITECTURE.md > CLAUDE.md > directives/ > docs/**. Lies den Code selbst, wenn die Directive alt wirkt.

---

## 4 · ⛔ Forbidden Files — NIEMALS ohne Freigabe anfassen

```
lib/ai/model-router.ts            ← SHARED (CV Match + Cover Letter + Certificates + Coaching)
middleware.ts                      ← SYSTEM-LEVEL Auth + Rate-Limit
supabase/migrations/*              ← DB-Schema (nur via dedizierte Migration-Tasks)
lib/services/_archive/*            ← archivierter Code (reanimieren nur mit Freigabe)
app/_archive/*                     ← archivierte Routes
```

Feature-Silos sind gegeneinander gesperrt:

| Du arbeitest an... | Du darfst NICHT anfassen |
|---|---|
| Cover Letter | `cv-match-pipeline.ts`, `certificates-pipeline.ts`, `coaching-*.ts`, `video-*` |
| CV Match | `cover-letter-*.ts`, `certificates-pipeline.ts`, `coaching-*.ts` |
| Certificates | `cv-match-pipeline.ts`, `cover-letter-*.ts`, `coaching-*.ts` |
| Coaching | `cv-match-pipeline.ts`, `cover-letter-*.ts`, `certificates-pipeline.ts` |

**Workflow bei Konflikt:**
1. STOPP — keine "kleinen Fixes" in fremden Silos
2. Erkläre dem User WARUM die Forbidden File relevant ist
3. Zeige Impact-Analyse (welche Features könnten betroffen sein?)
4. Warte auf explizite Freigabe
5. Ändere — teste dann ALLE betroffenen Features, nicht nur deines

---

## 5 · DOE Framework in Kürze

**D**irectives (im `directives/`-Ordner) definieren **WAS** gebaut wird und **WARUM**.
**E**xecutions liegen im Code unter `lib/`, `app/`, `components/`, `store/`.

Das Verbindungsglied ist der **MASTER_PROMPT_TEMPLATE.md** — eine wiederverwendbare Vorlage für Agent-Tasks. Jede neue Feature-Arbeit beginnt mit:

1. **Impact Analysis** (directives/FEATURE_IMPACT_ANALYSIS.md) — Impact-Map auf andere Features erstellen, User vorlegen, auf "Go" warten.
2. **Cross-Reference** — ARCHITECTURE (= code), FEATURE_COMPAT_MATRIX, QUALITY-Standards.
3. **Reduce Complexity** (CLAUDE.md Rule #0) — MVP-First, keine 10-API-Call-Overengineering.
4. **Test Interoperability** — `npx tsc --noEmit`, `npx jest`, `npm run build`, localhost-Browser-Check.

---

## 6 · Kritische Verhaltensregeln

### 6.1 Schreibstil im Code (wenn du Text generierst, z.B. Prompts, i18n)
- **KEIN Gedankenstrich** (— oder –) im Fließtext — nutze Semikolon (`;`) oder Punkt.
- **KEIN** "hiermit bewerbe ich mich", "mit großem Interesse", "I am excited to apply".
- **KEIN** "nicht X, sondern Y" / "weniger X als Y" Kontrast-Strukturen.
- **ICH-Perspektive**, nie allwissend über Unternehmen ("bei [Firma] ist X" = VERBOTEN).
- Max 25 Wörter pro Satz, max 2 Kommas.

**Auch in UI-Text (Tooltips, i18n-Keys, Error-Messages) halten wir uns an diese Regeln.** Siehe als Mahnmal meinen eigenen Patch [2026-04-24] wo ich Em-Dashes in die `pathly_dna_hint` geschrieben hatte und sie wieder rausnehmen musste.

### 6.2 DSGVO / Security
- **PII niemals loggen.** Emails/Telefon/Namen nicht in `console.log`.
- **Sanitize vor externen AI-Calls**: `lib/services/pii-sanitizer.ts` oder `getCVText(cv, { forAI: true })`.
- **Alle User-Queries mit `.eq('user_id', userId)`** — RLS ist Defense-in-Depth, nicht ersatz.
- **Double-Assurance bei Status-Änderungen** (Write → Read-Back → Validate → Success). Siehe `docs/SICHERHEITSARCHITEKTUR.md` §2 + §7.
- **Service Role Key NIE im Frontend.**

### 6.3 Tests & TypeScript
- **Keine `any` Types.** Wenn es wirklich muss: `unknown` + narrowing.
- **Neue Pattern = neuer Test.** Kein Regex ohne Jest-Fixture.
- **Vor Commit:** `npx tsc --noEmit && npx jest` — beides muss grün sein.

### 6.4 i18n (ab 2026-03-17 Pflicht)
- Jede UI-Komponente nutzt `useTranslations()`.
- **Kein hardcoded Text** in JSX.
- Neue Keys: immer gleichzeitig in `locales/de.json`, `locales/en.json`, `locales/es.json`.

### 6.5 Git / Commit
- **Nie `--no-verify`** (Hooks skippen).
- **Nie force-push** auf `main`.
- **Nie** `git config --global --edit`.
- Commit-Message: `<type>(<scope>): <kurz>\n\n<bullet-body>\n\nCo-Authored-By: Claude ...`.

---

## 7 · Commands Cheatsheet

```bash
# Dev-Server (mit Cache-Clear für Prompt-Änderungen)
pkill -f "next dev" 2>/dev/null; rm -rf .next && npm run dev

# Inngest lokal (für Background-Jobs)
npx inngest-cli@latest dev

# Type-Check
npx tsc --noEmit

# Jest
npx jest --no-coverage

# Full Build (Vercel-Parität)
rm -rf .next && npm run build

# Prompt-Audit für Cover-Letter-Debugging
echo "COVER_LETTER_AUDIT=true" >> .env.local
# Generieren → Files in $TMPDIR/pathly-prompt-audits/
ls -t "$TMPDIR/pathly-prompt-audits/" | head -3

# Archiv-Verzeichnisse (NICHT in tsconfig, nicht kompiliert)
ls lib/services/_archive/   # multi-agent-pipeline.ts
ls app/_archive/             # kill-fluff-route.ts

# DB-Schema prüfen (bevor du .select() schreibst)
# job_queue hat 'company_name', NICHT 'company' — classic trap
cat supabase/migrations/$(ls -t supabase/migrations/ | head -1)
```

---

## 8 · Workflow für einen typischen Task

```
User gibt Task
  ↓
[1] AGENT_ONBOARDING.md + CLAUDE.md + FEATURE_COMPAT_MATRIX.md lesen
  ↓
[2] Betrifft Task eine Forbidden File? → STOP, User fragen
  ↓
[3] Impact-Analyse: Welche Files? Welche Features?
  ↓
[4] Plan vorlegen (wenn Task non-trivial)
  ↓ [User ACK]
[5] Code (mit parallelen Tool-Calls wo möglich — parallel file-reads, parallel greps)
  ↓
[6] Tests schreiben + `npx tsc --noEmit && npx jest`
  ↓
[7] Localhost-Browser-Test (bei UI-Änderungen, PFLICHT!)
  ↓
[8] Changelog-Eintrag in CLAUDE.md §RECENT FIXES
  ↓
[9] `git add <specific files> && git commit` (niemals `git add -A` ohne Review)
  ↓
[10] Push nur wenn User explizit "push" sagt
```

---

## 9 · Häufige Fehler anderer Agenten (lerne daraus)

| Fehler | Gegenmaßnahme |
|---|---|
| `model-router.ts` "nur kurz" angefasst | FORBIDDEN — blast radius auf 5+ Features |
| `.eq('user_id', ...)` vergessen | RLS rettet zwar, aber Defense-in-Depth = immer explizit filtern |
| `router.push('/dashboard')` ohne `success: true` Check | Onboarding-Loop, siehe §1 SICHERHEITSARCHITEKTUR |
| `company` statt `company_name` in job_queue | Spalten-Namen trap, immer Migration-File prüfen |
| Hardcoded "Sehr geehrte Damen..." im Prompt oder UI | i18n verletzt, muss in locales/*.json |
| Em-dashes im generierten Text | Post-Processing in `cover-letter-generator.ts:35` fängt es, aber Prompt selbst auch clean halten |
| Judge-PASS = Brief OK | NEIN. `scanForFluff` ist zusätzlich Break-Blocker (Phase 5.3). Beides muss passen. |
| `kill-fluff` oder `multi-agent-pipeline` aufgerufen | Archiviert, 0 Caller. Nicht reanimieren ohne Grund. |
| Prompt-Änderung ohne Dev-Server-Restart | `rm -rf .next && npm run dev` — sonst läuft alter Code |
| Neue Migration ohne `database/schema.sql` Update | Doku-Drift, siehe CLAUDE.md DOCUMENTATION SYNC |

---

## 10 · Memory-System

Dieser Agent (Claude Code) hat eine persistente Memory unter:
`/Users/yannik/.claude/projects/-Users-yannik-job-automation-saas/memory/`

Wichtige Einträge (Stand 2026-04-24):
- `MEMORY.md` — Index
- `project_pathly_overview.md` — SaaS-Architektur
- `reference_critical_files.md` — Forbidden Files Referenz
- `reference_yannik_writing_dna.md` — 5 Original-Anschreiben als Benchmark
- `project_phase5_handover.md` — Cover Letter Phase 5 Handover
- `project_phase_b_wizard_refactor.md` — Wizard Step-0 Refactor (nicht begonnen)

**Bei Start:** Check `MEMORY.md` ob ein laufendes Projekt-Handover existiert, das deinen Task betrifft.

---

## 11 · Die ehrlichen Kompromisse (ab Phase 5)

Damit du nicht enttäuscht bist, wenn du manchen Zustand entdeckst:

- **Prompt-Builder ist 1000+ Zeilen** mit 20+ conditional Blöcken. Split-in-Parts ist Phase 6 Kandidat.
- **Wizard-Logik ist "flach"** — Hook/Quote-Auswahl passiert bevor Preset/Custom-Style-Fundament. Handover für Step-0-Refactor liegt in Memory.
- **Custom-Style-Modus** nutzt nur extrahierte StyleAnalysis-Features (tone, sentence_length, conjunctions) — der Rohtext des Referenzbriefs ist NICHT im Prompt. Phase C Arbeit.
- **60 Jest-Tests** decken den Cover-Letter-Flow zu ~10% Line-Coverage ab. Integration-Tests (Playwright) fehlen.
- **Persist-Store-Migration** ist nicht definiert — bei Breaking-Change am Store-Schema bricht existierenden Usern der Wizard.
- **Alte AGENT_*.md Directives** sind nicht durchgehend aktualisiert. Bei Zweifel: Code > Directive.

Diese sind bewusst offen gelassen (Rule #0: Reduce Complexity, Ship first). Dokumentieren statt verstecken.

---

## 12 · Wenn du startest

1. Lies **CLAUDE.md §RECENT FIXES** (die letzten 5-10 Einträge) — das zeigt dir den aktuellen Zustand.
2. Öffne die Memory-`MEMORY.md` — schau ob ein laufendes Handover dich betrifft.
3. Stelle dem User eine **präzise Startfrage**, falls der Task offen ist:
   - "Soll ich [X] anfassen oder nur [Y]?"
   - "Priorisierst du [Quick Fix] oder [Clean Solution]?"
   - "Ist es OK, wenn ich [Forbidden File] anfasse, weil [Grund]?"
4. Zeige deinen **Implementation Plan** bevor du Code schreibst (außer bei Auto-Mode).
5. Nach deiner Arbeit: **Changelog in CLAUDE.md**, Commit mit klarer Message, und dem User eine konkrete Test-Anweisung geben.

---

**Willkommen bei Pathly. Code präzise, ehrlich, und im Zweifel lieber einen Moment innehalten als später aufräumen.**

— Pathly V2.0 Team
