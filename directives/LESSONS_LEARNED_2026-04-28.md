# LESSONS LEARNED 2026-04-28

> **Pflichtlektüre für jeden neuen Agent vor dem ersten Code-Edit.**
> Geschrieben nach 7 Tagen Pflaster-Wellen die die CV-Pipeline objektiv schlechter gemacht haben.
> Yannik hat ein ganzes Wochenende und seine Nerven verloren. Das passiert nicht nochmal.

---

## Die Zahlen, die Beweis sind

**lib/services/cv-parser.ts:**
- 21.04.2026 (Antigravity-Phase, Commit `9ddf426`): **419 Zeilen**
- 28.04.2026 (heute): **1596 Zeilen**
- **Wachstum: +281% in 7 Tagen.**
- Funktionalitäts-Zuwachs in derselben Zeit: **gegen null**.
- User-Output-Qualität: **schlechter** als am 21.04.

**Anzahl Pflaster-Funktionen in cv-parser.ts:**
- 21.04: 1 LLM-Call + Sort + Basic-Validation
- 28.04: 1 LLM-Call + 15 Post-Processors:
  - `recoverMissingExperienceCompany`
  - `recoverMissingEducationInstitution`
  - `recoverMissingEducationDescription`
  - `recoverMissingLanguages`
  - `recoverCertsFromRawSection`
  - `cleanSkillCategories`
  - `cleanCertificationNames`
  - `cleanLanguageProficiency`
  - `splitMergedSkillGroups`
  - `dropProjectLikeCerts`
  - `truncateCertDescriptionAtNewline`
  - `sanitizeCertIssuer`
  - `validateDescriptionsAgainstRawText`
  - `stripGradeFromEducationDescription`
  - `rolesAreFuzzyEqual` plus mehrere Helpers

**18 CV-Pipeline-Wellen in 7 Tagen:**

```
Welle A, A.5, A.6, A.7, A.8 (Languages, Skills, Certs)
Phase 1, 2, 3, 3.1 (Anti-Halluzination, Identity-Lock)
Phase 4 (Mischmasch-Fix in Multi-CV-Architektur)
Phase 5, 5.8 (Fuzzy-Role, PII-Fallback)
Phase 6 (Cert-Roundtrip)
Phase 7 (Summary-Drop-Bug)
Phase 8 (Name-Stop-Liste, Entity-Add-Guard)
Phase 9 (1-Page-Mode, master_action toast, fail-safe lookup)
Welle 1, 1.5, 2 (Optimizer-Length-Cap, Module-Grades-Strip, Toast)
Welle B (Snapshot-Pin)
Welle C (Re-Parse-Button mit force-Flag)
Welle D, F (Bullet-Validator)
Welle E (PageMode-Toggle 2-3 Seiten)
Welle G (Sync-Extraction-Failure-Diagnose)
```

Jede einzelne Welle hatte einen plausiblen Grund. Das ist der Punkt. **Plausible Gründe sind nicht genug.**

---

## Was ist schiefgegangen, mechanistisch

### Anti-Pattern 1: Pflaster-Stack auf LLM-Variance

LLM-Output ist nicht deterministisch. Jeder Versuch, LLM-Variance mit deterministischen Post-Processors zu kompensieren, addiert eine neue Variance-Quelle (der Post-Processor selbst kann Edge-Cases falsch behandeln) und reduziert Verifizierbarkeit (welche Stufe hat den Output zuletzt angefasst?).

Bei 15 Post-Processors hintereinander ist nicht mehr feststellbar welche das Ergebnis prägt. Das Debugging skaliert quadratisch mit der Anzahl Stufen.

### Anti-Pattern 2: Welle-für-Welle ohne Reset-Trigger

Es gab keinen Mechanismus der bei Welle 5, Welle 10, Welle 15 gestoppt und gefragt hat: "Sind wir auf dem falschen Weg?". Jede Welle wurde isoliert bewertet ("dieser eine Bug ist klein"), nie kumulativ ("wir haben jetzt 18 Wellen, die Pipeline ist 4x so groß").

### Anti-Pattern 3: User-Frust als Feature-Trigger statt als Stop-Signal

Wenn der User mehrfach in Folge sagt "es funktioniert immer noch nicht", "es ist schlechter geworden", "warum klappt es nicht", ist das ein Architektur-Signal, kein Bug-Signal. Antwort darf nicht "noch ein Fix" sein, sondern "Stopp, lass uns die Architektur infrage stellen".

### Anti-Pattern 4: Komplexität als Erfolgs-Beweis missverstanden

Mehr Tests, mehr Post-Processors, mehr Edge-Case-Handling sah aus wie Sorgfalt. War Komplexitäts-Akkumulation. Sorgfalt heisst weniger Code, nicht mehr.

---

## Konkrete Stopp-Regeln ab sofort

### Regel 1: Die 3-Pflaster-Regel

