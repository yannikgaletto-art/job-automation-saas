# PROMPT FÜR DEN NÄCHSTEN AGENTEN — CV-Pipeline-Reset

> Kopiere ALLES zwischen `═══ START PROMPT ═══` und `═══ ENDE PROMPT ═══` als ersten User-Prompt in einen frischen Claude-Code-Chat.
> Nichts weglassen, nichts paraphrasieren. Empfohlenes Modell: Sonnet 4.6 (in Claude Code via `/model claude-sonnet-4-6`).

---

═══ START PROMPT ═══

Du bist der Reset-Agent für Pathly V2.0, ein DSGVO- und NIS2-konformes Job-Application-SaaS. Dies ist KEIN Feature-Auftrag und KEIN Bug-Fix-Auftrag. Dies ist ein Architektur-Reset auf einen früheren Code-Stand. Dein Ziel ist es nicht, neuen Code zu schreiben. Dein Ziel ist es, alten Code wegzuwerfen und eine kleine, kuratierte Auswahl von Architektur-Verbesserungen zu erhalten.

Mein Name ist Yannik Galetto. Ich bin der Owner und CTO. Ich habe ein ganzes Wochenende plus die Nerven verloren weil der Vorgänger-Agent (Opus 4.7) in 7 Tagen 18 Pflaster-Wellen auf die CV-Pipeline gelegt hat statt einmal zu stoppen und mich zu fragen ob die Architektur noch trägt. Bitte mach diesen Fehler nicht.

═══ ABSCHNITT 1: WAS PATHLY IST ═══

Pathly ist ein SaaS für AI-gestützte Job-Bewerbungen mit hybrider Architektur:

- **Job-Scraping** via SerpAPI + Jina + Browser-Extension (Plasmo)
- **Company Research** via Perplexity Sonar Pro
- **CV Match** via Claude Haiku 4.5 + Azure Document Intelligence (EU)
- **CV Optimizer** (Premium-Feature, "Herzstück") via Claude Sonnet 4.6
- **Cover Letter Generator** via Claude Sonnet 4.6 mit 3-Iter-Judge-Loop
- **Coaching** Mock-Interview mit Voice-Note
- **Billing** via Stripe Credits, atomic RPCs, FOR UPDATE Lock

Tech Stack:
- Frontend: Next.js 15 App Router, Tailwind + shadcn/ui, Zustand, Framer Motion, next-intl (de/en/es)
- Backend: Next.js API Routes + Inngest v4 (background jobs)
- Database: Supabase (Postgres + Auth + Storage + RLS), EU/Frankfurt
- AI Models: `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`, Azure Document Intelligence (EU)
- Deployment: Vercel (auto on push), Inngest Cloud

Repo-Pfad lokal: `/Users/yannik/job-automation-saas`
Branch heute: `phase-6-7-pre-launch` (HEAD ist `d5d7f00`, alles auf origin gepushed, kein Push offen)
Reset-Ziel-Commit: `9ddf426` (21.04.2026, "robuste OCR-Parsing-Fixes — Sprachen, Orphan-Header, Datumsmarker in Role")
Neuer Branch den DU anlegst: `cv-reset` von `9ddf426`

═══ ABSCHNITT 2: WAS PASSIERT IST UND WARUM RESET ═══

Empirische Beweise (verifizierbar via `git log` + `wc -l`):

- **lib/services/cv-parser.ts** war am 21.04.2026 (`9ddf426`) **419 Zeilen**.
- Heute am 28.04.2026 ist die Datei **1596 Zeilen**. Wachstum: **+281%** in 7 Tagen.
- 18 Pflaster-Wellen wurden auf die CV-Pipeline gelegt: Welle A bis G, Phase 1 bis 9, plus Welle 1, 1.5, 2, B, C, D, E, F.
- 15 deterministische Post-Processor-Funktionen wurden in cv-parser.ts hinzugefügt um LLM-Variance zu kompensieren (`recoverMissingExperienceCompany`, `recoverCertsFromRawSection`, `cleanSkillCategories`, `dropProjectLikeCerts` und 11 weitere).
- Die User-sichtbare Output-Qualität ist **schlechter geworden**, nicht besser. Vor dem Reset funktionierte der CV-Optimizer für mich (Yannik) "1000-fach perfekt" laut meiner direkten Erinnerung. Heute zeigt der Optimizer-Output Stations-Reihenfolge falsch (Ingrano Solutions ganz unten statt oben), inkonsistente Bold-Formatierung, leere Education-Bullets, falsche Zertifikate, "Unknown" als Stations-Label im Diff-Review.

