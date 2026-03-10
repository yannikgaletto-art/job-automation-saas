# CV Generation Engine — Architecture Directive

**Status:** AKTIV — PFLICHTLEKTÜRE für alle CV-Template- & PDF-Agents  
**Version:** 1.0  
**Erstellt:** 2026-03-10  
**Owner:** Yannik Galetto  
**Scope:** PDF Rendering Engine, Template Consolidation, Structured Data Schema  

---

## 1. EXECUTIVE SUMMARY

Die CV-PDF-Qualität steht bei ~80%. Die fehlenden 20% sind **kein Engine-Problem** —
`@react-pdf/renderer` ist bereits aktiv und die richtige Wahl.
Das Defizit liegt in der **Daten-Schicht**: Skills werden als flache `string[]` an Templates
übergeben, Zertifikate als einzeilige Strings, und Templates rendern diese ohne visuelle
Strukturierung (keine Badges, Tags, Fortschrittsbalken, Proficiency-Dots).

Die Lösung ist eine **erweiterte `CvStructuredData` mit visuellen Hints** + Template-seitige
Rendering-Logik für strukturierte Komponenten (Skill-Tags, Cert-Cards, Language-Dots).

Puppeteer wird **nicht** eingesetzt. Modal.com wird **nicht** benötigt.

---

## 2. INFORMATION AUDIT — Proposal-Bewertung

### Proposal 1: Puppeteer (Headless Chrome) via Modal.com — ABGELEHNT ❌

| Kriterium | Bewertung |
|-----------|-----------|
| Pixel-Perfect | ✅ Ja — WYSIWYG |
| ATS-Kompatibilität | ❌ **Blocker** — erzeugt image-based PDF, nicht textbasiert |
| Durchsuchbarkeit | ❌ Kein Copy/Paste, kein Text-Layer |
| Klickbare Links | ❌ Nicht möglich bei rasterisiertem Output |
| Dateigröße | ❌ 5–20 MB pro Seite (vs. 50–200 KB bei react-pdf) |
| Ressourcen | ❌ 2+ GB RAM, 230–860ms Latenz, Cold-Start-Overhead |
| Modal-Kosten | ❌ ~$0.10–0.30/PDF bei GPU-freiem Container |
| Architektur-Fit | ❌ Braucht Modal.com oder dedizierte Infra — Overkill für 1-Seiten-PDF |
| Hybrid mit React-PDF | ❌ Kein Mehrwert — duplikate Rendering-Pfade |

**Urteil:** Puppeteer löst ein Problem das wir nicht haben. Unsere PDFs brauchen
echte Text-Layer für ATS-Systeme und Recruiter, nicht Screenshots.

> **Industrie-Kontext:** Reactive Resume nutzt Puppeteer (headless Chromium),
> aber betreibt dafür einen dedizierten "Printer"-Microservice.
> Für ein Serverless-First-Produkt auf Vercel ist das architektonisch inkompatibel.

### Proposal 2: @react-pdf/renderer + Structured Data Layer — GEWÄHLT ✅

| Kriterium | Bewertung |
|-----------|-----------|
| ATS-Kompatibilität | ✅ Nativer Text-Layer, durchsuchbar |
| Klickbare Links | ✅ `<Link>` primitiv (bereits aktiv in Valley) |
| Dateigröße | ✅ 50–200 KB |
| Serverless-Fit | ✅ Runs client-side via `pdf().toBlob()` + `usePDF()` |
| Vercel Edge | ✅ Kein Server-Rendering nötig — Client generiert PDF |
| Font-Kontrolle | ✅ Inter + Helvetica registriert |
| 80% → 100% Gap | ⚠️ **Engine kann es — Templates nutzen es nicht** |

