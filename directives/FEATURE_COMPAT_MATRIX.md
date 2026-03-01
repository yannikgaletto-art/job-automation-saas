# FEATURE COMPATIBILITY MATRIX & ARCHITECTURE OWNERSHIP

> **Authority:** CLAUDE.md v2.3 | BINDEND
> **Last Updated:** 2026-02-28 (QA Report Blind Spots #1–#4)
> **Scope:** OptInModules × TonePresets × IntroFocus — Source of Truth

---

## 1. The Compatibility Grid

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

## 2. Architecture Ownership — Rules of Engagement

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
