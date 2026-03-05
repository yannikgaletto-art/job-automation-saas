---
Version: 1.0.0
Created: 2026-03-05
Status: AKTIV — Wartet auf Yannik's "Go"
Priority: HIGH — Kernfunktion (Auto-Apply) ist durch brittle CSS-Selektoren gefährdet
---

# 🏗️ AGENT 11.1 — Extension Multi-Browser + Semantisches DOM-Scraping

> **Für Claude Opus:** Du hast Senior Engineer Autonomie. Lies alle Prerequisites vollständig.
> Identifiziere aktiv Lücken, die in diesem Dokument nicht beschrieben sind, und
> kommuniziere sie BEVOR du Code schreibst. Warte nicht auf Anweisungen für Offensichtliches.

---

## ⛔ FORBIDDEN FILES — ABSOLUTE SPERRZONE

```
lib/ai/model-router.ts                     ← SHARED — kein Anfassen
middleware.ts                              ← SYSTEM-LEVEL — nur mit expliziter Freigabe
supabase/migrations/*                      ← DB-SCHEMA — nur via explizite Migration-Tasks
lib/inngest/cover-letter-*.ts              ← Fremdes Feature
lib/inngest/cv-match-pipeline.ts           ← Fremdes Feature
```

**Wenn dein geplanter Fix eine dieser Dateien berühren würde:**
1. STOPP sofort
2. Erkläre dem User WARUM du sie anfassen müsstest
3. Warte auf explizite Freigabe

---

## MISSION

Erweitere die bestehende Plasmo Chrome Extension um Cross-Browser-Kompatibilität (Firefox, Edge als Phase 1)
und ersetze die fragilen hardcodierten CSS-Selektoren in `form_selectors` durch semantisches DOM-Verständnis
via Claude `tool_use`. Die bestehende Selector-Tabelle bleibt als Fallback-Mechanismus vollständig erhalten.

---

## PREREQUISITES — READ FIRST! 🚨

Bevor du EINE Zeile Code schreibst, lies und verarbeite:

1. **`CLAUDE.md`** — "Reduce Complexity!" — MVP first. Kein Over-Engineering.
2. **`ARCHITECTURE.md`** — Aktuelle Extension-Architektur verstehen (Plasmo, Manifest V3, `form_selectors` Tabelle)
3. **`directives/FEATURE_COMPAT_MATRIX.md`** — Abschnitt 2 + 3: Forbidden Files & Cross-Feature-Ownership
4. **`directives/FEATURE_IMPACT_ANALYSIS.md`** — Struktur der Impact Map, die du erstellen musst
5. **`database/schema.sql`** — `form_selectors` Tabelle genau verstehen (Spalten, RLS)
6. **Die bestehenden Extension-Dateien:** Lies alle Dateien im Chrome Extension Verzeichnis systematisch
7. **`directives/AGENT_1.1_JOB_SCRAPING.md`** — Versteht das bestehende Scraping-Pattern

> ⚠️ **Claude Opus Direktive:** Wenn du beim Lesen der Prerequisites Widersprüche
> oder unklare Abhängigkeiten entdeckst, dokumentiere sie in einem "OPEN QUESTIONS"
> Block am Anfang deiner Antwort — bevor du mit der Implementierung beginnst.

---

## IMPACT MAP (von Agent zu verifizieren und ggf. zu ergänzen)

```
## IMPACT MAP — Extension Multi-Browser + Semantisches DOM-Scraping

Upstream:              form_selectors (lesen + als Fallback), job_queue (Bewerbungsdaten lesen),
                       documents (CV-URL für File-Upload), user_profiles (PII-Felder)
Downstream & Side Effects:
                       Chrome Extension Build-Artefakte (neue Browser-Targets),
                       Neue API Route /api/extension/analyze-form (DOM → Claude → Felder)
                       KEIN Breaking Change an bestehenden form_selectors (bleibt als Fallback)
Security/DB:           Neue Route in middleware.ts eintragen (mit Auth-Guard).
                       KEIN neues DB-Schema (form_selectors bleibt unverändert).
                       RLS: Neue API-Route muss user_id aus Auth-Token ableiten.
Contracts berührt:     Chrome Extension ↔ Backend API-Vertrag (neuer Endpoint)
Empty States:          Kein Job geladen → Extension zeigt "Öffne eine Stellenanzeige"
                       Claude-Analyse schlägt fehl → Fallback auf form_selectors (silent)
                       Kein Match in form_selectors → User-Prompt "Feld nicht erkannt"
Component Audit:       Extension-UI (Popup) — bestehende UI wiederverwenden
Breaking Changes:      KEINE — form_selectors Fallback bleibt aktiv
Parallelisierung:      middleware.ts wird berührt → nicht parallel zu anderen Route-Tasks.
                       Extension-Build ist isoliert, kein Konflikt mit Web-App.
```

> ⚠️ **Claude Opus Aufgabe:** Verifiziere diese Impact Map gegen den tatsächlichen Code.
> Ergänze fehlende Upstream-/Downstream-Abhängigkeiten, die du beim Code-Lesen findest.