**Root Cause des 80%-Gaps (in Reihenfolge der Schwere):**
1. **Skills**: Werden als `items.join(', ')` gerendert — flacher Text statt Skill-Tags/-Badges
2. **Zertifikate**: Ein `name + issuer` String pro Zeile — kein Datum, kein Badge-Format
3. **Sprachen**: Nur `language + proficiency` als Text — keine Proficiency-Dots/-Bars
4. **Zusammenfassung**: Freitext ohne visuelle Hierarchie
5. **Template-Differenzierung**: Valley ≈ Classic (beide single-column, ähnliches Spacing)

---

## 3. BLIND SPOT ANALYSIS

### 3.1 Nicht betrachtete Engines

| Engine | Typ | Bewertung |
|--------|-----|-----------|
| **Typst** (via WASM) | Typesetting-Engine | ⚠️ Sehr neu, instabil, kein React-API. Zukunftskandidat, heute zu riskant. |
| **WeasyPrint** (Python) | HTML→PDF | ❌ Braucht Python-Runtime, inkompatibel mit Vercel/Next.js |
| **PDFKit.js** | Low-Level Node | ❌ React-pdf baut auf PDFKit auf — wir nutzen es already indirekt |
| **html-pdf / wkhtmltopdf** | Deprecated | ❌ Veraltet, Security-Risiken |
| **jsPDF** | Client-Side | ❌ Kein Layout-Engine, manuelles x/y Positionieren — Wartungsalbtraum |

**Fazit:** Kein alternatives Engine bietet Vorteile über @react-pdf/renderer für unseren Use Case (React-basiert, serverless, ATS-kompatibel, client-side).

### 3.2 Hybrid-Ansatz (Pixel-Perfect + Searchable)

Theoretisch möglich via Puppeteer + OCR-Textlayer oder Puppeteer + Overlay-PDF.
In der Praxis: **unverhältnismäßig komplex** für ein 1-Seiten-Résumé. Kein SaaS in der Branche
macht das (weder Enhancv, Resume.io, noch Kickresume). Reactive Resume ist das Closest
und nutzt rein Puppeteer (akzeptiert die ATS-Einschränkung).

### 3.3 Industrie-Benchmark

| Product | Engine | ATS-Fähig? |
|---------|--------|------------|
| **Reactive Resume** | Puppeteer (Headless Chrome) | ❌ Image-PDF |
| **Resume.io** | Proprietäre Server-Engine | ✅ Text-Layer |
| **Enhancv** | Server-Side PDF (unbekannt) | ✅ Text-Layer |
| **Kickresume** | Server-Side Rendering | ✅ Text-Layer |
| **Pathly (aktuell)** | @react-pdf/renderer (Client) | ✅ Text-Layer |

→ Pathly's Engine ist **bereits best-in-class** für serverless ATS-PDFs.

### 3.4 DOCX/Word-Export

**Requirement Assessment:**
- Viele Recruiter und ATS-Systeme akzeptieren ausschließlich `.docx`
- **Empfehlung:** DOCX als **Phase 2 Feature** (deferred)
- Engine-Kandidat: `docx` npm Package (reiner JavaScript DOCX-Generator)
- Kein architektonischer Blocker — `CvStructuredData` → DOCX Template Mapping ist identisch zum PDF-Pfad
- **Eintrag in `DEFERRED_FEATURES.md` erstellen**

### 3.5 Job Queue Impact

PDF-Generierung läuft **client-side** (DownloadButton: `pdf().toBlob()`). Kein Server-Impact,
keine Queue-Belastung. Das ist der richtige Ansatz und darf **nicht** auf Server-Side migriert werden,
es sei denn Batch-Export (100+ PDFs) wird ein Feature.

### 3.6 Structured Data Edge Cases

