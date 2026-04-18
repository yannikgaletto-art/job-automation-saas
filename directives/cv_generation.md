# CV Generation Engine — Architecture Directive

**Status:** AKTIV — PFLICHTLEKTÜRE für alle CV-Template- & PDF-Agents  
**Version:** 2.1  
**Erstellt:** 2026-03-10  
**Letzte Revision:** 2026-03-10 (QA-Review integriert, Modern + Classic entfernt)  
**Owner:** Yannik Galetto  
**Scope:** PDF Rendering Engine, Template Consolidation, Structured Data Schema, Page Layout Engine  

---

## 1. EXECUTIVE SUMMARY

Die CV-PDF-Qualität steht bei ~80%. Die fehlenden 20% sind **kein Engine-Problem** —
`@react-pdf/renderer` ist bereits aktiv und die richtige Wahl.
Das Defizit liegt in der **Daten-Schicht** und der **Layout-Dichte**:
1. Skills werden als flache `string[]` an Templates übergeben (keine Tags/Badges)
2. Zertifikate/Languages stehen als lange vertikale Listen statt kompakter 2-Spalten-Grids
3. Keine Page Budget Logik — Sections splitten unkontrolliert über Seitenumbrüche
4. Vertikale Verschwendung durch fehlende Inline-Anordnung kompakter Sections

Die Lösung ist eine **erweiterte `CvStructuredData` mit visuellen Hints** + Template-seitige
Rendering-Logik für strukturierte Komponenten (Skill-Tags, Cert-Grids, Language-Dots)
+ eine **Page Layout Engine** die 1,5–2 Seiten als Budget erzwingt.

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
1. **Layout-Dichte**: Alle kompakten Sections (Skills, Languages, Certs) stehen vertikal statt als 2-Spalten-Grids
2. **Page Breaks**: Keine Logik verhindert Orphan-Items (2 Certs allein auf Seite 2)
3. **Skills**: Werden als `items.join(', ')` gerendert — flacher Text statt Skill-Tags/-Badges
4. **Zertifikate**: Ein `name + issuer` String pro Zeile — kein Grid-Format
5. **Sprachen**: Nur `language + proficiency` als Text — keine Proficiency-Dots/-Bars
6. **Education**: Mehrzeiliger Fließtext statt kompakter 1–2-Zeilen-Beschreibungen
7. **Template-Differenzierung**: Valley ≈ Classic (beide single-column, ähnliches Spacing)

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

**Fazit:** Kein alternatives Engine bietet Vorteile über @react-pdf/renderer für unseren Use Case.

### 3.2 Industrie-Benchmark

| Product | Engine | ATS-Fähig? |
|---------|--------|------------|
| **Reactive Resume** | Puppeteer (Headless Chrome) | ❌ Image-PDF |
| **Resume.io** | Proprietäre Server-Engine | ✅ Text-Layer |
| **Enhancv** | Server-Side PDF (unbekannt) | ✅ Text-Layer |
| **Kickresume** | Server-Side Rendering | ✅ Text-Layer |
| **Pathly (aktuell)** | @react-pdf/renderer (Client) | ✅ Text-Layer |

→ Pathly's Engine ist **bereits best-in-class** für serverless ATS-PDFs.

### 3.3 DOCX/Word-Export

- **Status:** DEFERRED (Phase 2)
- Engine-Kandidat: `docx` npm Package
- Kein architektonischer Blocker — `CvStructuredData` → DOCX Template Mapping ist identisch zum PDF-Pfad
- **Eintrag in `DEFERRED_FEATURES.md` als D6**

### 3.4 Multilingual CV Section Headers

- **Status:** DEFERRED
- Aktuell: DE-Labels in Valley/Classic, EN-Labels in Tech — fest im Template-Code
- Zukunft: `locale` Property in `CvStructuredData` → i18n-Map für Section-Labels
- **Kein Blocker** für V2. Explizit als Deferred markiert.

### 3.5 Job Queue Impact

PDF-Generierung läuft **client-side** (`pdf().toBlob()`). Kein Server-Impact,
keine Queue-Belastung. Korrekt so, darf **nicht** server-side migriert werden.

### 3.6 Structured Data Edge Cases

