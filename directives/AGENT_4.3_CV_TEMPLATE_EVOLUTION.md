# AGENT_4.3 — CV Template Evolution

## Beschreibung
Erweitert die CV-Optimierung um benutzerseitige Anzeigeoptionen, einen Numbers-Check-Flow
und ein neues „Clean"-Template im Exxeta-Stil.

## Goldene Regel
`cv-optimizer.ts` und dessen Prompt-Inhalte werden NICHT angefasst.
Kein Refactoring, kein Cleanup.

---

## Architektur

### CVOptSettings (Client-Side Only)
- Interface: `types/cv-opt-settings.ts`
- Filter-Utility: `lib/utils/cv-settings-filter.ts`
- Kein Supabase-Persist. Keine API-Rückgabe.
- `summaryMode: 'compact'` wird im LLM-Prompt injiziert UND als Post-Processing-Sicherheitsnetz angewandt.

### Numbers Check Flow
- `hasPerformanceMetrics()` prüft auf echte Business-KPIs (%, Mio, k€, Mitarbeiter, Projekte).
  Ignoriert reine Jahreszahlen.
- Banner erscheint einmalig pro Session (`localStorage: cv_metrics_prompt_shown`).
- `userProvidedMetrics` werden an `cv/optimize/route.ts` gesendet, aber nie gespeichert (PII).

### Clean Template
- `components/cv-templates/CleanTemplate.tsx` — @react-pdf/renderer
- Single-Column, Schwarz/Weiß, kein Summary-Block
- 2-Spalten-Header: Name links (22pt bold) | Kontakt rechts
- Bold Section Headers mit border-bottom
- Summary-Toggle ist im Clean-Template disabled (opacity-40 + Tooltip)

### Template Routing
- `DownloadButton.tsx`, `PdfViewerWrapper.tsx`, `cv/download/route.ts`
  routing `'clean'` → `CleanTemplate`, `'modern'` → `ModernTemplate` (Fallback)

---

## Patch v1 — QA-Korrekturen

### Fix 1 — hasMetrics Regex (BLOCKER)
Alte Regex `/\d+/` matchte auf Jahreszahlen → Banner erschien nie.
Neue Regex: `/(\\d+\\s*%|\\d+\\+\\s*(Mitarbeiter|Stakeholder|Kunden|Teams?|Projekte?)|[\\d]+\\s*(Mio|k€|€))/i`

### Fix 2 — summaryMode 'compact' Prompt-Injection
`cv_opt_settings.summaryMode` wird vom Frontend an die API gesendet.
Bei `'compact'` wird eine SUMMARY-INSTRUKTION in den LLM-Prompt injiziert:
- Max 2 Sätze
- Format: "[Rolle] mit [Erfahrung], fokussiert auf [Wert]"
- Keine unbelegten Adjektive
`cv-settings-filter.ts` bleibt als Sicherheitsnetz erhalten.

### Fix 3 — Clean Template: Summary Toggle
Wenn `templateId === 'clean'`:
- Summary-Toggle disabled, `opacity-40`, `cursor-not-allowed`
- `title`-Tooltip: "Im Clean-Template nicht verfuegbar"
- Radio-Buttons (Kompakt/Vollstaendig) werden ausgeblendet

---

## Patch v2 — Structured Metrics + Font Fix

### Fix 1 — CleanTemplate Font Crash (BLOCKER)
`@react-pdf/renderer` konnte `Inter` nicht mit `fontStyle: 'italic'` auflösen.
- `fontFamily: 'Inter'` → `'Helvetica'` (eingebauter PDF-Font, keine Registrierung nötig)
- `fontStyle: 'italic'` → `color: '#888888', fontWeight: 'normal'` (visuell dezent, kein Crash)
- `registerPdfFonts()` Import entfernt (Helvetica braucht keine Registrierung)
- Scope: NUR `CleanTemplate.tsx`, keine anderen Templates betroffen.

### Fix 2 — Structured Metrics Input (statt Freitext)
Freitext-Metriken gaben dem LLM keinen Kontext, welche Zahl zu welcher Station gehört.

Neuer Flow:
1. **`StationMetrics` Interface** in `types/cv-opt-settings.ts` (company, role, metrics)
2. **Station-basierte UI**: Zeigt max 5 Experience-Einträge aus dem CV mit je einem Input (150 Zeichen)
3. **Freetext-Fallback**: Wenn keine Experience-Daten vorhanden, zeigt alte Textarea
4. **Prompt-Injection** in `cv/optimize/route.ts`:
   `- Bei "Company" (Role): User-Metrik` — so kann Claude Zahlen korrekt zuordnen
5. **API-Body**: `user_provided_metrics: string` → `station_metrics: StationMetrics[]`
6. Sicherheit: Keine Supabase-Speicherung, kein Logging (PII per AGENT_9.3)

---

## Patch v3 — Valley Rename + Layout + Typography

### Änderung 1 — "Clean" → "Valley"
Template umbenannt zu **ValleyTemplate** (FAANG-optimiert, minimalistisch).
- `CleanTemplate.tsx` → `ValleyTemplate.tsx` (Datei erstellt + alte gelöscht)
- Template-ID: `'clean'` → `'valley'` in allen 7 Dateien
- Default-Template in `cv/download/route.ts` und `cv-opt-settings.ts` auf `'valley'`
- Summary-Toggle check: `templateId === 'valley'`

### Änderung 2 — Skills & Zertifikate Layout
- **Skills**: Komma-separierte Liste statt Mid-Dot-Fließtext (`items.join(', ')`)
- **Zertifikate**: Bullet-Präfix pro Zeile statt gestapelte Blöcke, Name bold + Issuer/Datum als Detail

### Änderung 3 — Typografie
- Page `lineHeight: 1.4` (vorher nicht gesetzt, Standard ~1.2)
- `sectionContainer.marginBottom`: 14 → 16
- `expBlock.marginBottom`: 10 → 12
- `expTopRow/eduTopRow.marginBottom`: 1.5 → 2
- `skillRow/langRow.marginBottom`: 3 → 4

---

## Patch v4 — Parser Fix + Spacing + Links

### BLOCKER 1 — CV Parser: Certifications
Root Cause: `cv-parser.ts` fehlte `certifications` in Prompt-Vorlage UND Zod-Schema.
Claude konnte Zertifikate nicht korrekt zuordnen → landeten in `skills`.
- Zod-Schema: `certifications` Feld ergänzt (optional Array, `.nullish()`)
- Prompt: `certifications`-Feld in JSON-Vorlage + Regel: "Zertifikate NIEMALS in skills"
- **Golden Rule eingehalten** — `cv-optimizer.ts` nicht berührt

### BLOCKER 2 — Valley Spacing
Patch v3 Whitespace war zu großzügig. Rücknahme auf Kompromiss:
- `page.lineHeight`: 1.4 → 1.3
- `sectionContainer.marginBottom`: 16 → 12
- `expBlock.marginBottom`: 12 → 8
- `eduBlock.marginBottom`: 10 → 6
- `sectionTitle.marginBottom`: 10 → 8

### MINOR — Hyperlinks
- `Link` aus `@react-pdf/renderer` importiert
- `pi.email` → `<Link src="mailto:...">`, `pi.linkedin` → `<Link src="https://...">`
- Auto-Prefix: wenn LinkedIn-URL kein `https://` hat → wird hinzugefügt

