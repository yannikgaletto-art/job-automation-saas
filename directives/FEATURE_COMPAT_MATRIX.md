# FEATURE COMPATIBILITY MATRIX & ARCHITECTURE OWNERSHIP

> **Authority:** CLAUDE.md v2.4 | BINDEND
> **Last Updated:** 2026-03-03 (Cross-Feature-Shield + Certificates Pipeline Fixes)
> **Scope:** OptInModules × TonePresets × IntroFocus — Source of Truth + Feature-Silo Rules

---

## 0. GENERISCHE CROSS-FEATURE-OWNERSHIP-REGELN (NEU — 2026-03-03)

**Diese Regeln gelten für ALLE Features, nicht nur Cover Letter.**

### 0.1 Forbidden Files — Dateien die NUR mit expliziter Freigabe angefasst werden dürfen

**Diese Dateien sind SHARED oder gehören zu fremden Features. Jede ungeplante Berührung ist ein Cross-Feature-Contamination-Fehler.**

```
lib/ai/model-router.ts                          ← SHARED — CV Match + Steckbrief + Cover Letter + Certificates
lib/inngest/cv-match-pipeline.ts                ← Feature: CV Match
lib/inngest/cover-letter-*.ts                   ← Feature: Cover Letter
lib/inngest/certificates-pipeline.ts            ← Feature: Certificates
app/dashboard/components/cv-match/*             ← Feature: CV Match
app/dashboard/components/steckbrief/*           ← Feature: Steckbrief
app/api/cover-letter/*                          ← Feature: Cover Letter (außer explizit beauftragt)
middleware.ts                                   ← SYSTEM-LEVEL
supabase/migrations/*                           ← DB-SCHEMA (nur via Migration-Tasks)
```

**Warum diese Regel existiert:**
- `model-router.ts` wird von 4+ Features genutzt. Eine Änderung dort hat Blast Radius auf ALLE.
- Ein "kleiner Fix" in Certificates crasht CV Match, Steckbrief UND Cover Letter.
- Das kostet Zeit (mehrere Repair-Zyklen), Geld (API-Calls) und Vertrauen.

**Workflow wenn dein Task eine Forbidden File berühren würde:**
1. STOPP sofort
2. Erkläre dem User WARUM du sie anfassen müsstest
3. Zeige WELCHE anderen Features betroffen wären
4. Warte auf explizite Freigabe
5. Erst nach Freigabe: Änderung durchführen + alle betroffenen Features testen

### 0.2 Feature-Silos — Isolation-Principle

**Jedes Feature soll ein abgeschlossenes Modul sein. Änderungen in Feature A dürfen Feature B nicht beeinflussen.**

| Feature-Typ | Erlaubter Scope | Verbotener Scope |
|---|---|---|
| **Certificates** | `lib/inngest/certificates-pipeline.ts`, `app/api/certificates/*`, `components/certificates/*`, `types/certificates.ts` | `cv-match-pipeline.ts`, `cover-letter-*.ts`, `model-router.ts` (ohne Freigabe) |
| **CV Match** | `lib/inngest/cv-match-pipeline.ts`, `app/api/cv/*`, `components/dashboard/components/cv-match/*` | `certificates-pipeline.ts`, `cover-letter-*.ts`, `model-router.ts` (ohne Freigabe) |
| **Cover Letter** | `lib/inngest/cover-letter-*.ts`, `app/api/cover-letter/*`, `lib/services/cover-letter-*.ts` | `cv-match-pipeline.ts`, `certificates-pipeline.ts`, `model-router.ts` (ohne Freigabe) |
| **Steckbrief** | `app/dashboard/components/steckbrief/*`, `lib/services/steckbrief-*.ts` | Alle anderen Inngest-Pipelines, `model-router.ts` (ohne Freigabe) |

**Regel:** Wenn dein Task sagt "Fix Certificates", darfst du NUR Dateien im Certificates-Scope anfassen. Alles außerhalb = Freigabe erforderlich.

### 0.3 Shared Libraries — Defense-in-Depth

**Dateien wie `model-router.ts` sind SHARED. Änderungen dort müssen gegen ALLE Konsumenten getestet werden.**

**Wenn eine Änderung an einer Shared Library unvermeidbar ist:**

1. **Zeige Impact-Analyse:**
   - Welche Features nutzen diese Datei?
   - Welche Funktionen/Typen ändern sich?
   - Welche Tests müssen laufen?

2. **Warte auf Freigabe:**
   - User MUSS explizit bestätigen: "Ja, ändere model-router.ts"