| Edge Case | Handling |
|-----------|---------|
| **Fehlende Felder** | Jedes Feld ist `optional`/`nullish` — Templates prüfen via `&&` |
| **Multilingual CVs** | Section-Headers sind Template-seitig hardcoded (DE für Valley/Classic, EN für Tech) — kein User-Problem aktuell |
| **Lange Descriptions** | `@react-pdf/renderer` hat native Page-Breaks (`wrap={false}` per Block) |
| **Sonderzeichen** | Helvetica-Umfang limitiert (kein Türkisch/Arabisch) — Inter deckt Latin Extended ab |
| **Empty CV** | Templates rendern Sections nur bei `length > 0` — bereits gehandelt |
| **Skills ohne Category** | Fallback: `'Skills'` oder `'Core'` hardcoded in Templates — funktioniert |

---

## 4. TECH STACK FIT

### Supabase
- **PDF Storage:** NICHT in Supabase. PDFs werden client-side generiert, direkt heruntergeladen.
  Kein Upload, kein Storage-Bedarf. Die `cv_optimization_proposal` (JSON) lagert in `job_queue.cv_optimization_proposal`.
- **RLS:** Nicht PDF-relevant. `CvStructuredData` wird aus `job_queue` gelesen (user-scoped, RLS aktiv).

### Modal.com
- **Bewertung:** ❌ **Nicht gerechtfertigt.** PDF-Generierung dauert <500ms client-side. Modal's Schwelle ist >5min Tasks.
  CVs haben 1–3 Seiten. Selbst mit Custom-Fonts liegt die Generierung bei <1s.
- **Kein Modal-Bezug in der gesamten PDF-Pipeline.**

### Vercel
- **Edge Functions:** Nicht benötigt. PDF-Generierung ist 100% client-side.
- **API Route `/api/cv/optimize`:** Claude Sonnet Call (20–40s) hat `maxDuration: 60`.
  Das ist der teuerste Call — aber er erzeugt JSON, kein PDF.
- **Kein Sizing-Problem.**

### Tailwind + Framer Motion (Preview ↔ PDF Sync)
- **Aktueller Stand:** Kein HTML-Preview der Templates. `PdfViewerWrapper` rendert den PDF
  direkt in einem `<PDFViewer>` iframe. Es gibt keine HTML/Tailwind-Version der Templates.
- **Implikation:** Preview = PDF. Kein Sync-Problem. Kein Dual-Rendering.
- **Framer Motion:** Wird in der Wizard-UI genutzt (Schritte, DiffReview), nicht in Templates.

### Next.js
- **PDF Trigger:** Download via `DownloadButton` (`pdf().toBlob()` → client-side `<a download>`).
  Kein Server Action, kein API Route. Korrekt so.
- **Server-Side Download:** `/api/documents/download` existiert als Fallback.
  Nicht die primäre Pipeline.

---

## 5. TEMPLATE DECISION

### Valley — BEHALTEN ✅ (Primary Template)
- **Rolle:** FAANG/Big-Tech-optimiert, einziges Template ohne Summary-Block.
- **Stärken:** Minimalistisch, Schwarz/Weiß, perfekte ATS-Lesbarkeit.
- **Aktion:** Skill-Tags + Cert-Cards + Language-Dots hinzufügen.

### Classic — DEPRECATEN ❌ → ENTFERNEN
- **Begründung:** Classic ist Valley mit (a) anderer Font-Registrierung (Inter statt Helvetica),
  (b) zentriertem statt linkstehendem Header, (c) englischen Section-Labels.
  Die Layouts sind zu 90% identisch. Zwei fast-identische Templates verwirren User.
- **Migration:** Existing `template_id: 'classic'` Einträge → Fallback auf `'valley'`.
- **Aktion:** Classic aus `resolveTemplate()`, Template-Auswahl-UI und DownloadButton entfernen.

### Modern — BEHALTEN ✅ (2-Spalten Variante)
- **Rolle:** Sidebar-Layout (dunkelgrauer Sidebar links, weißer Content rechts).
  Visuell differenziert von Valley — hat Daseinsberechtigung.