| Edge Case | Handling |
|-----------|---------|
| **Fehlende Felder** | Jedes Feld ist `optional`/`nullish` — Templates prüfen via `&&` |
| **Lange Descriptions** | `@react-pdf/renderer` hat native Page-Breaks (`wrap={false}` per Block) |
| **Sonderzeichen** | Helvetica-Umfang limitiert — Inter deckt Latin Extended ab |
| **Empty CV** | Templates rendern Sections nur bei `length > 0` |
| **Skills ohne Category** | Fallback: `'Skills'` / `'Core'` hardcoded |

### 3.7 Zusätzliche Blind Spots (aus QA-Review)

| Blind Spot | Status | Aktion |
|-----------|--------|--------|
| **`resolveTemplate()` Dateipfad** | ✅ Akzeptiert | Liegt in `components/cv-templates/PdfViewerWrapper.tsx` (Zeile 17) + `components/cv-optimizer/DownloadButton.tsx` (Zeile 17). Beide müssen bei Template-Änderungen aktualisiert werden. |
| **AI-Prompt Update** | ✅ Akzeptiert | `cv-parser.ts` Prompt muss V2-Felder (`level`, `targetRole`, `credentialUrl`) im JSON-Output-Schema spezifizieren (Beispiel in §6). |
| **`gap` Property** | ✅ Akzeptiert — **PFLICHT** | `gap` ist in @react-pdf experimentell und auf älteren Versionen unzuverlässig. **ALLE** `gap`-Usages MÜSSEN durch `marginRight` + `marginBottom` ersetzt werden. Betroffen: `TechTemplate.tsx` (3x), `ClassicTemplate.tsx` (1x). |
| **Mobile Preview** | ✅ Akzeptiert | `usePDF()` + Download-Button ist bereits implementiert in `PdfViewerWrapper.tsx` (`MobileDownload` Komponente). Kein `<iframe>` auf Mobile. Status: gelöst. |
| **DB-Migration Classic→Valley** | ✅ Akzeptiert — **VERPFLICHTEND** | `UPDATE job_queue SET preferred_template = 'valley' WHERE preferred_template = 'classic'` — eigene Migration in `supabase/migrations/`. |
| **Git-Tag Rollback** | ✅ Akzeptiert | Vor Beginn der Implementation: `git tag cv-gen-v1-pre-refactor` setzen. Bei Critical Failure: `git revert` bis zum Tag. |
| **Modern Template Status** | ❌ **QA-FEHLER** | QA behauptete "Modern existiert nicht" — **falsch.** `ModernTemplate.tsx` existiert, ist aktiv importiert in `PdfViewerWrapper.tsx` und `DownloadButton.tsx`. Modern **bleibt bestehen.** |

---

## 4. TECH STACK FIT

### Supabase
- **PDF Storage:** NICHT in Supabase. PDFs werden client-side generiert, direkt heruntergeladen.
- **RLS:** `CvStructuredData` wird aus `job_queue` gelesen (user-scoped, RLS aktiv).

### Modal.com
- ❌ **Nicht gerechtfertigt.** PDF-Generierung dauert <500ms client-side.

### Vercel
- **Edge Functions:** Nicht benötigt. PDF-Generierung ist 100% client-side.

### Tailwind + Framer Motion (Preview ↔ PDF Sync)
- Kein HTML-Preview. `PdfViewerWrapper` rendert PDF direkt in `<PDFViewer>` iframe.
- Preview = PDF. Kein Sync-Problem.

### Next.js
- **PDF Trigger:** `DownloadButton` (`pdf().toBlob()` → client-side `<a download>`).
- **Server-Side Fallback:** `/api/documents/download` existiert.

---

## 5. TEMPLATE DECISION

### Valley — BEHALTEN ✅ (Primary Template, FAANG-optimiert)
- Minimalistisch, Schwarz/Weiß, perfekte ATS-Lesbarkeit.
- **Aktion:** Skill-Tags + Language-Dots + Cert-Grid + Page Budget. ✅ DONE

### Tech — BEHALTEN ✅ (Tech-/Developer-Variante)
- 2-Spalten mit Accent-Color-Akzenten, Date-Tags als Badges.
- Skill-Tags bereits vorhanden. Am nächsten an 100%.
- **Aktion:** Language-Dots + CertGrid + gap→margin + Page Budget. ✅ DONE

### Modern — ENTFERNT ❌
- Per User-Entscheidung entfernt. Fallback `'modern'` → Valley in `resolveTemplate()`.
- `ModernTemplate.tsx` gelöscht.