---

## CURRENT STATE

- ✅ Plasmo Chrome Extension existiert und funktioniert (Manifest V3)
- ✅ `form_selectors` Tabelle mit CSS-Selektoren für bekannte Plattformen
- ✅ Content Script füllt Felder via `document.querySelector(selector.css_selector)`
- ⚠️ Plasmo unterstützt Firefox/Edge nativ — aber Build-Config ist nur für Chrome konfiguriert
- ⚠️ CSS-Selektoren sind fragil (`selectors rot`) — brechen bei Website-Updates
- ❌ Kein semantisches DOM-Verständnis: Claude kennt das Formular nicht
- ❌ Kein Firefox-Build, kein Edge-Build
- ❌ Safari: Nicht in Scope für Phase 1 (Xcode-Packaging erforderlich — separates Projekt)

---

## DEINE AUFGABEN

### 11.1.1: Codebase Audit (Pflicht zuerst)
**Goal:** Verstehe was existiert, bevor du etwas änderst.

- Lies alle Extension-Dateien systematisch
- Identifiziere Chrome-spezifische APIs (`chrome.*`) vs. WebExtensions-Standard (`browser.*`)
- Prüfe das aktuelle `package.json` der Extension auf Plasmo-Build-Scripts
- Liste alle Stellen auf, die `chrome.` nutzen statt des Cross-Browser `browser.`-Namespace
- Dokumentiere deine Findings BEVOR du Änderungen machst

> **Autonomiespielraum:** Wenn du Chrome-spezifische APIs findest, die für Cross-Browser
> problematisch sind, entscheide selbst ob du `webextension-polyfill` einführst oder
> direkt den `browser`-Namespace nutzt. Begründe deine Wahl kurz.

### 11.1.2: Multi-Browser Build Config
**Goal:** Firefox und Edge Builds via Plasmo's nativen Multi-Target-Support aktivieren.

**Constraint:** Chrome-Build darf NICHT brechen. Chrome bleibt Primary Target.

Plasmo Build Targets:
```bash
# In package.json ergänzen:
"build:firefox": "plasmo build --target=firefox-mv2",
"build:edge": "plasmo build --target=edge-mv3",
"build:all": "plasmo build && npm run build:firefox && npm run build:edge"
```

Was zu prüfen ist:
- `permissions` im Manifest: Firefox hat andere Syntax für bestimmte Permissions
- `background` Service Worker: Firefox MV2 nutzt Background Pages statt Service Worker
- `scripting` API: Unterschiede zwischen Chrome MV3 und Firefox MV2

> **Claude Opus:** Wenn du feststellst, dass Firefox MV2 vs. Chrome MV3 fundamentale
> Unterschiede in der Extension-Architektur erfordert, die mehr als 2 Tage Arbeit bedeuten,
> flagge das explizit mit Aufwandsschätzung. Entscheide nicht allein ob wir weitermachen.

### 11.1.3: Semantisches DOM-Scraping (Neue API Route)
**Goal:** Ersetze brittle CSS-Selektoren durch Claude-basiertes Formularverständnis.
Die bestehende `form_selectors` Tabelle bleibt als Fallback.

**Neue Datei:** `app/api/extension/analyze-form/route.ts`

```typescript
// app/api/extension/analyze-form/route.ts
// POST: Empfängt DOM-Snapshot, gibt strukturierte Feldzuordnung zurück

import { anthropic } from '@/lib/ai/client' // bestehender Client — NICHT neu erstellen
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const RequestSchema = z.object({
  domSnapshot: z.string().max(50000), // Bereinigter DOM — kein kompletter HTML-Baum
  platform: z.string().optional(),    // z.B. "linkedin", "stepstone" — für Fallback-Lookup
  jobId: z.string().uuid()
})

export async function POST(request: Request) {
  // 1. Auth-Check (user_id aus Session)
  // 2. Zod-Validation des Request-Body
  // 3. Lade Bewerbungsdaten aus job_queue (name, email, etc.) für diesen User
  // 4. Sende DOM + Bewerbungsdaten an Claude mit tool_use
  // 5. Claude gibt strukturierte Feldzuordnung zurück
  // 6. Bei Claude-Fehler: Fallback auf form_selectors aus DB
  // 7. Return: { fields: [{selector, value}], source: 'claude' | 'fallback' }
}
```

**DOM-Snapshot Strategie im Content Script:**
```typescript
// Nicht den kompletten DOM senden — zu groß und teuer
// Nur: alle <input>, <textarea>, <select>, <label> Elemente
// Mit: id, name, placeholder, type, aria-label, surrounding label text
// Max: 50.000 Zeichen
function buildDomSnapshot(): string {
  const fields = document.querySelectorAll('input, textarea, select')
  return Array.from(fields).map(el => ({
    tag: el.tagName,
    id: el.id,
    name: (el as HTMLInputElement).name,
    type: (el as HTMLInputElement).type,
    placeholder: (el as HTMLInputElement).placeholder,
    ariaLabel: el.getAttribute('aria-label'),
    labelText: findAssociatedLabel(el) // Helper: sucht <label for="id">
  })).slice(0, 100) // Max 100 Felder
  |> JSON.stringify
}
```