- **Stärken:** Sidebar für Skills/Languages/Certs, Main Column für Experience.
- **Aktion:** Skill-Tags in Sidebar aufwerten. Accent-Farbe auf `#012e7a` angleichen.

### Tech — BEHALTEN ✅ (Tech-/Developer-Variante)
- **Rolle:** 2-Spalten mit Accent-Color-Akzenten, Date-Tags als Badges.
  Klar auf Tech/Dev-Rollen zugeschnitten.
- **Stärken:** Skill-Tags bereits vorhanden (`skillTag` Style). Am nächsten an 100%.
- **Aktion:** Als Referenz-Template für die Skill-Tag-Logik nutzen, in Valley/Modern übertragen.

### 4. Template — NICHT JETZT
- Kein viertes Template planen. Drei differenzierte Templates (Valley, Modern, Tech) decken
  die Use Cases ab: minimalistisch, corporate, und tech. Mehr Templates = mehr Wartung.
- **Deferred:** Erst wenn User-Feedback ein spezifisches Layout-Bedürfnis zeigt.

---

## 6. STRUCTURED DATA SCHEMA — Enhanced TypeScript Interfaces

Die Kernänderung: Skills und Zertifikate erhalten **visuelle Rendering-Hints**.

```typescript
// ============================================================================
// CV STRUCTURED DATA — V2.0 (Enhanced for Template Rendering)
// ============================================================================

export interface CvStructuredData {
    version: '1.0' | '2.0';
    personalInfo: PersonalInfo;
    experience: ExperienceEntry[];
    education: EducationEntry[];
    skills: SkillGroup[];
    languages: LanguageEntry[];
    certifications?: CertificationEntry[];
}

// ── Personal Info ──────────────────────────────────────────────────────────

interface PersonalInfo {
    name?: string;
    email?: string;
    phone?: string;
    location?: string;
    linkedin?: string;
    website?: string;        // NEW: Portfolio/GitHub
    summary?: string;
    targetRole?: string;     // NEW: For header role display (Tech Template)
}

// ── Experience ─────────────────────────────────────────────────────────────

interface ExperienceEntry {
    id: string;
    company?: string;
    role?: string;
    dateRangeText?: string;
    location?: string;
    summary?: string;
    description: BulletPoint[];
}

interface BulletPoint {
    id: string;
    text: string;
}

// ── Education ──────────────────────────────────────────────────────────────

interface EducationEntry {
    id: string;
    institution?: string;
    degree?: string;
    dateRangeText?: string;
    description?: string;
    grade?: string;          // NEW: Optional GPA/Note
}

// ── Skills (ENHANCED) ──────────────────────────────────────────────────────

interface SkillGroup {
    id: string;
    category?: string;       // e.g. "Programmiersprachen", "Tools", "Frameworks"
    items: string[];          // Individual skill names
    // NEW: Visual rendering hints (template decides how to render)
    displayMode?: 'tags' | 'comma' | 'bars';  // Default: 'tags'
}

// ── Languages (ENHANCED) ───────────────────────────────────────────────────

interface LanguageEntry {
    id: string;
    language?: string;
    proficiency?: string;    // e.g. "Muttersprache", "C1", "Fließend"
    // NEW: Numeric level for visual rendering (dots, bars)
    level?: 1 | 2 | 3 | 4 | 5;  // 1=Grundkenntnisse, 5=Muttersprache
}

// ── Certifications (ENHANCED) ──────────────────────────────────────────────

interface CertificationEntry {
    id: string;
    name?: string;
    issuer?: string;
    dateText?: string;
    // NEW: Optional fields for richer rendering
    credentialUrl?: string;  // Clickable verification link
    expiryDate?: string;     // "Gültig bis 2027"
}
```

### Migration V1 → V2
- **Backward-compatible:** Alle neuen Felder sind `optional`.
- `version: '2.0'` wird bei neuen Parses gesetzt. Templates prüfen Version nicht — sie rendern was da ist.
- **KEINE DB-Migration nötig.** `cv_structured_data` ist `jsonb` in `job_queue`.
- `cv-parser.ts` wird erweitert um neue Felder zu extrahieren (wenn vorhanden).