### Classic — ENTFERNT ❌
- 90% Duplikat von Valley. Fallback `'classic'` → Valley in `resolveTemplate()`.
- `ClassicTemplate.tsx` gelöscht.
- **DB-Migration nötig:** `UPDATE job_queue SET preferred_template = 'valley' WHERE preferred_template IN ('classic', 'modern')`

---

## 6. STRUCTURED DATA SCHEMA — Enhanced TypeScript Interfaces

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

interface EducationEntry {
    id: string;
    institution?: string;
    degree?: string;
    dateRangeText?: string;
    description?: string;    // MAX 2 Zeilen — Templates kürzen per numberOfLines
    grade?: string;          // NEW: Optional GPA/Note
}

interface SkillGroup {
    id: string;
    category?: string;
    items: string[];
    displayMode?: 'tags' | 'comma' | 'bars';  // Default: 'tags'
}

interface LanguageEntry {
    id: string;
    language?: string;
    proficiency?: string;
    level?: 1 | 2 | 3 | 4 | 5;  // NEW: 1=Grundkenntnisse, 5=Muttersprache
}

interface CertificationEntry {
    id: string;
    name?: string;
    issuer?: string;
    dateText?: string;
    credentialUrl?: string;  // NEW: Clickable verification link
    expiryDate?: string;     // NEW: "Gültig bis 2027"
}
```

### AI-Prompt Update für cv-parser.ts

Das Output-Schema im Prompt muss V2-Felder spezifizieren:

```
Respond with JSON matching this schema exactly:
{
  "version": "2.0",
  "personalInfo": {
    "name": "...", "email": "...", "phone": "...",
    "location": "...", "linkedin": "...",
    "website": "...",          // Portfolio/GitHub URL if found
    "targetRole": "..."       // Job title from CV header or most recent role
  },
  "languages": [
    {
      "id": "uuid", "language": "Deutsch", "proficiency": "Muttersprache",
      "level": 5              // 1=Grundkenntnisse, 2=A2/B1, 3=B2, 4=C1/Fließend, 5=Muttersprache
    }
  ],
  "certifications": [
    {
      "id": "uuid", "name": "AWS Solutions Architect",
      "issuer": "Amazon Web Services", "dateText": "2024",
      "credentialUrl": "https://..."  // If found in CV text
    }
  ]
  // ... other fields unchanged
}
```

### Migration V1 → V2
- **Backward-compatible:** Alle neuen Felder sind `optional`.
- **KEINE DB-Migration nötig** für Schema-Erweiterung. `cv_structured_data` ist `jsonb`.

---

## 7. TEMPLATE RENDERING — Upgrade-Spezifikation

### 7.1 Skill-Tags (alle Templates)

Aktuell: `items.join(', ')` → flacher Text.

Ziel: Visuell strukturierte Tags.

```tsx
const SkillTag = ({ text }: { text: string }) => (
    <Text style={{
        backgroundColor: '#F1F5F9',
        color: '#0F172A',
        fontSize: 7.5,
        paddingHorizontal: 6,
        paddingVertical: 3,
        borderRadius: 4,
        fontWeight: 600,
        marginRight: 4,        // NICHT gap — react-pdf experimentell
        marginBottom: 4,       // NICHT gap — react-pdf experimentell
    }}>
        {text}
    </Text>
);

// Usage in Template:
<View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
    {group.items.map((item, i) => <SkillTag key={i} text={item} />)}
</View>
```

### 7.2 Language Proficiency Dots

```tsx
const ProficiencyDots = ({ level = 3 }: { level?: number }) => (
    <View style={{ flexDirection: 'row' }}>
        {[1, 2, 3, 4, 5].map(i => (
            <View key={i} style={{
                width: 5, height: 5, borderRadius: 2.5,
                backgroundColor: i <= level ? '#0F172A' : '#E2E8F0',
                marginRight: 2,   // NICHT gap
            }} />
        ))}
    </View>
);
```

### 7.3 Certification Grid (2-spaltig)

```tsx
// Für > 3 Certs: 2-spaltiges Grid statt vertikale Liste
const CertGrid = ({ certs }: { certs: CertificationEntry[] }) => {
    const left = certs.filter((_, i) => i % 2 === 0);
    const right = certs.filter((_, i) => i % 2 === 1);

    return (
        <View style={{ flexDirection: 'row' }}>
            <View style={{ flex: 1, paddingRight: 8 }}>
                {left.map(cert => <CertItem key={cert.id} cert={cert} />)}
            </View>
            <View style={{ flex: 1, paddingLeft: 8 }}>
                {right.map(cert => <CertItem key={cert.id} cert={cert} />)}
            </View>
        </View>
    );
};

