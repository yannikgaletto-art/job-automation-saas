# RESET PLAN 2026-04-28 — CV Pipeline auf Antigravity-Stand

> **Ziel:** Der CV-Optimizer ist Pathlys Herzstück. Er ist heute objektiv schlechter als am 21.04.2026.
> Wir setzen den Code zurück auf den Antigravity-Stand und bauen User-Edit-First darauf.
>
> **Entscheidungen vom User (Yannik) am 28.04.2026:**
> - Reset zurück auf Commit `9ddf426` (21.04.2026, "robuste OCR-Parsing-Fixes — Sprachen, Orphan-Header, Datumsmarker in Role")
> - Selektive Cherry-Picks für DSGVO + Single-CV (siehe unten)
> - Danach User-Edit-First-UI als Stabilität-Anker
> - Branch: `cv-reset` von `9ddf426`
> - Keine `git push --force` auf vorhandene Branches
> - main bleibt unangetastet, Vercel-Preview = `cv-reset`

---

## Strategie in einem Satz

**Reset auf 21.04.2026, dann nur die Architektur-Verbesserungen behalten die wirklich gebraucht werden, alles Pflaster-artige verwerfen.**

---

## Was behalten wird (Cherry-Pick-Liste)

Nach Audit der 54 Commits seit 21.04.2026 sind **nur diese Themen** essenziell:

### Kritisch (Sicherheit, Compliance, Datenintegrität)

| Commit-Range | Thema | Warum behalten |
|---|---|---|
| `7b9ee97` | Privacy Phase 2 (Zero-Data-Leak PII-Architektur) | DSGVO Art. 25, irreversibler Wert |
| `c5e9e65` | Referral FK-Cascade-Fix | Blocks user deletion, kritisch |
| `55bebef` + `245b051` + `d388e4a` + `fdb25d2` | Inngest CVE-Upgrade v3 → v4 | CVE-Fix für SDK 3.22-3.53.1 |
| `8537940` | Trial-Hardening + 9 API-Cost-Leaks | Free-Trial-Economics, Stripe-Integration |
| `6e84044` + `37a8aca` + `91866f2` + `6a65225` + `3ec6920` | Referral-Notification + CSP-Fix für Storage | Production-Bugs |

### Architektur-Verbesserung (wenn sie ohne Pflaster-Wellen sauber portiert werden kann)

| Commit-Range | Thema | Bedingung |
|---|---|---|
| `830dbc5` + `caa03b8` + `e8daca6` + `c9467ef` + `67c4296` + `35bcdd0` + `c3207df` + `61db145` + `44c7091` + `91f5b2d` | Single-CV-Migration (Phasen 0-11) | Behalten, weil sie strukturell die Multi-CV-Sync-Pfade eliminiert. Ohne sie kommt der Mischmasch zurück. |
| `15b3f6a` | Mistral → Haiku Cleanup | Modell-Routing-Konsolidierung |
| `f9454fc` | Profil-Tab-Migration | UX-Verbesserung, klein |

---

## Was NICHT mit zurückgenommen wird (Verwerfen-Liste)

**Alle 18 CV-Parser-Pflaster-Wellen werden verworfen.** Konkret:

```
204fe8a Welle 2 (parser dedup/recovery + optimizer length-cap + 3-pages removal + toast)
73eec4b Welle 1.5 (strip German module grades from skills)
0d5d92f Welle 1 (UX-Hint master CV kept)
398fd89 Phase 9 (1-page option PageMode toggle)
317f75e Phase 8 (name-stop-list + entity-add-guard + edu-grade-strip)
2ac1d55 Phase 9 PII-Sanitizer (city+common-noun pairs)
b84b357 Phase 9 (first upload becomes master)
dad54a7 Phase 9 (fail-safe lookup + top-level import)
0da0fb1 Welle D + F (Valley→ATS label + bullet-aware validator)
7fd2b9e Welle E (2-3-Seiten-Garantie via PageMode)
55c4313 Welle C (Re-Parse-Button via syncMasterCvFromDocument force)
4aeed14 Phase 6 (Cert-Roundtrip-Recovery raw-section walk)
8cd6941 Phase 7 (Summary-Add-Drop-Bug + sanitizer pure function)
839d002 Phase 5.8 (Tier-1 PII fallback email/phone + master health-check)
f01d2c5 Phase 5 (fuzzy role recovery + edu bullets + smart name fallback)
3f2bd40 Sub-Bugs 1.A LITE + 1.B + 1.C (DEV/PROD parity, translator hardening, lang guard)
8a65f2b Welle A.6+A.7+A.8 (proficiency cleanup, skill-group split, cert-name validator)
1e6a166 Welle A.5 (validateDescriptionsAgainstRawText)
94e44fc Phase 4 Welle A (language recovery + skills/certs cleanup)
ba2e51d Hardening Phase 1-3.1 + ATS-Anti-Halluzination
46bb96b Phase 2 Mischmasch-Fix + 18-change cap
0e371ae Read-time Sanitizer für persistente OCR-Artefakte
6463f2d Welle G (sync-extraction failures in metadata)
2e162c9 Welle B (CV-Snapshot pinning) — wird durch Single-CV-Migration redundant
```