---

## 7. TEMPLATE RENDERING — Upgrade-Spezifikation

### 7.1 Skill-Tags (alle Templates)

Aktuell (Valley/Classic):
```
Kenntnisse
Programmiersprachen    Python, JavaScript, TypeScript, SQL
```

Ziel (Valley — mit Tags/Chips):
```
Kenntnisse
Programmiersprachen:  [Python] [JavaScript] [TypeScript] [SQL]
```

@react-pdf/renderer Implementation:
```tsx
// Reusable Component
const SkillTag = ({ text }: { text: string }) => (
    <Text style={{
        backgroundColor: '#F1F5F9',
        color: '#0F172A',
        fontSize: 7.5,
        paddingHorizontal: 6,
        paddingVertical: 3,
        borderRadius: 4,
        fontWeight: 600,
    }}>
        {text}
    </Text>
);

// In Template:
<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
    {group.items.map((item, i) => <SkillTag key={i} text={item} />)}
</View>
```

> **Hinweis:** Tech Template hat das bereits als `skillTag` Style. Logik übertragen.

### 7.2 Language Proficiency Dots

Aktuell:
```
Deutsch    Muttersprache
Englisch   Fließend
```

Ziel:
```
Deutsch    ● ● ● ● ●   Muttersprache
Englisch   ● ● ● ● ○   Fließend
```

```tsx
const ProficiencyDots = ({ level = 3 }: { level?: number }) => (
    <View style={{ flexDirection: 'row', gap: 2 }}>
        {[1, 2, 3, 4, 5].map(i => (
            <View key={i} style={{
                width: 5, height: 5, borderRadius: 2.5,
                backgroundColor: i <= level ? '#0F172A' : '#E2E8F0',
            }} />
        ))}
    </View>
);
```

### 7.3 Certification Cards

Aktuell (Valley):
```
• AWS Solutions Architect — AWS • 2024
```

Ziel:
```
AWS Solutions Architect                    2024
  AWS  ·  Verify →
```

Cert-Name bold, Issuer als Subtext, optional klickbarer Verify-Link.

---

## 8. FINAL RECOMMENDATION

### 8.1 Gewählter PDF Engine

**@react-pdf/renderer bleibt — ohne Änderung.** Die Engine war nie das Problem.
Client-side Rendering via `pdf().toBlob()` ist schnell (<500ms), serverless-kompatibel,
erzeugt durchsuchbare Text-PDFs, unterstützt Links, und kostet null API-Calls.
Jede Migration weg von dieser Engine wäre ein architektonischer Rückschritt.

### 8.2 Structured Data Schema

Siehe Abschnitt 6. Key-Erweiterungen: `SkillGroup.displayMode`, `LanguageEntry.level`,
`CertificationEntry.credentialUrl`, `PersonalInfo.targetRole`. Alle backward-compatible.

### 8.3 Template-Strategie

| Template | Aktion |
|----------|--------|
| **Valley** | Behalten, aufrüsten (Skill-Tags, Lang-Dots, Cert-Cards) |
| **Classic** | Deprecaten und entfernen (Duplikat von Valley) |
| **Modern** | Behalten, Accent-Color auf `#012e7a`, Skill-Tags in Sidebar |
| **Tech** | Behalten, ist bereits am nächsten an 100% (hat Skill-Tags) |

### 8.4 Implementation Sequence