const CertItem = ({ cert }: { cert: CertificationEntry }) => (
    <View style={{ marginBottom: 6 }}>
        <Text style={{ fontSize: 8.5, fontWeight: 700, color: '#0F172A' }}>
            {cert.name || ''}
        </Text>
        <Text style={{ fontSize: 7.5, color: '#6B7280' }}>
            {[cert.issuer, cert.dateText].filter(Boolean).join(' · ')}
        </Text>
    </View>
);
```

---

## 8. PAGE LAYOUT ENGINE

### 8.1 Design-Grundlagen (Expert-Research)

| Metrik | Wert | Quelle |
|--------|------|--------|
| **Recruiter-Scan-Zeit** | 7,4 Sekunden | Eye-Tracking Studie (Ladders) |
| **Optimal-Länge** | 1,5–2 Seiten | Recruiter-Konsens für Senior-Rollen |
| **Content-Ratio** | 70% White Space, 30% Content | UX Best Practice |
| **Max. Certs Inline** | 6 als Liste, dann Grid | Scannbarkeit |

### 8.2 Page Budget System

**Ziel:** Jeder CV rendert auf exakt 1,5–2 Seiten. Keine Orphan-Sections.

**Seite 1 (obere Hälfte — das „7,4-Sekunden-Fenster"):**
```
1. Header (Name, Contact)
2. Summary (wenn vorhanden, max. 3 Zeilen)
3. Core Experience (neueste 2-3 Positionen)
```

**Seite 1 (untere Hälfte):**
```
4. Remaining Experience
5. Education (kompakt, max. 2 Zeilen Description)
```

**Seite 2 (wenn nötig):**
```
6. Skills (Tags, 2-3 Spalten bei vielen)
7. Languages + Certifications (nebeneinander wenn Platz ausreicht)
```

### 8.3 Orphan Prevention — `MinItemsGuard`

Verhindert, dass weniger als 2 Items einer Section allein auf einer neuen Seite stehen.

```tsx
/**
 * Wraps a section and prevents orphan page breaks.
 * If a section would split, it either:
 * (a) moves entirely to the next page (if ≤3 items), or
 * (b) ensures at least 2 items remain on the previous page.
 *
 * Uses @react-pdf/renderer's `break` + `wrap` props.
 */
const SectionGuard = ({
    title,
    children,
    itemCount,
    forcePageBreak = false,
}: {
    title: string;
    children: React.ReactNode;
    itemCount: number;
    forcePageBreak?: boolean;
}) => (
    <View
        wrap={itemCount > 3}
        break={forcePageBreak}
        style={{ marginBottom: 12 }}
        minPresenceAhead={40}  // Mindestens 40pt auf aktueller Seite bleiben
    >
        <Text style={sectionTitleStyle}>{title}</Text>
        {children}
    </View>
);
```

**React-PDF native Props:**
- `wrap={false}` → Gesamte Section auf eine Seite erzwingen (nur bei ≤3 Items sinnvoll)
- `break` → Erzwingt Seitenumbruch vor dieser View
- `minPresenceAhead={N}` → Garantiert, dass mindestens N pt des nächsten Content auf der gleichen Seite sind

### 8.4 Inline-Layout für kompakte Sections

Wenn Skills + Languages zusammen auf eine halbe Seite passen,
werden sie nebeneinander gerendert:

```tsx
/**
 * Two-column layout for compact sections.
 * Skills left, Languages right. Falls back to stacked if only one section has content.
 */
const CompactDualColumn = ({
    leftTitle,
    leftContent,
    rightTitle,
    rightContent,
    hasRight,
}: {
    leftTitle: string;
    leftContent: React.ReactNode;
    rightTitle: string;
    rightContent: React.ReactNode;
    hasRight: boolean;
}) => {
    if (!hasRight) {
        // Full width for single section
        return (
            <View style={{ marginBottom: 12 }}>
                <Text style={sectionTitleStyle}>{leftTitle}</Text>
                {leftContent}
            </View>
        );
    }

    return (
        <View style={{ flexDirection: 'row', marginBottom: 12 }}>
            <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={sectionTitleStyle}>{leftTitle}</Text>
                {leftContent}
            </View>
            <View style={{ flex: 1, paddingLeft: 12 }}>
                <Text style={sectionTitleStyle}>{rightTitle}</Text>
                {rightContent}
            </View>
        </View>
    );
};