**Claude Prompt für Feldzuordnung:**
```
Du analysierst ein Bewerbungsformular. 
Hier sind die verfügbaren Formularfelder:
[DOM_SNAPSHOT]

Hier sind die Bewerbungsdaten des Users:
[USER_DATA: name, email, phone, address, linkedin_url, cv_url]

Gib für jedes User-Datenfeld den korrekten CSS-Selektor aus dem DOM zurück.
Nur Felder zurückgeben die eindeutig zugeordnet werden können.
Format: {"name": "#firstname-field", "email": "input[name='email']"}
```

### 11.1.4: Fallback-Kette im Content Script
**Goal:** Graceful Degradation sicherstellen. Chrome-User dürfen keine Verschlechterung merken.

```typescript
// content-script.tsx — ERGÄNZUNG (nicht Ersatz)
async function fillApplicationForm() {
  let fieldMap: FieldMap | null = null

  // Versuch 1: Semantisches Claude-Matching
  try {
    const snapshot = buildDomSnapshot()
    const res = await fetch('/api/extension/analyze-form', {
      method: 'POST',
      body: JSON.stringify({ domSnapshot: snapshot, jobId: currentJobId })
    })
    if (res.ok) {
      const data = await res.json()
      fieldMap = data.fields
      console.log('✅ Claude DOM-Analyse erfolgreich')
    }
  } catch (e) {
    console.warn('⚠️ Claude DOM-Analyse fehlgeschlagen, nutze form_selectors Fallback', e)
  }

  // Versuch 2: Bestehende form_selectors (unveränderter bestehender Code)
  if (!fieldMap) {
    fieldMap = await loadFormSelectors(platform)
    console.log('🔄 Fallback: form_selectors genutzt')
  }

  // Felder füllen (bestehende Logik — NICHT ändern)
  applyFieldMap(fieldMap)
}
```

### 11.1.5: Safari — Bewusste Zurückstellung
**Goal:** Dokumentieren WARUM Safari Phase 2 ist und was dafür nötig wäre.

In der Dokumentation festhalten:
- Safari Web Extensions erfordern Xcode + Mac App Store Distribution
- Kein CI/CD-Support via Plasmo BMS für Safari
- Technisch machbar, aber separates Deployment-Projekt
- Empfehlung: Nach Chrome/Firefox/Edge Launch evaluieren

> **Nicht implementieren. Nur dokumentieren.**

---

## VERIFICATION CHECKLIST

- [ ] Prerequisites vollständig gelesen und Cross-Reference durchgeführt
- [ ] Forbidden Files nicht berührt
- [ ] Chrome-Build funktioniert unverändert (`npm run build`)
- [ ] Firefox-Build kompiliert ohne Fehler (`npm run build:firefox`)
- [ ] Edge-Build kompiliert ohne Fehler (`npm run build:edge`)
- [ ] Neue API Route `/api/extension/analyze-form` in `middleware.ts` eingetragen (Auth-Guard)
- [ ] `ARCHITECTURE.md` um neue Route ergänzt
- [ ] Fallback auf `form_selectors` getestet (Claude absichtlich deaktivieren)
- [ ] `npx tsc --noEmit` passes — kein neuer TypeScript-Fehler
- [ ] `.env.example` um neue Env-Variablen ergänzt (falls nötig)
- [ ] DOM-Snapshot > 50.000 Zeichen wird abgelehnt (Zod-Validation)
- [ ] RLS: Neue API Route gibt nur Daten des eingeloggten Users zurück

## SUCCESS CRITERIA
✅ Firefox und Edge können die Extension installieren und Auto-Apply nutzen
✅ Semantisches DOM-Matching greift bei unbekannten Formular-Strukturen
✅ Chrome-User bemerken keine Verhaltensänderung (Fallback ist transparent)
✅ Bei Claude-Fehler/Timeout: Automatischer Fallback auf form_selectors ohne User-Fehlermeldung
✅ Safari-Limitations klar dokumentiert

## EXECUTION ORDER
1. Alle Prerequisites lesen
2. Impact Map gegen realen Code verifizieren, OPEN QUESTIONS dokumentieren
3. Codebase Audit (11.1.1) — Findings dokumentieren
4. Multi-Browser Build Config (11.1.2)
5. Neue API Route anlegen (11.1.3)
6. Content Script Fallback-Kette (11.1.4)
7. Safari-Dokumentation (11.1.5)
8. Alle Gates durchlaufen
9. Yannik informieren mit: was implementiert, was offen, was aufgefallen

---

## ⚠️ PARALLELISIERUNGS-HINWEIS

Dieser Agent berührt `middleware.ts` (neue Route eintragen).
**Kein anderer Agent darf gleichzeitig `middleware.ts` modifizieren.**
Extension-Build-Config ist isoliert — kein Konflikt mit Web-App-Agents.