3. **Testing-Protokoll:**
   - Nach Änderung: CV Match starten → keine Fehler
   - Nach Änderung: Cover Letter generieren → keine Fehler
   - Nach Änderung: Certificates generieren → keine Fehler
   - Nach Änderung: Steckbrief anzeigen → keine Fehler

**Motto:** 
> "Eine Shared-Library-Änderung ohne Full-Regression-Test ist ein potenzieller Production-Outage."

---

## 1. The Compatibility Grid (Cover Letter Specific)

### OptInModules × TonePresets

| OptInModule | `data-driven` | `storytelling` | `philosophisch` | `formal` |
|---|---|---|---|---|
| `pingPong` | ✅ Kompatibel | ✅ Kompatibel | ✅ Kompatibel | ❌ Inkompatibel (UI Guard) |
| `vulnerabilityInjector` | ✅ Kompatibel | ✅ Kompatibel | ✅ Kompatibel | ❌ Inkompatibel (UI Guard) |
| `first90DaysHypothesis` | ✅ Kompatibel | ✅ Kompatibel | ✅ Kompatibel | ❌ Inkompatibel (UI Guard) |
| `painPointMatching` | ✅ Kompatibel | ✅ Kompatibel | ✅ Kompatibel | ✅ Kompatibel |
| `stationsSelector` | ✅ Kompatibel | ✅ Kompatibel | ✅ Kompatibel | ✅ Kompatibel |

**formal-Konflikte im Detail:**

| Module | Konfliktgrund | Guard-Typ |
|---|---|---|
| `pingPong` | Antithese/Synthese ist ein Storytelling-Element. formal verbietet "Überraschungen, Storytelling, persönliche Anekdoten." | UI: Toggle disabled in StepToneConfig |
| `vulnerabilityInjector` | "Strategische Schwäche" widerspricht dem Gebot: "souveräner Abschluss", formelle Tonalität. | UI: Toggle disabled in StepToneConfig |
| `first90DaysHypothesis` | Erzwingt 5. Absatz. formal verlangt strikte 4-Absatz-Struktur (Einstieg / Qualifikation / Passung / Schluss). | UI: Toggle disabled in StepToneConfig |

### OptInModules × IntroFocus

| OptInModule | `introFocus = 'quote'` | `introFocus = 'hook'` |
|---|---|---|
| `pingPong` | ✅ Kompatibel | ❌ Inkompatibel (UI Guard) |
| `vulnerabilityInjector` | ✅ Kompatibel | ✅ Kompatibel |
| `first90DaysHypothesis` | ✅ Kompatibel | ✅ Kompatibel |
| `painPointMatching` | ✅ Kompatibel | ✅ Kompatibel |
| `stationsSelector` | ✅ Kompatibel | ✅ Kompatibel |

**introFocus-Konflikt im Detail:**

| Condition | Konfliktgrund | Guard-Typ |
|---|---|---|
| `introFocus = 'hook'` + `pingPong = true` | Ping-Pong-Logik existiert ausschließlich im `quoteIntroBlock`. Wenn das Zitat in den Body wandert (`quoteBodyBlock`), gibt es keinen Kontext für Antithese/Synthese. Der Judge erwartet trotzdem einen Kontrast → Endlosschleife. | UI: Toggle disabled in StepHookSelection |

---

## 2. Architecture Ownership — Rules of Engagement (Cover Letter Specific)

### 2.1 State Management (Zustand Store)

**Owner:** `useCoverLetterSetupStore.ts` + UI-Step-Komponenten

| Verantwortung | Owner | Mechanismus |
|---|---|---|
| Reset aller Felder bei Job-Wechsel | `initForJob()` | Spread: `{ ...DEFAULT_OPT_IN_MODULES }` |
| Reset aller Felder bei manuellem Reset | `reset()` | Spread: `{ ...DEFAULT_OPT_IN_MODULES }` |
| Auto-Reset bei Tone-Wechsel zu `formal` | `StepToneConfig.tsx` → `handlePresetSelect()` | `setOptInModule('X', false)` für alle 3 inkompatiblen Module |
| Auto-Reset bei introFocus-Wechsel zu `hook` | `StepHookSelection.tsx` → `onChange` von introFocus-Radio | `setOptInModule('pingPong', false)` |

**Regel:** Der Store selbst führt KEINE Business-Logik aus. Er ist ein dummer Container. Die Step-Komponenten sind verantwortlich für zustandsabhängige Resets.