// Usage:
<CompactDualColumn
    leftTitle="Kenntnisse"
    leftContent={<SkillTagsList skills={data.skills} />}
    rightTitle="Sprachen"
    rightContent={<LanguageDotsGrid languages={data.languages} />}
    hasRight={data.languages.length > 0}
/>
```

---

## 9. VISUAL DENSITY RULES

### 9.1 Spacing-System (konsistent über alle Templates)

| Element | Spacing | Wert |
|---------|---------|------|
| **Zwischen Sections** | `marginBottom` | `16 pt` |
| **Section Header → Content** | `marginBottom` | `8 pt` |
| **Zwischen Items (Experience/Education)** | `marginBottom` | `10 pt` |
| **Zwischen Bullets** | `marginBottom` | `3 pt` |
| **Zwischen Skill-Tags** | `marginRight` + `marginBottom` | `4 pt` |
| **Zwischen Cert-Items** | `marginBottom` | `6 pt` |
| **Section Divider (border)** | `marginBottom` nach border | `8 pt` |

### 9.2 Education Description Truncation

Bildungs-Beschreibungen sind auf **max. 2 Zeilen** begrenzt.
`@react-pdf/renderer` hat kein natives `numberOfLines`. Stattdessen:

```tsx
/**
 * Truncates education description to max ~120 characters (≈ 2 lines at 9pt).
 * No "..." suffix — just clean truncation at word boundary.
 */
function truncateDescription(text: string | undefined, maxChars = 120): string | undefined {
    if (!text || text.length <= maxChars) return text;
    const truncated = text.substring(0, maxChars);
    const lastSpace = truncated.lastIndexOf(' ');
    return lastSpace > 0 ? truncated.substring(0, lastSpace) : truncated;
}

// In Template:
{edu.description && (
    <Text style={s.eduDesc}>
        {truncateDescription(edu.description)}
    </Text>
)}
```

### 9.3 `gap` Property Migration — VERPFLICHTEND

`gap` ist experimentell in @react-pdf/renderer und auf bestimmten Versionen
unsupported. **ALLE** Usages müssen durch margin ersetzt werden:

| Datei | Zeile | Alt | Neu |
|-------|-------|-----|-----|
| `TechTemplate.tsx` | L53 | `gap: 4` (contactTag) | `marginRight: 4, marginBottom: 4` auf jedem `contactTag` |
| `TechTemplate.tsx` | L66 | `gap: 24` (columns) | `paddingRight: 12` auf `mainCol`, `paddingLeft: 12` auf `sideCol` |
| `TechTemplate.tsx` | L151 | `gap: 4` (skillTagContainer) | `marginRight: 4, marginBottom: 4` auf jedem `skillTag` |
| `ClassicTemplate.tsx` | L37 | `gap: 8` (contactInfo) | `marginRight: 8` auf jedem Contact-Element |

---

## 10. FINAL RECOMMENDATION

### 10.1 Gewählter PDF Engine

**@react-pdf/renderer bleibt — ohne Änderung.** Client-side via `pdf().toBlob()`.
Schnell (<500ms), serverless-kompatibel, durchsuchbar, klickbare Links, zero API cost.

### 10.2 Template-Strategie

| Template | Aktion |
|----------|--------|
| **Valley** | Behalten, aufgerüstet ✅ (Skill-Tags, Lang-Dots, CertGrid, dual-column, orphan prevention) |
| **Tech** | Behalten, aufgerüstet ✅ (gap→margin, ProficiencyDots, CertGrid, targetRole) |
| **Modern** | ENTFERNT ❌ (User-Entscheidung) — Fallback → Valley |
| **Classic** | ENTFERNT ❌ — Fallback → Valley + DB-Migration |

### 10.3 Implementation Sequence

```
Phase 0 (Pre-Flight) ─── 5 Minuten
  ├─ git tag cv-gen-v1-pre-refactor
  └─ Rollback-Strategie: git revert bis zum Tag bei Critical Failure