**Begründung:** Diese 18 Pflaster wollten LLM-Output-Variance kompensieren. Das war architektonisch falsch. Stattdessen wird Variance durch User-Edit aufgefangen (siehe Phase 2 unten).

---

## Reset-Workflow für den nächsten Agenten

### Schritt 0: Lessons-Learned lesen
Lies `directives/LESSONS_LEARNED_2026-04-28.md` ende-zu-ende, BEVOR du den ersten Befehl ausführst.

### Schritt 1: Branch anlegen

```bash
git checkout 9ddf426
git checkout -b cv-reset
```

Verifikation:
```bash
wc -l lib/services/cv-parser.ts
# muss 419 sein
```

### Schritt 2: Critical Cherry-Picks

In dieser Reihenfolge (Konflikte mit `git mergetool` lösen, NICHT mit `--ours` / `--theirs` blind):

```bash
# Privacy Phase 2 (DSGVO)
git cherry-pick 7b9ee97

# Referral-Cascade + FK-Fix
git cherry-pick c5e9e65

# Inngest CVE-Upgrade (Reihenfolge wichtig)
git cherry-pick 55bebef
git cherry-pick 245b051
git cherry-pick d388e4a
git cherry-pick fdb25d2

# Trial-Hardening + API-Cost-Leaks
git cherry-pick 8537940

# Referral-Notification + CSP
git cherry-pick 6e84044 37a8aca 91866f2 6a65225 3ec6920

# Profil-Tab
git cherry-pick f9454fc

# Mistral → Haiku Cleanup
git cherry-pick 15b3f6a
```

Nach jedem Cherry-Pick: `npm run build && npx tsc --noEmit`. Bei Failure: STOP, User fragen.

### Schritt 3: Single-CV-Migration in einem Block

```bash
# Phase 0 → 11
git cherry-pick 830dbc5
git cherry-pick caa03b8
git cherry-pick e8daca6
git cherry-pick c9467ef
git cherry-pick 67c4296
git cherry-pick 35bcdd0
git cherry-pick c3207df
git cherry-pick 61db145
git cherry-pick 44c7091
git cherry-pick 91f5b2d
```

Konflikte sind hier wahrscheinlich (cv-parser.ts hat sich seit `9ddf426` nicht verändert in diesem Branch, aber die Cherry-Picks wurden gegen einen anderen Stand geschrieben). Lösung: für jeden Konflikt im cv-parser.ts den HEAD-Stand (`--ours`) wählen, weil wir die Pflaster nicht zurückbringen wollen. Der Optimizer-Sanitizer-Code aus den Cherry-Picks bleibt.

### Schritt 4: Verifikation Reset-Stand

```bash
wc -l lib/services/cv-parser.ts
# Erwartet: 419 plus minimaler Privacy-Phase-2-Patch, also ~430-450
```

```bash
npm run build
npx tsc --noEmit
npx jest --no-coverage --testPathIgnorePatterns="inngest/health"
```

Alle drei müssen clean sein.

### Schritt 5: User-Edit-First-UI bauen (separate Phase)

Nicht im Reset-Branch. Neuer Branch `cv-edit-first` von `cv-reset`.

Kernidee:
1. CV wird hochgeladen
2. Parser (1 LLM-Call mit strict JSON Schema, kein Translator, keine Post-Processors)
3. **User sieht Parser-Output in einem inline-editierbaren Form auf `/dashboard/profil`**
4. User korrigiert Stationen, Daten, Bullets, Education, Zertifikate die nicht stimmen
5. User klickt "Speichern" → Master-CV wird aus User-Edit gebaut, nicht aus reinem LLM-Output
6. Optimizer arbeitet auf User-Validated-CV, mit eingeschränktem Scope (nur Bullets neu schreiben, keine Stationen-Reihenfolge, keine Identity-Felder)

Zeitschätzung: 5-7 Werktage.

---

## Forbidden Files (während Reset)

- `middleware.ts`
- `lib/ai/model-router.ts`
- `supabase/migrations/*` (existing) — die Single-CV-Migration ist bereits drin

---

## Test-Gate vor Vercel-Preview-Push

- `npx tsc --noEmit` clean
- `npx jest --no-coverage` 100% (außer pre-existing inngest/health flake)
- `npm run build` clean
- Manueller Smoke-Test: CV hochladen, Output anschauen, Optimizer laufen lassen, Output anschauen
- Vergleich Output-Qualität gegen den Antigravity-Output von 21.04.2026 (User hat das mental als Referenz)

---

## Was nicht passieren darf

- Keine Pflaster-Welle auf cv-parser.ts während des Resets
- Keine "ich fix das schnell"-Edits außerhalb der Cherry-Pick-Liste
- Kein git push --force
- Kein --no-verify
- Wenn der User sagt "klappt immer noch nicht": LESSONS_LEARNED.md aufschlagen, Architektur-Frage stellen, NICHT eine 19. Welle starten