### 2.2 Prompt Engineering (cover-letter-prompt-builder.ts)

**Owner:** `buildSystemPrompt()`

| Verantwortung | Erlaubt? | Details |
|---|---|---|
| Feature-Sektionen basierend auf `modules.*` ein-/ausschalten | ✅ Ja | Kernaufgabe |
| Inkompatible Module eigenmächtig verwerfen (Defense-in-Depth) | ⚠️ Ja, aber NUR als Sicherheitsnetz | Der Prompt-Builder darf `modules.X = false` setzen, wenn eine Inkompatibilität erkannt wird. **Das UI MUSS jedoch immer die primäre Source of Truth sein.** Der Prompt-Builder fängt nur Edge Cases ab (Auto-Fill, stale Persist-State, direkte API-Aufrufe). |
| Neue Prompt-Sektionen ohne zugehörigen UI-Toggle einführen | ❌ Nein | Jedes Feature, das im Prompt steht, MUSS einen korrespondierenden Toggle oder State im Store haben. |

**Regel:** UI ist Source of Truth. Prompt-Builder ist Defense-in-Depth. Niemals umgekehrt.

### 2.3 Quality Assurance (cover-letter-judge.ts)

**Owner:** `judgeCoverLetter()`

| Verantwortung | Erlaubt? | Details |
|---|---|---|
| Features bewerten, die im Store auf `true` stehen | ✅ Ja | z.B. Ping-Pong-Check wenn `enablePingPong === true` |
| Features bewerten, die im Store auf `false` stehen | ❌ Nein | Der Judge MUSS den `setupContext` lesen und Feature-spezifische Kriterien ÜBERSPRINGEN wenn das Feature deaktiviert ist. |
| Feature-Tags (z.B. `[VUL]`) im bewerteten Text sehen | ⚠️ Akzeptiert | Der Judge bewertet den Text VOR dem Post-Processing. Tags sind zum Bewertungszeitpunkt noch vorhanden. Der Judge DARF Tags nicht als Qualitätsproblem werten. |
| Den Prompt-Builder-Override respektieren | ✅ Pflicht | Wenn der Prompt-Builder ein Feature verworfen hat (Defense-in-Depth), produziert Claude keinen entsprechenden Output → der Judge findet nichts zu bewerten → kein False-Negative. |

> [!IMPORTANT]
> **Aktueller Tech-Debt:** Der Judge liest `enablePingPong` direkt aus `setupContext?.optInModules?.pingPong` (Zeile 59) ohne die formal-/introFocus-Constraints zu prüfen. Das ist akzeptabel SOLANGE der Prompt-Builder diese Fälle via Defense-in-Depth abfängt (was er seit 2026-02-28 tut). Langfristig sollte der Judge denselben Constraint-Check durchführen.

### 2.4 Post-Processing (cover-letter-generator.ts)

**Owner:** `generateCoverLetter()` + `fixParagraph()`

| Verantwortung | Erlaubt? | Details |
|---|---|---|
| Interne KI-Steuer-Tags aus dem finalen Text strippen | ✅ Ja — EINZIGER erlaubter Ort | `[VUL]...[/VUL]` Tags werden hier entfernt. Der Text INNERHALB der Tags bleibt erhalten. |
| Tag-Stripping bedingt auf OptIn-Module machen | ❌ Nein — UNCONDITIONAL | Tags MÜSSEN immer entfernt werden, unabhängig davon ob das Feature aktiviert war. Claude kann Tags auch ohne explizite Anweisung halluzinieren. |
| Neue Tag-Typen einführen | ⚠️ Nur mit Post-Processor-Update | Jeder neue Tag-Typ im Prompt-Builder MUSS einen korrespondierenden Strip-Regex im Post-Processor erhalten. |

**Regel:** Der Post-Processor ist die letzte Verteidigungslinie. Er filtert ALLES was nach `[TAG]...[/TAG]` aussieht — paranoid, unconditional, idempotent.

---

## 3. "New Feature" Check-in Prozess

> Ab sofort PFLICHT bei jedem neuen Feature als **Step 1.4 — Prompt Constraint Validation**.

### Checkliste (vor dem ersten Zeile Code)