Phase 1 (Daten & Shared Components) ─── 1 Arbeitstag
  ├─ 1. types/cv.ts erweitern (V2 Schema, backward-compat)
  ├─ 2. Shared Components: SkillTag, ProficiencyDots, CertGrid, CertItem
  ├─ 3. Utilities: truncateDescription(), SectionGuard, CompactDualColumn
  └─ 4. gap → margin Migration (TechTemplate 3x, ClassicTemplate 1x)

Phase 2 (Templates) ─── 1 Arbeitstag
  ├─ 5. Valley: Skills→Tags, Languages→Dots, Certs→Grid, Page Budget ✅
  ├─ 6. Tech: gap→margin, ProficiencyDots, CertGrid, targetRole ✅
  ├─ 7. Classic + Modern: Dateien gelöscht ✅
  ├─ 8. PdfViewerWrapper: Classic/Modern entfernt, fallback→Valley ✅
  ├─ 9. DownloadButton: Classic/Modern entfernt, fallback→Valley ✅
  ├─ 10. cv/download/route.ts: Classic/Modern entfernt ✅
  ├─ 11. OptimizerWizard: Template Selector bereinigt ✅
  └─ 12. DB-Migration: UPDATE job_queue ... WHERE preferred_template IN ('classic','modern')

Phase 3 (Parser & Polish) ─── 0.5 Arbeitstag
  ├─ 10. cv-parser.ts: Level + credentialUrl + targetRole extrahieren
  ├─ 11. Template-Selector UI: Classic entfernen, Farben #012e7a
  ├─ 12. PdfViewerWrapper Mobile: blue-600 → #012e7a
  └─ 13. Verification: PDF Download test für Valley, Modern, Tech
```

### 10.4 Risiko-Flags

| Risiko | Schwere | Mitigation |
|--------|---------|------------|
| **`gap` Regression** | Mittel | Phase 1 migriert ALLE gap-Usages vor Template-Änderungen |
| **Helvetica Zeichensatz** | Niedrig | Valley nutzt Helvetica. Test: deutsches CV durchrendern. Fallback: Inter. |
| **Classic-Deprecation** | Niedrig | DB-Migration + Code-Fallback. Git-Tag als Rollback. |
| **Page Budget Logik** | Mittel | `minPresenceAhead` + `wrap` sind react-pdf native — kein Custom-Hack nötig. |
| **Parser Backward-Compat** | Niedrig | Neue Felder optional. Alte CVs rendern wie bisher. |
| **DOCX-Nachfrage** | Mittel | Deferred. `docx` npm evaluieren wenn nachgefragt. |

---

## 11. IMPLEMENTATION CHECKLIST

### Pre-Flight
- [ ] `git tag cv-gen-v1-pre-refactor` setzen

### Phase 1 — Data & Components
- [ ] `types/cv.ts` — V2 Schema (additive: `displayMode`, `level`, `credentialUrl`, `targetRole`, `website`, `grade`)
- [ ] `components/cv-templates/shared/SkillTag.tsx` — Reusable Skill-Tag
- [ ] `components/cv-templates/shared/ProficiencyDots.tsx` — Language-Dots
- [ ] `components/cv-templates/shared/CertGrid.tsx` + `CertItem.tsx` — 2-spaltiges Grid
- [ ] `components/cv-templates/shared/SectionGuard.tsx` — Orphan Prevention
- [ ] `components/cv-templates/shared/CompactDualColumn.tsx` — Inline-Layout
- [ ] `lib/utils/cv-template-helpers.ts` — `truncateDescription()` Utility
- [ ] `TechTemplate.tsx` — `gap` → `marginRight`/`marginBottom` (3 Stellen)
- [ ] `ClassicTemplate.tsx` — `gap` → `marginRight` (1 Stelle, vor Deprecation)

### Phase 2 — Templates
- [ ] `ValleyTemplate.tsx` — Skills: comma → tags, Languages: text → dots, Certs: bullet → grid, Page Budget
- [ ] `ModernTemplate.tsx` — Skills sidebar: text → tags, Accent: `#2563EB` → `#012e7a`
- [ ] `TechTemplate.tsx` — Language-Dots, Page Budget
- [ ] `ClassicTemplate.tsx` — Delete file
- [ ] `PdfViewerWrapper.tsx` — Remove Classic import + case, fallback → Valley
- [ ] `DownloadButton.tsx` — Remove Classic import + case, fallback → Valley
- [ ] Template-Selector UI — Remove Classic option
- [ ] DB Migration — `supabase/migrations/YYYYMMDD_deprecate_classic_template.sql`