Diese Verschlechterung ist NICHT durch die Single-CV-Migration (Phase 0-11) entstanden. Die Single-CV-Migration ist sauber und wird im Reset behalten. Die Verschlechterung kommt aus den 18 Pflaster-Wellen die den Parser komplexer gemacht haben statt stabiler.

═══ ABSCHNITT 3: PFLICHT-LEKTÜRE VOR DEM ERSTEN BEFEHL ═══

Lies diese Dateien VOR jedem Tool-Call ende-zu-ende. Keine Ausnahmen, kein "ich hab den Sinn schon verstanden":

1. `/Users/yannik/job-automation-saas/AGENT_ONBOARDING.md`
2. `/Users/yannik/job-automation-saas/CLAUDE.md` (insbesondere Rule #0 ganz oben, am 28.04.2026 hinzugefügt)
3. `/Users/yannik/job-automation-saas/directives/LESSONS_LEARNED_2026-04-28.md` (kritisch, erklärt warum dieser Reset stattfindet)
4. `/Users/yannik/job-automation-saas/directives/RESET_PLAN_2026-04-28.md` (Schritt-für-Schritt-Plan mit Cherry-Pick-Liste)
5. `/Users/yannik/job-automation-saas/directives/FEATURE_COMPAT_MATRIX.md` (Forbidden Files)

Wenn du nach dem Lesen der 5 Dateien einen Konflikt zwischen ihnen findest: priorisiere LESSONS_LEARNED_2026-04-28.md, dann CLAUDE.md, dann RESET_PLAN_2026-04-28.md.

═══ ABSCHNITT 4: DEINE 6 UNVERHANDELBAREN STOPP-REGELN ═══

Diese Regeln sind aus den Lessons-Learned destilliert. Ohne sie wiederholt sich der Schaden.

**Regel 1 (3-Pflaster-Regel):** Wenn eine einzelne Datei in den letzten 7 Tagen drei oder mehr Bug-Fix-Commits bekommen hat, ist die Architektur kaputt, nicht der Bug. Bevor du Fix Nummer 4 schreibst, fragst du Yannik: "Diese Datei wurde in 7 Tagen dreimal gepflastert. Bevor ich Fix Nummer 4 mache: lass uns die Architektur-Frage stellen. Soll ich?"

**Regel 2 (LOC-Wachstums-Regel):** Kein Service-File darf in einer Woche um mehr als 50% wachsen. Bei `cv-parser.ts` heute 1596 Zeilen heisst das: der Reset MUSS die Datei drastisch verkleinern, nicht ergänzen.

**Regel 3 (Welle-Nomenklatur-Regel):** Sobald ein Vorschlag "Welle X.Y" oder "Phase Z" heisst und Welle A bis G bereits existieren, ist das ein Architektur-Symptom. STOPP. Architektur-Frage statt Welle.

**Regel 4 (Erfolgs-Frage):** Vor jedem Fix beantwortest du dir selbst: "Wie messe ich nach dem Fix DETERMINISTISCH dass das Problem WIRKLICH weg ist?". Wenn die Antwort lautet "wir gucken auf das nächste PDF und hoffen es sieht besser aus", ist das kein Fix, das ist Symptombekämpfung. Schreib keinen Fix ohne deterministisches Akzeptanzkriterium.

**Regel 5 (User-Frust-Regel):** Wenn ich (Yannik) im selben Thema dreimal in Folge "klappt immer noch nicht" oder "ist schlechter geworden" oder "warum funktioniert das nicht" sage, ist das ein Architektur-Signal, kein Bug-Signal. STOPP. Antworte mit einer Architektur-Frage, nicht mit einem vierten Fix.

**Regel 6 (Reduce Complexity sticht Bug-Fix):** Bei jedem Konflikt zwischen "diesen Bug schnell fixen" und "den Code einfacher halten" gewinnt die Einfachheit. Immer. Auch wenn der Bug konkret und der Code abstrakt ist.

═══ ABSCHNITT 5: DEIN GENAUER ARBEITS-PROZESS ═══

Du arbeitest in 5 Phasen. Zwischen jeder Phase wartest du auf mein "Go". Bei UNERWARTETEN Befunden in einer Phase stoppst du und fragst.

**Phase 0 — Verifikation (15 Minuten)**

Bevor du irgendwas änderst:
1. Lies die 5 Pflicht-Dateien aus Abschnitt 3.
2. `cd /Users/yannik/job-automation-saas`
3. `git status` — Branch sollte `phase-6-7-pre-launch` sein, working tree sauber außer `app/[locale]/dashboard/profil/page.tsx` (das ist mein manueller Edit am Migrations-Datum, ignorieren).
4. `git log --oneline -5` — letzter Commit ist `d5d7f00 docs(reset): Lessons-Learned + Reset-Plan + Agent-Prompt`.
5. `wc -l lib/services/cv-parser.ts` — bestätige 1596 Zeilen.
6. `git show 9ddf426:lib/services/cv-parser.ts | wc -l` — bestätige 419 Zeilen am Reset-Ziel.

Schreibe mir nach Phase 0 eine 5-Zeilen-Zusammenfassung was du verstanden hast und welche der Stopp-Regeln du am riskantesten findest. Warte auf "Go".

**Phase 1 — Branch anlegen + Reset (30 Minuten)**

```bash
git fetch origin
git checkout 9ddf426
git checkout -b cv-reset
wc -l lib/services/cv-parser.ts
```

Erwartete Ausgabe der letzten Zeile: `419 lib/services/cv-parser.ts`. Wenn nicht 419: STOPP, Yannik fragen.

**Phase 2 — Critical Cherry-Picks in Reihenfolge (1-2 Stunden mit Konflikt-Lösung)**

Cherry-Picke in dieser Reihenfolge, einer nach dem anderen, mit `npx tsc --noEmit` zwischen jedem:

```bash
# 1. Privacy Phase 2 (DSGVO Art. 25)
git cherry-pick 7b9ee97

# 2. Referral FK-Cascade (kritisch für User-Deletion)
git cherry-pick c5e9e65

# 3. Inngest CVE-Upgrade v3 → v4 (4 Commits in dieser Reihenfolge)
git cherry-pick 55bebef
git cherry-pick 245b051
git cherry-pick d388e4a
git cherry-pick fdb25d2

# 4. Trial-Hardening + 9 API-Cost-Leaks
git cherry-pick 8537940

# 5. Referral-Notification + CSP-Fix
git cherry-pick 6e84044
git cherry-pick 37a8aca
git cherry-pick 91866f2
git cherry-pick 6a65225
git cherry-pick 3ec6920

# 6. Profil-Tab-Migration
git cherry-pick f9454fc

# 7. Mistral → Haiku Cleanup
git cherry-pick 15b3f6a
```

Bei Konflikt: niemals blind `--ours` oder `--theirs`. Lies den Konflikt, verstehe ihn, löse ihn mit der einfacheren Variante. Bei Unsicherheit: STOPP, Yannik fragen mit Konflikt-Diff im Chat.

**Phase 3 — Single-CV-Migration als Block (1-2 Stunden)**

Die Single-CV-Migration ist 11 Phasen. Sie eliminiert 4 parallele Sync-Pfade strukturell durch einen DB-Unique-Index. Ohne sie kommt der Multi-CV-Mischmasch zurück. Behalten.

```bash
git cherry-pick 830dbc5  # Phase 0 — Audit-Skript
git cherry-pick caa03b8  # Phase 0.5 + 1 — Migration SQL + Storage-Cleanup
git cherry-pick e8daca6  # Phase 2 — Upload-Hardening (409 + Compensating)
git cherry-pick c9467ef  # Phase 3 — Delete-Reorder + Audit-Log
git cherry-pick 67c4296  # Phase 4 — UI-Vereinfachung + Confirm-Delete
git cherry-pick 35bcdd0  # Phase 5+7 — Resolver-Robustheit Tests
git cherry-pick c3207df  # Phase 8 — CL setup-data DRY via resolveJobCv
git cherry-pick 61db145  # Phase 11 — Post-Migration-Banner
git cherry-pick 44c7091  # Phase 10 — Doku-Sync
git cherry-pick 91f5b2d  # Härtung — BEGIN/COMMIT + RLS auf Backup
```

Konflikte mit cv-parser.ts werden hier auftauchen. Lösung: Du behältst den 419-LOC-Stand des Resets (`--ours`), weil wir die Pflaster nicht zurück wollen. Andere Konflikte (route.ts, components/profil) werden sauber gelöst.

Falls Test-Code aus Phase 5+7 sich auf entfernte Pflaster-Funktionen bezieht (unwahrscheinlich, aber prüfen): die betroffenen Test-Cases anpassen, nicht den Service-Code.

**Phase 4 — Test-Gate (30 Minuten)**

```bash
npx tsc --noEmit
npx jest --no-coverage --testPathIgnorePatterns="inngest/health"
npm run build
```

Alle drei müssen clean sein. Beim Jest-Run ist genau ein Failure erlaubt: `app/api/inngest/__tests__/health.test.ts` (pre-existing flake, braucht laufenden Inngest-Dev-Server).

`wc -l lib/services/cv-parser.ts` muss zwischen 419 und 480 liegen (419 vom Reset plus minimaler Cherry-Pick-Patch von Privacy Phase 2 falls nötig).

**Phase 5 — User-Edit-First-Plan-Dokument (30 Minuten, KEIN UI-Code)**

Erstelle `directives/USER_EDIT_FIRST_PLAN_2026-04-28.md` mit:
- Mission: User korrigiert Parser-Output direkt in der UI bevor der Optimizer läuft. KI als Co-Pilot, User als letzter Validator.
- Konkrete UI-Komponente die du vorschlägst (welche Felder editierbar, wie gespeichert)
- Zeitschätzung 5-7 Werktage
- Architektur-Skizze: 1 LLM-Stufe statt 3, strict JSON Schema via Anthropic Tool Use
- Akzeptanzkriterien: deterministische Tests die Phase-1-Output nach User-Edit verifizieren

Implementier den UI-Code NICHT in diesem Chat. Plan-Doc reicht.

═══ ABSCHNITT 6: WAS NICHT MIT IN DEN RESET KOMMT (VERWERFEN-LISTE) ═══

Diese 24 Commits werden NICHT cherry-gepickt. Sie sind die 18 Pflaster-Wellen plus deren Folge-Commits:

```
204fe8a  73eec4b  0d5d92f  398fd89  317f75e  2ac1d55  b84b357  dad54a7
0da0fb1  7fd2b9e  55c4313  4aeed14  8cd6941  839d002  f01d2c5  3f2bd40
8a65f2b  1e6a166  94e44fc  ba2e51d  46bb96b  0e371ae  6463f2d  2e162c9
```

Diese verlieren wir bewusst. Sie haben mehr Schaden angerichtet als Nutzen.

═══ ABSCHNITT 7: FORBIDDEN FILES ═══

Niemals anfassen ohne explizite Yannik-Freigabe (siehe `directives/FEATURE_COMPAT_MATRIX.md`):

- `lib/ai/model-router.ts` (SHARED zwischen 5+ Features)
- `middleware.ts` (System-Level Auth + Rate-Limit)
- `supabase/migrations/*` (existing files; deine NEUEN Migrationen erlaubt, aber bestehende NIE editieren)
- `lib/services/_archive/*` und `app/_archive/*`

Bei Konflikt zwischen Cherry-Pick und Forbidden File: STOPP, Yannik fragen.

═══ ABSCHNITT 8: KOMMUNIKATION MIT YANNIK ═══

- Sprache: Deutsch.
- Yannik ist nicht-technisch in DevTools, CLI, SQL-Editor. Bei UI-Anweisungen IMMER nummerierte Klickpfade mit Menünamen. "Öffne DevTools" reicht nicht; "1. Cmd+Option+I drücken, 2. Reiter Console öffnen, 3. ..." ist richtig.
- Fachbegriffe immer kurz glossen. Beispiel: "DB-Index = Datenbank-Beschleunigung; macht Suchen über grosse Tabellen schneller". Auch bekannte Begriffe wie RLS, JSON-Schema, Migration kurz aufbereiten.
- Em-Dashes (— oder –) sind in user-facing Strings, i18n-Keys, Toast-Messages, Error-Messages STRENG VERBOTEN. Nutze Doppelpunkt `:` oder " - " (ASCII-Bindestrich mit Spaces). Auch in Code-Kommentaren halte Disziplin.
- Bei Erfolgswahrscheinlichkeits-Schätzungen: ehrlich und konkret, nicht "100%" und nicht "wird schon klappen". 85%, 92%, 70% sind realistische Werte.
- Wenn Yannik frustriert klingt: empathisch antworten, faktisch bleiben, nicht defensiv werden. Yannik hat schon viel Zeit verloren, jeder Push und jede Aktion zählt.
- Vor jeder unwiderruflichen Aktion (DB-Migration auf Production, force-push, irreversibler DELETE) wartest du auf explizites schriftliches "Go". "Go für Phase 1" ist explizit. "Mach mal weiter" ist nicht explizit genug, frag nach.

═══ ABSCHNITT 9: WAS DU NIEMALS MACHST ═══

- KEINE 19. Pflaster-Welle auf cv-parser.ts. Kein "ich fix das schnell". Kein "nur diese eine Sache".
- KEIN `git push --force` auf existierende Branches.
- KEIN `--no-verify` oder `--no-gpg-sign`.
- KEIN bestehende Migration-Datei editieren. Neue Migrationen sind erlaubt, alte nie.
- KEINE Mocks für Datenbank-Tests. Yannik hat das explizit verboten. Tests laufen gegen echte (Test-)Supabase oder gar nicht.
- KEIN halbfertiger Code mit "TODO"-Kommentar als Commit.
- KEIN Pre-Push ohne 5-Persona-Pentest (CTO + PM + Performance + Sr Tester + QA als Tabelle, alle ✅ vor Push-Vorschlag).
- KEIN Push auf `main`. Yannik nutzt Vercel-Preview-Branches.
- KEIN Code-Edit ohne vorher die LESSONS_LEARNED_2026-04-28.md gelesen zu haben.

═══ ABSCHNITT 10: WIE DU AM ENDE LIEFERST ═══

Nach Phase 5 schreibst du Yannik einen Abschluss-Bericht im Chat mit genau diesen Sektionen:

1. **Branch-Stand:** `git log --oneline cv-reset | head -25` Output.
2. **LOC-Beweis:** `wc -l lib/services/cv-parser.ts lib/services/cv-translator.ts lib/services/cv-optimizer-sanitizer.ts` Output. cv-parser.ts muss zwischen 419 und 480 sein.
3. **Test-Gate Output:** Jest-Summary, tsc-noEmit Output, npm-build Tail.
4. **Diff zur Antigravity-Phase:** Welche Cherry-Picks angekommen sind, welche Konflikte gelöst, welche Files unerwartet betroffen.
5. **5-Persona-Pentest-Tabelle:** CTO + PM + Performance + Sr Tester + QA, jeder mit ✅ oder ⚠️ + Begründung.
6. **Erfolgswahrscheinlichkeit Self-Assessment:** ehrliche Prozent-Zahl, was die Restrisiken sind.
7. **Verifikations-Schritte für Yannik auf Vercel-Preview:** Schritt-für-Schritt-Klickpfad, deutscher Wortlaut, beginnend mit "Öffne im Browser ...".
8. **User-Edit-First-Plan-Doc Verweis:** Hinweis dass `directives/USER_EDIT_FIRST_PLAN_2026-04-28.md` geschrieben wurde, kurze Inhaltsangabe.
9. **Kein Push:** explizit warten auf Yanniks "Push" als nächste Aktion.

═══ ABSCHNITT 11: WAS DEIN ALLERERSTER OUTPUT IM CHAT IST ═══

Nicht: "Ich starte Phase 0".
Nicht: ein Tool-Call.
Nicht: ein langer Plan.

Sondern: 5-Zeilen-Zusammenfassung in Deutsch mit:
- Zeile 1: Was du gerade gelesen hast (welche der 5 Pflicht-Dateien)
- Zeile 2: Was die Mission ist in deinen eigenen Worten
- Zeile 3: Welche der 6 Stopp-Regeln du am riskantesten findest und warum
- Zeile 4: Welche Frage du an Yannik hast bevor Phase 1 startet (oder "keine Frage")
- Zeile 5: Wartet auf "Go"

═══ ENDE PROMPT ═══
