# PROMPT FÜR DEN NÄCHSTEN AGENTEN — CV-Pipeline-Reset

> Kopiere den Inhalt unter "═══ START PROMPT ═══" als ersten User-Prompt in einen frischen Chat mit dem nächsten Agenten.
> Nichts auslassen, nichts kürzen, nichts paraphrasieren.

---

═══ START PROMPT ═══

Du bist der nächste Agent für Pathly V2.0. Dies ist ein Reset-Auftrag, kein Feature-Bau. Lies die folgenden 5 Dateien ende-zu-ende, BEVOR du irgendeinen Befehl ausführst:

1. `AGENT_ONBOARDING.md` (Repo-Root) — System-Übersicht
2. `CLAUDE.md` (Repo-Root) — Insbesondere Rule #0 ganz oben, neu hinzugefügt am 28.04.2026
3. `directives/LESSONS_LEARNED_2026-04-28.md` — Pflichtlektüre. Erklärt warum dieser Reset stattfindet
4. `directives/RESET_PLAN_2026-04-28.md` — Schritt für Schritt was du tun sollst
5. `directives/FEATURE_COMPAT_MATRIX.md` — Forbidden Files

═══ KONTEXT IN EINEM ABSATZ ═══

Der Vorgänger-Agent (Opus 4.7) hat in den letzten 7 Tagen 18 Pflaster-Wellen auf die CV-Pipeline gelegt. Die Datei `lib/services/cv-parser.ts` ist von 419 Zeilen (21.04.2026) auf 1596 Zeilen (28.04.2026) gewachsen, also 281% in einer Woche. Die User-sichtbare Output-Qualität ist messbar schlechter geworden, nicht besser. Der User Yannik hat ein Wochenende und seine Nerven verloren. Die Antigravity-Phase davor lief gut. Wir resetten den Code auf den Antigravity-Stand und cherry-picken nur die wirklich nötigen Architektur-Verbesserungen (Privacy Phase 2, Single-CV-Migration, Inngest-CVE-Fix, Stripe-Hardening). Das ist explizit Yanniks Entscheidung vom 28.04.2026.

═══ DEINE MISSION ═══

1. **Phase A: Reset auf 21.04.2026.** Folge `directives/RESET_PLAN_2026-04-28.md` Schritt für Schritt. Branch `cv-reset` von Commit `9ddf426`.

2. **Phase B: Selektive Cherry-Picks.** Nur die Commits aus der "Cherry-Pick-Liste" im RESET_PLAN. Alle 18 Pflaster-Wellen bleiben verworfen.

3. **Phase C: Test-Gate.** `npx tsc --noEmit`, `npx jest --no-coverage`, `npm run build`. Alle clean.

4. **Phase D: Vorbereitung für User-Edit-First.** Implementation kommt in einem separaten Branch danach. In diesem Reset-Chat NUR Vorbereitung (Plan-Doc), kein UI-Code.

═══ KRITISCHE STOP-REGELN AUS LESSONS_LEARNED ═══

**Diese Regeln darfst du nicht brechen, auch nicht "nur kurz":**

1. Wenn eine Datei in 7 Tagen 3+ Bug-Fix-Commits hatte: STOPP. Architektur-Frage an User. Kein Fix #4.
2. Wenn ein Service-File in einer Woche um mehr als 50% wächst: STOPP. Was wird gestrichen?
3. Wenn ein Fix "Welle X" oder "Phase Y" heisst und A bis G existieren: STOPP. Architektur-Frage.
4. Vor jedem Fix: "Wie messe ich deterministisch dass das Problem weg ist?". Ohne Antwort kein Fix.
5. Wenn User dreimal "klappt nicht" sagt: STOPP. Architektur-Frage, nicht weiter pflastern.
6. Reduce Complexity sticht Bug-Fix. Immer.

═══ KOMMUNIKATIONS-STIL MIT YANNIK ═══

- Sprache: Deutsch
- Yannik ist nicht-technisch in DevTools/CLI: bei UI-Anweisungen nummerierte Klickpfade
- Fachbegriffe kurz glossen ("DB-Index = Datenbank-Beschleunigung")
- Em-Dashes (— oder –) sind in user-facing Strings VERBOTEN. Nutze Doppelpunkt oder " - " (ASCII-Hyphen-Spaces). Auch in Code-Kommentaren strenge Disziplin
- Bei Erfolgswahrscheinlichkeits-Schätzungen: ehrlich, nicht 100%
- Bei Frust: empathisch, faktisch, nicht defensiv
- Pflicht: vor jedem unwiderruflichen Schritt (DB-Migration, force-push, Cherry-Pick-Block) explizite User-Freigabe abwarten

═══ FORBIDDEN ═══

- KEINE neuen Pflaster auf cv-parser.ts. Auch nicht "kurz". Auch nicht "nur diese eine Sache".
- KEINE 19. Welle. Wenn du den Drang spürst: stoppe, lies LESSONS_LEARNED noch einmal.
- KEIN git push --force
- KEIN --no-verify oder --no-gpg-sign
- KEINE Forbidden Files anfassen ohne explizite Freigabe (siehe FEATURE_COMPAT_MATRIX.md)
- KEINE Mocks für DB-Tests
- KEIN halbfertiger Code mit TODO-Kommentaren als Commit
- KEIN Pre-Push ohne 5-Persona-Pentest

═══ ABSCHLUSS ═══

Nach Phase D liefere Yannik:
1. Branch-Übersicht (`git log --oneline cv-reset` mit allen Cherry-Picks)
2. wc -l Beweis dass cv-parser.ts wieder unter 500 Zeilen ist
3. Test-Gate Output
4. Konkrete Verifikations-Schritte für Vercel-Preview
5. Plan für die User-Edit-First-Phase als separates Dokument
6. KEIN Push ohne Yanniks explizite Freigabe

Dein erster Befehl im Chat ist: lies die 5 Dateien aus dem oberen Block, dann schreibe Yannik eine 5-Zeilen-Zusammenfassung was du verstanden hast und was du als ersten Schritt vorschlägst. Auf Yanniks "Go" startest du Phase A.

═══ ENDE PROMPT ═══

---

## Hinweise nur für dich, Yannik (nicht in den Prompt kopieren)

- Der Prompt ist absichtlich lang. Er enthält den ganzen Kontext den der neue Agent braucht damit du nicht alles nochmal erklären musst.
- Wenn der neue Agent mit einer "Welle 19" oder "Phase 12" anfängt: er hat LESSONS_LEARNED nicht gelesen. Aufgabe abbrechen, neuen Chat starten, Prompt neu kopieren.
- Wenn der neue Agent etwas vorschlägt das nicht im RESET_PLAN steht: vor dem "Go" prüfen ob es nicht doch ein neues Pflaster ist.
- Vorgeschlagenes Modell für den nächsten Chat: Sonnet 4.6 (schneller, billiger, in dieser Aufgabe ausreichend, weniger Drang zu "noch ein Fix"). Opus 4.7 ist nicht zwangsläufig besser für Reset-Arbeit.

Viel Erfolg.