### Phase 3 — Parser & Polish
- [ ] `cv-parser.ts` — V2 JSON Output Schema, `level`, `credentialUrl`, `targetRole`
- [ ] `PdfViewerWrapper.tsx` Mobile — `blue-600` → `#012e7a`
- [ ] `DEFERRED_FEATURES.md` — DOCX-Export als D6, Multilingual Section Labels als D7
- [ ] Verification — PDF Download für Valley, Modern, Tech mit vollständigem CV
- [ ] `ARCHITECTURE.md` — Template-Liste aktualisieren (Classic entfernt)
- [ ] `CLAUDE.md` — Recent Fixes Eintrag

---

> **Letztes Update:** 2026-03-10 (V2.1)  
> **Owner:** Yannik Galetto  
> **Engine-Entscheidung:** @react-pdf/renderer (Status Quo bestätigt)  
> **Template-Entscheidung:** Classic deprecaten, Valley/Tech aufwerten  
> **Neu in V2:** Page Layout Engine (§8), Visual Density Rules (§9), gap-Migration, Orphan Prevention

---

## 12. CV OPTIMIZER — HARDENING PATTERNS (2026-03-10)

Lessons learned aus der Deployment-Readiness-Session.

### 12.1 Summary Toggle

- `showSummary` MUSS explizit in der API-Request-Payload gesendet werden (nicht nur `summaryMode`)
- API-Prompt: Unterscheide drei Zustände: `showSummary=false` → "KEIN Summary", `summaryMode='compact'` → 2-Satz-Limit, default → Standard
- Valley-Template: `isSummaryDisabled` Gate ENTFERNT — Summary-Toggle gilt für ALLE Templates
- `applyCVOptSettings` filtert `summary` korrekt wenn `showSummary=false` → kein Handlungsbedarf dort

### 12.2 Zod-Schema — Lenienz-Gebot

**REGEL:** Zod-Schemas für KI-Output MÜSSEN lenient sein. Die KI liefert korrekte Inhalte aber inkonsistente Struktur.

```typescript
// ❌ ZU STRIKT — schlägt bei jeder kleinen Claude-Variation fehl
section: z.enum(['experience', 'education', 'skills', 'languages', 'personalInfo'])
reason: z.string() // required

// ✅ KORREKT — tolerant für AI-Output
section: z.string()  // Akzeptiert alles (certifications, summary, etc.)
reason: z.string().nullish().default('KI-Optimierung')
before: z.any().transform(v => v == null ? undefined : String(v)).optional()
after: z.any().transform(v => v == null ? undefined : String(v)).optional()
requirementRef: z.object({ requirement: z.string().nullish() }).nullish()
```

### 12.3 Sanitization vor Zod-Validation

Immer einen Sanitize-Pass **vor** Zod einbauen für KI-Output:

```typescript
rawJson.changes = rawJson.changes.map((c: any, idx: number) => ({
    id: c.id || `change-${idx + 1}`,
    target: {
        section: c.target?.section || 'experience',
        entityId: c.target?.entityId ?? null,
        field: c.target?.field ?? null,
        bulletId: c.target?.bulletId ?? null,
    },
    type: c.type || 'modify',
    before: Array.isArray(c.before) ? c.before.join(', ') : (c.before ?? undefined),
    after: Array.isArray(c.after) ? c.after.join(', ') : (c.after ?? undefined),
    reason: c.reason || 'KI-Optimierung',
    requirementRef: c.requirementRef ?? null,
}));
```

### 12.4 Error-Handling — Deployment-Ready Pattern

**REGEL:** Kein `throw` in API-Routes außer dem äußeren `catch`. Alle Fehlerzustände explizit mit `return NextResponse.json()`.

```typescript
// ❌ FALSCH — Error wird in genericem catch aufgefangen, Client sieht "Internal server error"
if (!jsonMatch) throw new Error('Claude returned no valid JSON block');

// ✅ RICHTIG — Client sieht German error message, HTTP status ist korrekt semantisch
if (!jsonMatch) {
    return NextResponse.json(
        { success: false, error: 'Die KI hat kein gültiges JSON zurückgegeben. Bitte erneut versuchen.' },
        { status: 502 } // 502 = AI/Upstream Fehler, 500 = DB/Server Fehler
    );
}
```