- [ ] **Matrix-Check:** Trage das neue Feature in die Kompatibilitäts-Matrix (Abschnitt 1) ein. Prüfe gegen ALLE 4 Tone-Presets und BEIDE IntroFocus-Zustände. Markiere Konflikte explizit.
- [ ] **Ownership-Check:** Bestimme den Owner für jede Schicht (Store-Reset, UI-Guard, Prompt-Builder-Sektion, Judge-Kriterium, Post-Processor-Strip). Dokumentiere in Abschnitt 2.
- [ ] **Tag-Check:** Wenn das Feature interne Steuer-Tags einführt (z.B. `[TAG]...[/TAG]`): Füge den Strip-Regex in `generateCoverLetter()` UND `fixParagraph()` hinzu. Unconditional.
- [ ] **Judge-Sync:** Wenn der Judge das Feature bewerten soll: Stelle sicher, dass der Judge die Bewertung ÜBERSPRINGT wenn `optInModules.X === false`. Kein False-Negative bei deaktiviertem Feature.
- [ ] **Cross-Feature-Check (NEU):** Prüfe Abschnitt 0.1 — berührt das neue Feature eine Forbidden File? Wenn ja: Impact-Analyse + Freigabe erforderlich.

---

## 4. Feature-Silo: Certificates (Weiterbildung)

> **Added:** 2026-03-03 | **Owner:** `certificates-pipeline.ts` + `certificate-kanban-board.tsx`

### 4.1 Erlaubte Dateien (Scope)

| Datei | Rolle |
|---|---|
| `lib/inngest/certificates-pipeline.ts` | Backend — 3-Phase Pipeline (Gap → Perplexity → Synthese) |
| `components/certificates/certificate-kanban-board.tsx` | Frontend — Kanban-Board, Polling, State |
| `components/certificates/certificate-card.tsx` | Frontend — Einzelne Karte |
| `app/api/certificates/generate/route.ts` | API — Trigger + Idempotenz |
| `app/api/certificates/[jobId]/route.ts` | API — Status-Abfrage + Stale-Detection |
| `types/certificates.ts` | Types — `CertificateRecommendation`, `CertificateStatus` |

### 4.2 Verbotene Dateien (Sperrzone)

| Datei | Grund |
|---|---|
| `lib/ai/model-router.ts` | SHARED — CV Match + Steckbrief + Certificates |
| `lib/inngest/cv-match-pipeline.ts` | Fremdes Feature |
| `app/dashboard/components/cv-match/*` | Fremdes Feature |
| `lib/inngest/cover-letter-*.ts` | Fremdes Feature |
| `middleware.ts` | System-Level |

### 4.3 Bekannte Patterns

| Pattern | Details |
|---|---|
| DB Column `company_name` | `job_queue` hat `company_name`, NICHT `company` |
| Stale Processing | GET-Route prüft `updated_at > 5min` → `failed` Response |
| URL Fallback | `applyUrlFallback()` nach HEAD-check (§10) — 14 Provider |
| State Persist | `initialData` + `onDataLoaded` Props überleben Tab-Wechsel |
| Parallel Perplexity | `Promise.allSettled()` statt `for...of` in Phase 2 |
>>>>>>> 5db9f9b (docs: update CLAUDE.md v2.4, FEATURE_COMPAT_MATRIX (Certificates silo), MASTER_PROMPT_TEMPLATE (Forbidden Files))

---

## 5. Feature-Silo: Ehrenamt (Volunteering)

> **Added:** 2026-03-04 | **Owner:** `volunteering-scraper.ts` + `volunteering/page.tsx`

### 5.1 Erlaubte Dateien (Scope)

| Datei | Rolle |
|---|---|
| `app/dashboard/volunteering/*` | Frontend — Hub Page |
| `app/api/volunteering/*` | API — Opportunities, Bookmarks, Match, Votes |
| `components/volunteering/*` | Frontend — OpportunityCard, TestimonialsWall, CategoryVote, SmartMatchBanner |
| `lib/inngest/volunteering-scraper.ts` | Backend — Weekly Scraper Cron |
| `lib/services/volunteering-scraper-service.ts` | Backend — Source Parsers |
| `types/volunteering.ts` | Types — Opportunity, Bookmark, Vote |
| `supabase/migrations/20260304_volunteering_tables.sql` | DB Schema |

### 5.2 Verbotene Dateien (Sperrzone)

| Datei | Grund |
|---|---|
| `lib/ai/model-router.ts` | SHARED — CV Match + Steckbrief + Certificates |
| `lib/inngest/cv-match-pipeline.ts` | Fremdes Feature |
| `lib/inngest/cover-letter-*.ts` | Fremdes Feature |
| `lib/inngest/certificates-pipeline.ts` | Fremdes Feature |
| `middleware.ts` | System-Level |

### 5.3 Bekannte Patterns