```
Phase 1 (Daten & Templates) ─── 1-2 Arbeitstage
  ├─ 1. types/cv.ts erweitern (V2 Schema, backward-compat)
  ├─ 2. Shared Components erstellen: SkillTag, ProficiencyDots, CertCard
  ├─ 3. Valley + Modern Templates aufrüsten mit neuen Components
  ├─ 4. Classic deprecaten: Fallback 'classic' → 'valley' in resolveTemplate()
  └─ 5. DownloadButton + PdfViewerWrapper: Classic-Import entfernen

Phase 2 (Parser & AI) ─── 1 Arbeitstag
  ├─ 6. cv-parser.ts: Language Level + Cert URL extrahieren (wenn vorhanden)
  ├─ 7. cv/optimize prompt: targetRole + level Felder in Output-Schema
  └─ 8. Template-Selector UI: Classic entfernen, Farben #012e7a

Phase 3 (Quality & Polish) ─── 0.5 Arbeitstag
  ├─ 9. Accent-Colors: Modern Template #2563EB → #012e7a
  ├─ 10. PdfViewerWrapper Mobile: blue-600 → #012e7a
  └─ 11. Verifikation: Download + Preview für alle 3 verbleibenden Templates
```

### 8.5 Risiko-Flags

| Risiko | Schwere | Mitigation |
|--------|---------|------------|
| **@react-pdf `gap` Property** | Mittel | `gap` in `flexWrap` ist experimentell in react-pdf. Fallback: `margin` pro Item. |
| **Helvetica Zeichensatz** | Niedrig | Valley nutzt Helvetica (kein ö/ä/ü in alten Versionen). Test: Deutsches CV durchrendern. Fallback: auf Inter wechseln. |
| **Classic-Deprecation Nutzer-Bruch** | Niedrig | Nur `template_id: 'classic'` in DB betroffene Rows → Fallback 'classic' → 'valley' in Code + DB-Migration `UPDATE job_queue SET preferred_template = 'valley' WHERE preferred_template = 'classic'` |
| **Parser Backward-Compat** | Niedrig | Neue Felder sind `optional`. Alte CVs rendern wie bisher. Keine Breaking Changes. |
| **DOCX-Nachfrage** | Mittel | Aktuell deferred. Wenn User in den nächsten 4 Wochen danach fragen → `docx` npm Package evaluieren. |

---

## 9. IMPLEMENTATION CHECKLIST

- [ ] `types/cv.ts` — V2 Schema (additive: `displayMode`, `level`, `credentialUrl`, `targetRole`)
- [ ] `components/cv-templates/shared/` — `SkillTag.tsx`, `ProficiencyDots.tsx`, `CertCard.tsx`
- [ ] `ValleyTemplate.tsx` — Skills: comma → tags, Languages: text → dots, Certs: bullet → card
- [ ] `ModernTemplate.tsx` — Skills sidebar: text → tags, Accent: `#2563EB` → `#012e7a`
- [ ] `TechTemplate.tsx` — Verify: bereits tags, ggf. Language-Dots hinzufügen
- [ ] `ClassicTemplate.tsx` — Delete file
- [ ] `PdfViewerWrapper.tsx` — Remove Classic import + case, Classic → Valley fallback
- [ ] `DownloadButton.tsx` — Remove Classic import + case, Classic → Valley fallback
- [ ] `TemplateSelector.tsx` — Remove Classic option
- [ ] `cv-parser.ts` — Extract `level` für Languages, `credentialUrl` für Certs (nice-to-have)
- [ ] DB Migration (optional) — `UPDATE job_queue SET preferred_template = 'valley' WHERE preferred_template = 'classic'`
- [ ] `PdfViewerWrapper.tsx` Mobile — `blue-600` → `#012e7a`
- [ ] `directives/DEFERRED_FEATURES.md` — DOCX-Export als D6 hinzufügen
- [ ] Verification: PDF Download test für Valley, Modern, Tech mit vollständigem CV

---

> **Letztes Update:** 2026-03-10  
> **Owner:** Yannik Galetto  
> **Engine-Entscheidung:** @react-pdf/renderer (Status Quo bestätigt)  
> **Template-Entscheidung:** Classic deprecaten, Valley/Modern/Tech aufwerten