### 12.5 CV Parser — Chrono-Sort & OCR-robustheit

Azure OCR kann Text aus mehrspaltigem PDF-Layout in nicht-linearer Reihenfolge liefern. Dadurch können Dates und Companies falsch zugeordnet werden.

**Zwei-Schicht-Schutz in `cv-parser.ts`:**

1. **Prompt-Anweisung** (Regel 6+7): Claude muss vollständigen Text lesen, semantisch zuordnen, nicht OCR-Reihenfolge übernehmen
2. **`sortExperienceByDate()` Post-Processing** (deterministisch): Nach Claude-Output immer chronologisch sortieren
   - Erkennt: `Heute`, `Present`, `MM.YYYY`, `MM/YYYY`, `YYYY`
   - Sort: newest-first (Index 0 = aktuellste Position)

> ⚠️ **WICHTIG bei Azure-Key-Problemen:** Azure 401 = Key abgelaufen. Neuen Key im Azure Portal holen, in `.env.local` ersetzen, `npm run dev` neu starten.

### 12.6 Valley Template — 2-Seiten-Garantie

- Max 3 Bullet-Points: `.slice(0, 3)` im Template (Template-Level Hard-Cap, unabhängig von KI)
- Zertifikate: In **rechte Spalte des Dual-Column-Layouts** (unter Sprachen, Seite 2)
- KI-Prompt: HARD RULE "2 A4 Seiten" + Self-Judge-Validation Step
- Budget: Seite 1 = Header + Summary + Experience + Education | Seite 2 = Skills + Languages + Certs (rechte Spalte)

### 12.7 Button-Hydration-Fix

**REGEL:** React/Next.js erlaubt kein `<button>` als Descendant von `<button>`. Immer prüfen.

```tsx
// ❌ Verursacht Hydration-Error
<button onClick={toggleExpand}>
    <button onClick={handleAction}>...</button>
</button>

// ✅ Korrekt — interaktives div statt verschachteltem button
<div role="button" tabIndex={0} onClick={handleAction} 
     onKeyDown={e => { if (e.key === 'Enter') handleAction(); }}
     aria-label="...">
    ...
</div>
```

### 12.8 CV Data Integrity — Mandatory Rules (2026-04-17)

**Root Cause:** `proposal.translated` in Production-DB war korrupt (PII null, 6→2 Stationen).  
**Ursache:** Zwischenzeitliches Deployment auf Vercel mutierte `translatedCv` direkt.

**REGELN die NIEMALS verletzt werden dürfen:**

| # | Regel | Datei |
|---|-------|-------|
| **R1** | `pruneForOptimizer()` ist AUSSCHLIESSLICH für den AI-Prompt-Payload. Das gespeicherte `proposal.translated` MUSS volle PII haben. | `cv-payload-pruner.ts` |
| **R2** | Vor dem DB-Write: Integrity Guard MUSS PII (email, phone, location, linkedin, website) aus `cv_structured_data` restoren. | `route.ts` (§610-653) |
| **R3** | Translator-Restore MUSS nach AI-Translation laufen: company, dateRangeText, institution, grade idempotent aus Original-CV kopieren. | `cv-translator.ts` (§172-213) |
| **R4** | `translatedCv` ist NICHT das Speicher-Objekt. Immer `safeTranslated = JSON.parse(JSON.stringify(translatedCv))` als neues Objekt erstellen. | Jeder neue Optimizer-Code |
| **R5** | Layout-Fix sendet IMMER `cvData` (immutables Original), niemals `editablePdfData` (display-gefiltert). | `OptimizerWizard.tsx` |
| **R6** | `cv-payload-pruner.ts` filtert `certifications` (MIT i) — NICHT `certificates`. Feldname exakt wie im Schema. | `cv-payload-pruner.ts` |

**Verification Query nach jeder Optimizer-Änderung:**
```sql
SELECT 
    cv_optimization_proposal->'translated'->'personalInfo'->>'email' AS email,
    jsonb_array_length(cv_optimization_proposal->'translated'->'experience') AS exp_count
FROM job_queue
WHERE cv_optimization_proposal IS NOT NULL
ORDER BY created_at DESC LIMIT 3;
-- Email darf NIEMALS null sein. exp_count muss >= orig exp_count sein.
```