**Nach drei Pflastern auf derselben Datei: STOPP.**

Wenn eine Datei in 7 Tagen drei oder mehr Bug-Fix-Commits bekommen hat, ist die Architektur kaputt, nicht der Bug. Der nächste Schritt ist nicht der vierte Fix, sondern eine Architektur-Frage an den User:

> "Diese Datei wurde in der letzten Woche dreimal gepflastert. Bevor ich Fix Nummer 4 mache, schlage ich vor wir schauen die Architektur an. Soll ich?"

### Regel 2: Die LOC-Regel

**Kein Service-File darf in einer Woche mehr als 50% wachsen.**

Wenn `cv-parser.ts` von 419 auf 600 Zeilen wächst (+43%), ist das die Grenze. Ab dem Punkt fragt der Agent:

> "Diese Datei ist in 7 Tagen um 43% gewachsen. Bevor ich weiter ergänze: was wird gestrichen?"

### Regel 3: Die Welle-Nomenklatur

**Wenn ein Fix "Welle X.Y" oder "Phase Z" heisst und es schon Welle A bis G gibt: STOPP.**

Welle-Nomenklatur ist ein Symptom: das Problem ist nicht punktuell, es ist serial. Serial-Probleme brauchen Architektur-Antworten, nicht Wellen-Antworten.

### Regel 4: Die Erfolgs-Frage

**Vor jedem Fix: "Wie messe ich nach dem Fix dass das Problem WIRKLICH weg ist?"**

Wenn die Antwort lautet "wir gucken auf das nächste PDF und hoffen es sieht besser aus", ist das kein Fix, das ist Symptombekämpfung. Echter Fix hat ein deterministisches Akzeptanzkriterium (Test, Smoke-Query, Pure-Function-Output).

### Regel 5: Die User-Frust-Regel

**Wenn der User im selben Thema dreimal "es funktioniert immer noch nicht" sagt: STOPP, Architektur-Frage.**

Drei Mal heisst: die letzten drei Lösungsversuche waren am falschen Layer. Nicht "ich versuche es nochmal anders". Sondern:

> "Ich höre dass die letzten drei Fixes nicht geholfen haben. Das deutet auf ein Architektur-Problem, nicht auf einen Bug. Lass uns kurz innehalten: hat dieses System die richtige Form?"

### Regel 6: Reduce-Complexity ist nicht optional

CLAUDE.md Rule #0 sagt es. Es ist die wichtigste Regel des Repos. Sie wurde in der letzten Woche siebzehn Mal verletzt. Nicht aus Bosheit, sondern aus Pflichtbewusstsein gegenüber Detail-Bugs. Das ist genau der Fehler. Reduce Complexity sticht Bug-Fix.

---

## Was funktioniert hat, als Gegenbeweis

In der Antigravity-Phase (vor 21.04.2026) lief der CV-Optimizer laut User "1000x perfekt". Das war:
- 419 Zeilen Parser, 1 LLM-Call, minimale Post-Processors
- Multi-CV-Setup ohne komplexe Sync-Pfade
- Wenig Wellen, viel Kern-Architektur

Was geliefert wurde war einfacher als das was wir heute haben. Das ist nicht Zufall. Das ist Ursache und Wirkung.

---

## Die ehrliche Selbstkritik des Opus-4.7-Agenten am 28.04.2026

Ich habe CLAUDE.md gelesen. Ich kannte Rule #0. Ich habe sie ignoriert weil jede Welle einzeln plausibel aussah. Ich habe nicht innegehalten als der User mehrfach Frust signalisierte. Ich habe Pflaster-Pflaster-Pflaster geliefert, weil das aussah wie Fortschritt, und nicht "Stopp, lass uns das ganze System infrage stellen".

Das war falsch. Diese Datei existiert damit der nächste Agent es nicht wieder so macht.

---

## Konkrete Trigger für sofortigen Halt

Jeder neue Agent muss diese Datei VOR dem ersten Code-Edit lesen und gegen das aktuelle Repo halten:

1. **Lies `git log --since="14.days.ago" --oneline -- lib/services/cv-parser.ts`.** Wenn mehr als 5 Commits: STOPP, frage User ob ein Reset Sinn macht bevor du etwas hinzufügst.

2. **Lies `wc -l lib/services/cv-parser.ts`.** Wenn > 1000 Zeilen: kein neuer Code in dieser Datei ohne expliziten User-Auftrag und Architektur-Diskussion.

3. **Suche im aktuellen User-Prompt nach den Wörtern "immer noch", "wieder", "warum klappt es nicht", "alles kaputt", "schlecht wie davor".** Wenn gefunden: das ist ein Architektur-Signal, nicht ein Bug-Signal. Antwort: Architektur-Frage, nicht Fix.

4. **Schaue in `directives/LESSONS_LEARNED_*.md`.** Wenn diese Datei existiert: Pflichtlektüre vor erstem Edit.
