# ATS-Keyword Härtung — Test Plan (alle 4 Pipelines)

**Stand:** 2026-04-25
**Status:** Phase 1 + 1.1 + Leak-Fixes + Pipeline-Parity deployed (lokal)
**Owner:** Yannik

---

## Kontext

`job_queue.buzzwords` ist die Single-Source-of-Truth für ATS-Keywords. Sie wird von **vier verschiedenen Code-Pfaden** gefüllt — jeder mit eigener Extraktions-Logik:

| # | Pfad | Trigger | LLM | Filter eingebaut |
|---|---|---|---|---|
| 1 | `app/api/jobs/search/process/route.ts` | Dashboard → Job Suche → "Steckbrief erstellen" | Claude Haiku | ✅ `filterAtsKeywords()` |
| 2 | `app/api/jobs/ingest/route.ts` | Dashboard → "Job manuell hinzufügen" | Mistral Small | ✅ `filterAtsKeywords()` (+ Cache-Read-Hygiene) |
| 3 | `app/api/jobs/import/route.ts` | **Browser Extension** → Job-Page → "Save" | Claude (Mistral fallback) | ✅ `filterAtsKeywords()` |
| 4 | `lib/inngest/extract-job-pipeline.ts` | Async-Backup, falls Sync-Extract fehlschlug | Mistral | ✅ `filterAtsKeywords()` |

**Filter-Service:** [lib/services/ats-keyword-filter.ts](../../lib/services/ats-keyword-filter.ts) (Pure-Function, 123 Jest-Tests).

---

## Was der Filter macht

1. **Stop-List** (130+ Begriffe in 5 Kategorien — siehe `docs/ATS_Keywords.docs.pdf`):
   - Generische Soft-Skill-Floskeln (Teamfähigkeit, Eigenverantwortung)
   - Benefits / Arbeitsbedingungen (Bürozeit, Homeoffice, Bonus)
   - Bedeutungslose Adjektive (dynamisch, innovativ, modern)
   - Filler-Phrasen (Wir bieten, Du bringst mit)
   - Überholte Tech-Terme (MS Office Suite, Web 2.0, EDV-Kenntnisse)