| Pattern | Details |
|---|---|
| Scraper Dedup | Upsert via `url` UNIQUE index (ON CONFLICT DO UPDATE) |
| Smart Match | Rule-based keyword matching from CV, keine AI-Calls |
| RLS | Opportunities: public read. Bookmarks + Votes: user_id-scoped |
| Testimonials | Seed data in Phase 1, user-submitted in Phase 2 |

---

## 6. Feature-Silo: Coaching (Voice Note)

> **Added:** 2026-03-05 | **Owner:** `coaching-service.ts` + `[sessionId]/page.tsx`

### 6.1 Erlaubte Dateien (Scope)

| Datei | Rolle |
|---|---|
| `app/dashboard/coaching/*` | Frontend — Hub + Chat + Analysis Pages |
| `app/api/coaching/*` | API — Session, Message, Complete, Transcribe |
| `components/coaching/*` | Frontend — VoiceConsentModal |
| `hooks/use-voice-recorder.ts` | Frontend — Recording Hook |
| `lib/services/coaching-service.ts` | Backend — Conversation Flow |
| `lib/services/coaching-gap-analyzer.ts` | Backend — CV-vs-Job Analyse |
| `lib/inngest/coaching-report-pipeline.ts` | Backend — Feedback Report |
| `lib/prompts/coaching-system-prompt.ts` | Backend — Round-specific Prompts |
| `types/coaching.ts` | Types — ChatMessage, Session, Dossier |
| `supabase/migrations/20260304_coaching_sessions.sql` | DB Schema |

### 6.2 Verbotene Dateien (Sperrzone)

| Datei | Grund |
|---|---|
| `lib/ai/model-router.ts` | SHARED — Coaching nutzt isolierten Anthropic Client |
| `lib/inngest/cv-match-pipeline.ts` | Fremdes Feature |
| `lib/inngest/cover-letter-*.ts` | Fremdes Feature |
| `lib/inngest/certificates-pipeline.ts` | Fremdes Feature |
| `middleware.ts` | System-Level |

### 6.3 Bekannte Patterns

| Pattern | Details |
|---|---|
| Isolierter AI Client | Eigener `Anthropic({ apiKey })` statt model-router.ts |
| Voice Transcription | OpenAI Whisper API, Audio nicht gespeichert (DSGVO) |
| DSGVO Consent | `localStorage` key `pathly_voice_consent`, einmaliges Popup |
| 60s Recording Limit | Hard timeout im Frontend, auto-stop + auto-submit |
| Halluzinations-Filter | Backend-seitig bekannte Whisper-Patterns gefiltert |
| Safari Compat | `MediaRecorder.isTypeSupported()` für MIME-Auswahl |

---

## 7. Feature-Silo: Video Script Studio

> **Added:** 2026-03-15 | **Owner:** `video-script-studio.tsx` + `scripts/generate/route.ts`

### 7.1 Erlaubte Dateien (Scope)

| Datei | Rolle |
|---|---|
| `app/dashboard/components/workflow-steps/video-script-studio.tsx` | Frontend — Parent Container |
| `app/dashboard/components/workflow-steps/script-studio/*` | Frontend — ModeToggle, BlockEditor, KeywordSidebar, ScriptPreview |
| `app/dashboard/components/workflow-steps/step-5-video.tsx` | Frontend — Integration (SHARED mit Video Upload) |
| `app/api/video/scripts/*` | API — Generate, Save, Load |
| `supabase/migrations/20260315_video_scripts.sql` | DB Schema |

### 7.2 Verbotene Dateien (Sperrzone)

| Datei | Grund |
|---|---|
| `lib/ai/model-router.ts` | SHARED — Video nutzt isolierten Anthropic Client |
| `lib/inngest/cv-match-pipeline.ts` | Fremdes Feature |
| `lib/inngest/cover-letter-*.ts` | Fremdes Feature |
| `lib/inngest/certificates-pipeline.ts` | Fremdes Feature |
| `middleware.ts` | System-Level |

### 7.3 Bekannte Patterns

| Pattern | Details |
|---|---|
| Isolierter AI Client | Eigener `Anthropic({ apiKey })` statt model-router.ts |
| Keyword Reuse | `ats_keywords` + `buzzwords` aus `job_queue` — kein neuer Extract |
| 60s Recording Limit | Shared mit `step-5-video.tsx` (Coaching-Pattern) |
| Safari Compat | `MediaRecorder.isTypeSupported()` für MIME-Auswahl |
| State Management | `useReducer` lokal im Parent, kein globaler Store |