2. **Adjektiv-Prefix-Detection** (Leak #1 Fix):
   - "Hohe Flexibilität" → core "flexibilität" → blockiert
   - Pattern: `^(hohe|hohes|ausgeprägte|starke|sehr gute|...)\s+(stop-word)$`

3. **Komposita-Suffix-Stripping** (Leak #2 Fix, PDF Sektion 10):
   - "Projektleitungserfahrung" → "Projektleitung"
   - "Buchhaltungskenntnisse" → "Buchhaltung"
   - "Führungskompetenz" → "Führung"
   - Suffixe: `-erfahrung`, `-kompetenz`, `-kenntnisse`, `-fähigkeiten`, `-expertise`, `-verständnis` (mit & ohne Fugen-S)

4. **Length & Format Guards:**
   - 2 ≤ chars ≤ 60
   - max 5 Wörter (Prompt sagt 3, Filter ist lenient)
   - Numbers-only blocked
   - Dedup case-insensitive

---

## Test-Matrix

### Pipeline 1: Dashboard → Job Suche
**Test-Job:** Suche `"Sachbearbeiter Verwaltung"` (typischerweise viele Floskeln).

**Server-Log erwartet:**
```
✅ [Process] Starting pipeline for: ...
✅ [Pipeline] Claude Haiku harvesting...
✅ [Process] ATS-Filter: kept X, removed Y: Bürozeit, Teamfähigkeit, ...
✅ [Process] ATS-Filter: rewrote N compounds: Projektleitungserfahrung→Projektleitung
```

**UI-Check:** Steckbrief → ATS Keywords sollte nur Tools/Methoden/Hard-Skills enthalten.

---

### Pipeline 2: Dashboard → Manueller Eintrag
**Test-Job:** Job-Description manuell eingeben mit absichtlichen Floskeln drin (z.B. "Sie bringen hohe Flexibilität, Teamfähigkeit und Erfahrung mit Bürozeiten mit").

**Server-Log erwartet:**
```
route=jobs/ingest step=normalize_buzzwords count=X (filtered Y/Z)
route=jobs/ingest step=ats_filter removed=Hohe Flexibilität, Teamfähigkeit, Bürozeit, ...
route=jobs/ingest step=ats_filter rewrote=...→...
```

**Cache-Hit erwartet (zweite Eingabe gleicher Description):**
```
route=jobs/ingest step=extraction_cache HIT — reusing N/M buzzwords after filter
route=jobs/ingest step=cache_filter removed=...
```
→ Validiert dass alte (pre-hardening) Cache-Einträge bei jedem Read nochmal gefiltert werden.

---

### Pipeline 3: 🌐 Browser Extension (NEU GETESTET)

**Setup einmalig:**
1. Chrome Extension lokal laden (chrome://extensions → "Unpacked" → `chrome-extension/` Ordner)
2. Extension auf einer Job-Seite öffnen (LinkedIn, Indeed, StepStone, Karriere-Seite eines Unternehmens)
3. Sicherstellen dass Auth-Token gesetzt ist (Login via Dashboard erforderlich)

**Test-Cases:**

| # | URL / Job-Typ | Erwartung |
|---|---|---|
| 3.1 | LinkedIn-Job mit langer Description (Senior Backend Engineer) | 10-15 ATS-Keywords, alle Tools/Methoden, keine Floskeln |
| 3.2 | StepStone-Job für DACH-Floskel-Heavy-Anzeige (Sachbearbeiter, Office Manager) | < 10 starke Keywords, keine "Bürozeit"/"Teamfähigkeit" |
| 3.3 | Job-Anzeige mit deutschen Komposita ("Projektleitungserfahrung", "Buchhaltungskenntnisse") | Keywords zeigen "Projektleitung", "Buchhaltung" — NICHT die Komposita-Form |
| 3.4 | Sehr kurze Job-Description (< 200 Zeichen) | Extension zeigt amber Warning, evtl. wenige Keywords (akzeptabel) |
| 3.5 | Job in Englisch (Anglo-American Tech-Stack) | Keywords wie "TypeScript", "Kubernetes", "PostgreSQL" durchlaufen |

**Server-Log erwartet (im `npm run dev` Terminal):**
```
[<requestId>] route=jobs/import step=ats_filter kept=X removed=Y: <terms>
[<requestId>] route=jobs/import step=ats_filter rewrote=<from>→<to>
```

**Browser-Console (Extension):** keine spezifischen Logs — Filter läuft server-side.

**UI-Check:**
1. Nach "Save" in Extension → Dashboard öffnen → Job in Queue?
2. Steckbrief expandieren → ATS Keywords sehen sauber aus?

---

### Pipeline 4: Inngest Async Extract (Backup)
**Wann triggert:** Wenn Sync-Extract in `import` oder `ingest` fehlschlägt (LLM-Timeout, Mistral 5xx, etc.). Inngest macht Retry mit Mistral.

**Test:**
1. Extension → Job mit sehr langer Description (>10k Zeichen) speichern
2. Sync-Extract könnte timeouten (30s `maxDuration`)
3. Inngest übernimmt im Hintergrund
4. Nach 1-2 Minuten: Server-Log zeigt:
```
[Extract] Job <id> ats_filter kept=X removed=Y: ...
```
5. UI zeigt nach Refresh die gefilterten Keywords

**Schwer zu reproduzieren** — meist genügt es zu wissen dass der Filter dort eingebaut ist. Verifikation per Code-Review:
- [extract-job-pipeline.ts:225-247](../../lib/inngest/extract-job-pipeline.ts#L225)

---

## Regressions-Check (CV Match Pipeline)

Nach jedem Test:
1. Job in Queue → "CV Match starten"
2. Server-Log:
   ```
   [pre-match] Matched X/Y keywords deterministically.
   ```
3. **`Y` sollte deutlich kleiner sein** als pre-Härtung (Garbage ist weg).
4. **`X/Y`-Verhältnis sollte besser sein** (echte CV-Skills matchen jetzt mehr von den verbleibenden Keywords).

---

## Debugging — wenn Garbage durchrutscht

1. **Notiere das exakte Keyword + Job-Titel + Pipeline (1/2/3/4).**
2. Reproduziere lokal mit dem gleichen Job.
3. Schau ins Server-Log: kommt `ats_filter`-Zeile? Welche `removed`/`kept`?
4. Falls Garbage in `kept`:
   - Stop-List in [lib/services/ats-keyword-filter.ts](../../lib/services/ats-keyword-filter.ts) ergänzen
   - Test in `lib/services/__tests__/ats-keyword-filter.test.ts` ergänzen (case + expectation)
   - `npx jest lib/services/__tests__/ats-keyword-filter.test.ts` muss grün bleiben
5. Falls Komposita-Form durchrutscht (z.B. "Personalverantwortungserfahrung"):
   - Suffix in `KOMPOSITUM_SUFFIXES` ergänzen, mit & ohne Fugen-S

---

## Deferred / Out-of-Scope

| Punkt | Warum deferred |
|---|---|
| **SteckbriefPreviewModal mit ATS-Editing** | UX-Eingriff in frisch geshippten Flow. Erst nach 2 Wochen Live-Conversion-Daten. |
| **`ats_keywords` Spalte in DB droppen** | V2.1 Migration. Aktuell nur DEPRECATED-Comment in `database/schema.sql`. |
| **Tests für `pre-match-keywords.ts`** | 2h Aufwand, Eigenständiger CTO-Punkt. Nächster Sprint. |
| **Pipeline-Integration-Tests mit echtem Haiku-Call** | Phase 2. Aktuell nur Unit-Tests auf Filter (Pure-Function). |

---

## Push-Bereitschaft

| Check | Status |
|---|---|
| `npx tsc --noEmit` | ✅ EXIT=0 |
| `npx jest lib/services/__tests__/ats-keyword-filter.test.ts` | ✅ 123/123 |
| 4 Pipelines mit Filter | ✅ alle |
| Security-Review | ✅ keine Findings ≥ Confidence 8 |
| Pipeline 1 (Job Suche) Live-Test | ✅ User getestet (UNITY Consulting, 5 starke Keywords bei kurzer Description) |
| Pipeline 2 (Manueller Eintrag) Live-Test | ✅ User getestet (Andercore, 14 saubere Keywords) |
| Pipeline 3 (Browser Extension) Live-Test | ⏳ **AUSSTEHEND — siehe Test-Cases 3.1-3.5 oben** |
| Pipeline 4 (Inngest Backup) Live-Test | ⏳ Optional, schwer zu triggern; Code-Review akzeptabel |

**Empfehlung:** Pipeline 3 mit 1-2 echten Browser-Extension-Saves testen. Wenn Logs `ats_filter`-Zeilen zeigen und UI sauber ist → push auf Vercel.
