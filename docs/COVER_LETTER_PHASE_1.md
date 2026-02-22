# COVER_LETTER_PHASE_1.md
# Cover Letter — Phase 1: Setup-Kontext Wizard (Pre-Generation)

**Version:** 1.0  
**Status:** READY TO EXECUTE  
**Owner:** Pathly V2.0  
**Branch:** `feature/cover-letter-wizard-phase1`  
**Last Updated:** 2026-02-22

---

## MISSION

Ersetze den bestehenden DEMO_MODE-Platzhalter im Cover-Letter-Tab durch einen
interaktiven 3-Step-Wizard, der den User vor der KI-Generierung aktiv am
Ergebnis beteiligt: Auswahl eines Perplexity-gestützten Aufhängers (mit
Quellennachweis), Mapping von max. 3 CV-Stationen auf Job-Anforderungen, und
Kalibrierung der Tonalität auf die eigene Schreibstimme. Der Output dieses
Wizards ist ein typisierter `CoverLetterSetupContext`, der in Phase 2 den
Master-Prompt für Claude strukturiert befüllt.

---

## PREREQUISITES — READ FIRST! 🚨

**Before starting ANY work, you MUST read AND cross-reference these documents:**

1. **`docs/ARCHITECTURE.md`** — System Architecture & Data Flow
   - Verstehe den Agent-5-Flow (Cover Letter Generator)
   - Prüfe wie `company_research` mit `job_queue` verknüpft ist
   - Verstehe den Unterschied zwischen `generateCoverLetter()` und
     `generateCoverLetterWithQuality()` in `lib/services/cover-letter-generator.ts`

2. **`docs/DESIGN_SYSTEM.md`** — UI/UX Standards
   - Notion-Linear Hybrid Philosophie
   - Color Tokens: `--bg-secondary: #F7F7F5`, `--border-focus: #0066FF`,
     `--text-tertiary: #A8A29E`
   - Framer Motion für alle interaktiven Elemente
   - Keine Dark-Mode-Styles (explizit ausgeschlossen in CLAUDE.md)

3. **`CLAUDE.md`** — **CRITICAL: "Reduce Complexity!"**
   - MVP First: Wenn ein Step 3 Implementierungswege hat → nimm den einfachsten
   - Max 200 Zeilen pro Datei — bei Überschreitung splitten
   - Schreib-Stil-Regeln: Mindestens 3 Konjunktionen, keine KI-Floskeln

4. **`AGENTS.md`** — Agent Architecture
   - Agent 3 (Company Research) liefert die Perplexity-Daten für Step A
   - Agent 5 (Cover Letter) empfängt den `CoverLetterSetupContext` aus diesem Wizard
   - Prüfe: `lib/services/company-enrichment.ts` → `enrichCompany()` Rückgabe-Shape
   - Prüfe: `lib/services/quote-matcher.ts` → `QuoteSuggestion` Interface

5. **`database/schema.sql`** — Database Schema
   - Tabelle `company_research`: Felder `intel_data`, `suggested_quotes`,
     `recent_news`, `perplexity_citations`, `linkedin_activity`
   - Tabelle `documents`: Filter `document_type = 'cover_letter'` für Style-Sample
   - Tabelle `job_queue`: Felder `requirements`, `metadata`
   - Tabelle `user_profiles`: Feld `pii_encrypted` (DSGVO — NIEMALS direkt lesen,
     nur über entschlüsselte Methoden)

---

## EXECUTION PRINCIPLES

### 1. 🔍 Cross-Reference (Abgleich)
Before writing ANY code:
- Lies `lib/services/company-enrichment.ts` komplett — insbesondere das
  `EnrichmentResult` Interface und wie `perplexity_citations` befüllt wird
- Lies `lib/services/quote-matcher.ts` — `QuoteSuggestion` hat bereits
  `source`, `matched_value`, `relevance_score`; diese können direkt in
  `SelectedHook` gemappt werden
- Prüfe `components/cover-letter/` — welche Sub-Komponenten existieren bereits
- Prüfe `app/dashboard/components/workflow-steps/step-4-cover-letter.tsx` —
  verstehe den exakten State-Flow, bevor du ihn anfasst

### 2. 🧹 Reduce Complexity
- **MVP first** — Auto-Fill (Magic Button) ist Nice-to-have, aber nicht
  Blocker für Phase 2
- **Reuse** — `QuoteSuggestion.source` und `QuoteSuggestion.matched_value`
  bereits vorhanden → nicht neu erfinden
- **Max 200 Zeilen pro Datei** — `CoverLetterWizard.tsx` ist Parent-only,
  alle Steps sind eigene Dateien

### 3. 📁 Proper Filing
```
types/cover-letter-setup.ts                         ← Daten-Vertrag
stores/useCoverLetterSetupStore.ts                  ← Wizard State
app/api/cover-letter/setup-data/route.ts            ← Setup Data Endpoint
app/dashboard/components/workflow-steps/
  cover-letter-wizard/
    CoverLetterWizard.tsx                            ← Parent + Progress Bar
    WizardProgressBar.tsx
    steps/
      StepHookSelection.tsx
      StepStationMapping.tsx
      StepToneConfig.tsx
    cards/
      HookCard.tsx
      CVStationCard.tsx
      ToneCard.tsx
```

### 4. 🎖️ Senior Engineer Autonomy
- Graceful Degradation eigenständig implementieren (kein Crash wenn
  Perplexity keine Daten liefert)
- TypeScript strict — kein `any`, kein `as unknown`
- Entscheide selbst ob ein Framer-Motion-Variant inline oder in einer
  separaten `variants.ts` besser ist

### 5. 🧪 Interoperability Testing
Nach der Implementierung verifizieren:
- [ ] `npx tsc --noEmit` passes (keine neuen TypeScript-Fehler)
- [ ] `npm run build` passes
- [ ] `CoverLetterSetupContext` wird korrekt an `step-4-cover-letter.tsx`
      übergeben und in Phase 2 (wenn bereit) verarbeitet
- [ ] Bestehende Tabs (Steckbrief, CV Match, CV Opt.) sind nicht beeinflusst
- [ ] `GET /api/cover-letter/setup-data?jobId=xxx` antwortet mit korrekter
      Shape (auch mit leeren Arrays — kein 500)
- [ ] Wizard-State überlebt Page-Reload via persist (localStorage)

### 6. ⚡ Efficiency
- Setup-Data-Endpoint: Alle DB-Queries parallel mit `Promise.all()` ausführen
  (company_research, user_profiles, documents gleichzeitig fetchen)
- Keine doppelten Supabase-Clients instanziieren — bestehenden
  Client aus `@/lib/supabase` nutzen

### 7. 📝 Additional Standards
- **Logging:** `✅ [WizardSetup]`, `❌ [WizardSetup]`, `⚠️ [WizardSetup]`
- **Error Boundary:** Wizard wrapt in `<ErrorBoundary fallback={...}>` —
  kein White Screen of Death
- **Imports:** Konsistent mit `@/`-Aliases
- **Kommentare:** Nur nicht-offensichtliche Logik kommentieren

---

## CURRENT STATE

- ✅ `company-enrichment.ts` liefert `perplexity_citations[]`,
     `suggested_quotes[]`, `recent_news[]`, `company_values[]`
- ✅ `quote-matcher.ts` liefert `QuoteSuggestion` mit `source`,
     `matched_value`, `relevance_score`, `value_connection`
- ✅ `cv-optimizer.ts` verarbeitet `cv_structured_data` (experience[])
- ✅ `cover-letter-validator.ts` mit Hard Rules (forbidden phrases, word count)
- ✅ `step-4-cover-letter.tsx` existiert mit vollständigem State-Flow
- ✅ Design System definiert (Notion-Linear Hybrid)
- ✅ Zustand bereits im Tech-Stack (CLAUDE.md)
- ⚠️ `cover-letter-generator.ts` → `buildSystemPrompt()` ist ein flacher
     JSON-Blob ohne Paragraph-Struktur (wird in Phase 2 ersetzt)
- ⚠️ `generateCoverLetterWithQuality()` fetcht `selectedQuote` ungezielt
     (`[0]` — erstes Element) → Phase 1 liefert die User-Entscheidung
- ❌ `CoverLetterSetupContext` Interface existiert nicht
- ❌ `useCoverLetterSetupStore` existiert nicht
- ❌ `/api/cover-letter/setup-data` Endpoint existiert nicht
- ❌ `CoverLetterWizard.tsx` und alle Sub-Komponenten existieren nicht
- ❌ **`DEMO_MODE = true`** — der gesamte Platzhalter ist aktiv und muss
     entfernt werden

---

## YOUR TASK

---

### 1.0: DEMOLITION — DEMO_MODE Entfernen

**Goal:** Entferne alle Platzhalter-Konstanten und Branches aus
`step-4-cover-letter.tsx`, die den echten Flow verhindern.

**Files to touch:**
`app/dashboard/components/workflow-steps/step-4-cover-letter.tsx`

**Implementation:**
```diff
- const DEMO_MODE = true;

- const MOCK_COVER_LETTER = `Sehr geehrte Damen und Herren...`

- const MOCK_RESULT: GenerationResult = {
-   coverLetter: MOCK_COVER_LETTER,
-   qualityScores: { ... },
-   iterations: 2,
-   validation: { ... }
- };

// In generateCoverLetter():
- if (DEMO_MODE) {
-   await new Promise(resolve => setTimeout(resolve, 1500));
-   setResult(MOCK_RESULT);
-   console.log('✅ Cover letter generated (DEMO MODE)');
-   if (onComplete) onComplete();
-   setIsLoading(false);
-   setIsRegenerating(false);
-   return;
- }

// Ersetze den Entry-Guard:
- if (!started && !result) {
-   return (
-     <div className="...">
-       <Button onClick={() => setStarted(true)}>Jetzt generieren</Button>
-     </div>
-   )
- }

// Durch:
+ if (!wizardCompleted && !result) {
+   return (
+     <CoverLetterWizard
+       jobId={jobId}
+       companyName={companyName}
+       onComplete={(context: CoverLetterSetupContext) => {
+         setWizardContext(context);
+         setWizardCompleted(true);
+         generateCoverLetter(context);
+       }}
+     />
+   );
+ }

// Neuer State:
+ const [wizardCompleted, setWizardCompleted] = useState(false);
+ const [wizardContext, setWizardContext] = useState<CoverLetterSetupContext | null>(null);
```

**Definition of Done:**
- [ ] `DEMO_MODE` const nicht mehr vorhanden
- [ ] `MOCK_COVER_LETTER` const nicht mehr vorhanden
- [ ] `MOCK_RESULT` const nicht mehr vorhanden
- [ ] Kein `if (DEMO_MODE)` Branch mehr vorhanden
- [ ] `npm run build` ohne Fehler

---

### 1.1: Daten-Vertrag — `types/cover-letter-setup.ts`

**Goal:** Typisierter Vertrag zwischen UI-Wizard und `buildSystemPrompt()`.
Dieses Interface ist das Rückgrat von Phase 1 UND Phase 2.

**Implementation:**
```typescript
// types/cover-letter-setup.ts

export type HookType = 'news' | 'value' | 'quote' | 'linkedin' | 'manual';
export type TonePreset = 'data-driven' | 'storytelling' | 'formal';
export type TargetLanguage = 'de' | 'en';

// ─── Step A Output ───────────────────────────────────────────────
export interface SelectedHook {
  id: string;             // Eindeutige ID für Wiederherstellung nach Reload
  type: HookType;
  label: string;          // Kurztitel (z.B. "Aktuelles Wachstum")
  content: string;        // Der Aufhänger-Text selbst
  sourceName: string;     // z.B. "Handelsblatt" | "Enpal.de"
  sourceUrl: string;      // Direkt aus perplexity_citations[] — echter Link
  sourceAge: string;      // z.B. "vor 5 Tagen" | "aktuell"
  relevanceScore: number; // 0-1, aus QuoteSuggestion.relevance_score
}

// ─── Step B Output ───────────────────────────────────────────────
export interface SelectedCVStation {
  stationIndex: 1 | 2 | 3;        // Reihenfolge der User-Auswahl
  company: string;                  // z.B. "Fraunhofer FOKUS"
  role: string;                     // z.B. "Innovation Consultant"
  period: string;                   // z.B. "11.2023 - Heute"
  keyBullet: string;                // Wichtigster Bullet-Point dieser Station

  // CRITICAL für Phase 2 Prompt-Qualität:
  // Welche Job-Anforderung beweist diese Station?
  matchedRequirement: string;       // z.B. "5-7 Jahre Partnerships"
  intent: string;                   // z.B. "Beweis für strategische Kooperationen"
}

// ─── Step C Output ───────────────────────────────────────────────
export interface ToneConfig {
  preset: TonePreset;
  targetLanguage: TargetLanguage;      // Sprache des Anschreibens
  hasStyleSample: boolean;             // Wurde altes Anschreiben hochgeladen?
  styleWarningAcknowledged: boolean;   // User hat Anti-GPT-Callout gelesen
}

// ─── Gesamt-Vertrag (wird an buildSystemPrompt() übergeben) ──────
export interface CoverLetterSetupContext {
  jobId: string;
  companyName: string;
  selectedHook: SelectedHook;
  cvStations: SelectedCVStation[];   // Min 1, Max 3
  tone: ToneConfig;
  autoFilled: boolean;               // Wurde Auto-Fill verwendet?
  completedAt: string;               // ISO Timestamp
}

// ─── API Response Shape ──────────────────────────────────────────
export interface SetupDataResponse {
  // Step A
  hooks: SelectedHook[];
  hasPerplexityData: boolean;

  // Step B
  cvStations: Array<{
    company: string;
    role: string;
    period: string;
    bullets: string[];
  }>;
  jobRequirements: string[];      // Top 3 aus job_queue.requirements

  // Step C
  hasStyleSample: boolean;
  styleAnalysisSummary: string;   // z.B. "Formal, Ø 20 Wörter/Satz"
  detectedJobLanguage: TargetLanguage;
}
```

---

### 1.2: Zustand Store — `stores/useCoverLetterSetupStore.ts`

**Goal:** Wizard-State überlebt Page-Reload. User verliert keine Auswahl
beim versehentlichen Tab-Wechsel.

**Implementation:**
```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  CoverLetterSetupContext,
  SelectedHook,
  SelectedCVStation,
  ToneConfig,
} from '@/types/cover-letter-setup';

interface SetupStore {
  currentStep: 1 | 2 | 3;
  jobId: string | null;
  selectedHook: SelectedHook | null;
  cvStations: SelectedCVStation[];
  tone: ToneConfig | null;

  // Actions
  setStep: (step: 1 | 2 | 3) => void;
  initForJob: (jobId: string) => void;
  setHook: (hook: SelectedHook) => void;
  toggleStation: (station: Omit<SelectedCVStation, 'stationIndex'>) => void;
  setTone: (tone: ToneConfig) => void;
  reset: () => void;

  // Computed
  isStepComplete: (step: 1 | 2 | 3) => boolean;
  canAutoFill: () => boolean;
  buildContext: () => CoverLetterSetupContext | null;
}

export const useCoverLetterSetupStore = create<SetupStore>()(
  persist(
    (set, get) => ({
      currentStep: 1,
      jobId: null,
      selectedHook: null,
      cvStations: [],
      tone: null,

      setStep: (step) => set({ currentStep: step }),

      initForJob: (jobId) => {
        const current = get().jobId;
        // Reset only if switching to a different job
        if (current !== jobId) {
          set({ jobId, currentStep: 1, selectedHook: null, cvStations: [], tone: null });
          console.log(`✅ [WizardSetup] Initialized for job: ${jobId}`);
        }
      },

      setHook: (hook) => {
        set({ selectedHook: hook, currentStep: 2 });
        console.log(`✅ [WizardSetup] Hook selected: ${hook.label}`);
      },

      toggleStation: (station) => {
        const current = get().cvStations;
        const exists = current.find(
          (s) => s.company === station.company && s.role === station.role
        );
        if (exists) {
          // De-select: Remove and re-index
          const filtered = current
            .filter((s) => s !== exists)
            .map((s, i) => ({ ...s, stationIndex: (i + 1) as 1 | 2 | 3 }));
          set({ cvStations: filtered });
        } else if (current.length < 3) {
          const withIndex: SelectedCVStation = {
            ...station,
            stationIndex: (current.length + 1) as 1 | 2 | 3,
          };
          set({ cvStations: [...current, withIndex] });
          console.log(`✅ [WizardSetup] Station added: ${station.role} @ ${station.company}`);
        }
      },

      setTone: (tone) => {
        set({ tone });
        console.log(`✅ [WizardSetup] Tone set: ${tone.preset} / ${tone.targetLanguage}`);
      },

      reset: () => set({
        currentStep: 1,
        jobId: null,
        selectedHook: null,
        cvStations: [],
        tone: null,
      }),

      isStepComplete: (step) => {
        const s = get();
        if (step === 1) return !!s.selectedHook;
        if (step === 2) return s.cvStations.length >= 1;
        if (step === 3) return !!s.tone?.styleWarningAcknowledged;
        return false;
      },

      canAutoFill: () => true, // Immer möglich, Daten kommen vom API

      buildContext: (): CoverLetterSetupContext | null => {
        const s = get();
        if (!s.jobId || !s.selectedHook || s.cvStations.length === 0 || !s.tone) {
          console.warn('⚠️ [WizardSetup] Cannot build context — incomplete state');
          return null;
        }
        return {
          jobId: s.jobId,
          companyName: s.selectedHook.content,
          selectedHook: s.selectedHook,
          cvStations: s.cvStations,
          tone: s.tone,
          autoFilled: false,
          completedAt: new Date().toISOString(),
        };
      },
    }),
    { name: 'cover-letter-setup', version: 1 }
  )
);
```

---

### 1.3: API Endpoint — `app/api/cover-letter/setup-data/route.ts`

**Goal:** Einmaliger Fetch beim Öffnen des Wizards. Alle DB-Queries parallel.
Kein Step-by-Step Loading — User sieht nie einen partiell geladenen Wizard.

**Implementation:**
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import type { SetupDataResponse, SelectedHook, TargetLanguage } from '@/types/cover-letter-setup';

export async function GET(req: NextRequest) {
  const jobId = req.nextUrl.searchParams.get('jobId');
  if (!jobId) return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });

  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    // ─── Parallel Queries ───────────────────────────────────────
    const [jobRes, docsRes] = await Promise.all([
      supabase
        .from('job_queue')
        .select(`
          requirements,
          metadata,
          company,
          company_research (
            intel_data,
            suggested_quotes,
            recent_news,
            linkedin_activity,
            perplexity_citations
          )
        `)
        .eq('id', jobId)
        .single(),

      supabase
        .from('documents')
        .select('metadata, created_at')
        .eq('user_id', user.id)
        .eq('document_type', 'cover_letter')
        .order('created_at', { ascending: false })
        .limit(1),
    ]);

    if (jobRes.error || !jobRes.data) {
      console.error('❌ [SetupData] Job not found:', jobRes.error);
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const job = jobRes.data;
    const research = (job as any).company_research?.[0];
    const styleDoc = docsRes.data?.[0];

    // ─── Build Hooks (Step A) ────────────────────────────────────
    const citations: string[] = research?.perplexity_citations || [];
    const hooks: SelectedHook[] = [];

    // From recent_news
    (research?.recent_news || []).slice(0, 2).forEach((news: string, i: number) => {
      hooks.push({
        id: `news-${i}`,
        type: 'news',
        label: 'Aktuelle News',
        content: news,
        sourceName: extractDomain(citations[i] || ''),
        sourceUrl: citations[i] || '',
        sourceAge: 'aktuell',
        relevanceScore: 0.8,
      });
    });

    // From company_values
    (research?.intel_data?.company_values || []).slice(0, 1).forEach((val: string, i: number) => {
      hooks.push({
        id: `value-${i}`,
        type: 'value',
        label: 'Unternehmenswert',
        content: val,
        sourceName: extractDomain(citations[citations.length - 1] || ''),
        sourceUrl: citations[citations.length - 1] || '',
        sourceAge: 'von der Website',
        relevanceScore: 0.9,
      });
    });

    // Fallback: Manual entry if no Perplexity data
    if (hooks.length === 0) {
      hooks.push({
        id: 'manual-0',
        type: 'manual',
        label: 'Eigenen Aufhänger schreiben',
        content: '',
        sourceName: '',
        sourceUrl: '',
        sourceAge: '',
        relevanceScore: 0,
      });
    }

    // ─── CV Stations (Step B) ────────────────────────────────────
    const cvData = (job as any).metadata?.cv_structured_data?.experience || [];
    const requirements: string[] = ((job as any).requirements || []).slice(0, 3);

    // ─── Style Info (Step C) ─────────────────────────────────────
    const hasStyleSample = !!styleDoc;
    const styleAnalysisSummary = styleDoc?.metadata?.style_analysis
      ? `${styleDoc.metadata.style_analysis.tone || 'Formal'}, Ø ${styleDoc.metadata.style_analysis.avg_sentence_length || '?'} Wörter/Satz`
      : 'Kein Style-Sample — Standardton';

    const detectedJobLanguage: TargetLanguage =
      ((job as any).metadata?.language || 'de') as TargetLanguage;

    const response: SetupDataResponse = {
      hooks,
      hasPerplexityData: hooks.some((h) => h.type !== 'manual'),
      cvStations: cvData,
      jobRequirements: requirements,
      hasStyleSample,
      styleAnalysisSummary,
      detectedJobLanguage,
    };

    console.log(`✅ [SetupData] Built for job ${jobId}: ${hooks.length} hooks, ${cvData.length} stations`);
    return NextResponse.json(response);

  } catch (err) {
    console.error('❌ [SetupData] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return url || 'Unbekannte Quelle';
  }
}
```

---

### 1.4: Wizard Parent — `CoverLetterWizard.tsx`

**Goal:** Orchestriert alle 3 Steps, zeigt Progress Bar, übergibt
`CoverLetterSetupContext` beim Abschluss.

**Implementation:**
```typescript
'use client';

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCoverLetterSetupStore } from '@/stores/useCoverLetterSetupStore';
import { WizardProgressBar } from './WizardProgressBar';
import { StepHookSelection } from './steps/StepHookSelection';
import { StepStationMapping } from './steps/StepStationMapping';
import { StepToneConfig } from './steps/StepToneConfig';
import type { CoverLetterSetupContext } from '@/types/cover-letter-setup';

interface Props {
  jobId: string;
  companyName: string;
  onComplete: (context: CoverLetterSetupContext) => void;
}

export function CoverLetterWizard({ jobId, companyName, onComplete }: Props) {
  const { currentStep, setStep, initForJob, buildContext } =
    useCoverLetterSetupStore();

  useEffect(() => {
    initForJob(jobId);
  }, [jobId]);

  const handleFinish = () => {
    const context = buildContext();
    if (!context) return;
    onComplete(context);
  };

  return (
    <div className="px-5 py-4 bg-[#FAFAF9] space-y-4 min-h-[400px]">
      <WizardProgressBar currentStep={currentStep} />

      <AnimatePresence mode="wait">
        {currentStep === 1 && (
          <motion.div key="step-1"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}>
            <StepHookSelection
              jobId={jobId}
              companyName={companyName}
              onNext={() => setStep(2)}
            />
          </motion.div>
        )}

        {currentStep === 2 && (
          <motion.div key="step-2"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}>
            <StepStationMapping
              jobId={jobId}
              onBack={() => setStep(1)}
              onNext={() => setStep(3)}
            />
          </motion.div>
        )}

        {currentStep === 3 && (
          <motion.div key="step-3"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}>
            <StepToneConfig
              jobId={jobId}
              onBack={() => setStep(2)}
              onGenerate={handleFinish}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
```

---

### 1.5: CRITICAL UX REFINEMENTS

#### A: Auto-Fill Magic Button
```typescript
// Oben rechts im Wizard neben WizardProgressBar
const handleAutoFill = (setupData: SetupDataResponse) => {
  // Besten Hook wählen (höchster relevanceScore)
  const bestHook = [...setupData.hooks]
    .sort((a, b) => b.relevanceScore - a.relevanceScore)[0];
  setHook(bestHook);

  // Top-3 Stationen wählen
  setupData.cvStations.slice(0, 3).forEach((s, i) => {
    toggleStation({
      ...s,
      keyBullet: s.bullets[0] || '',
      matchedRequirement: setupData.jobRequirements[i] || '',
      intent: `Beweis für: ${setupData.jobRequirements[i] || 'Berufserfahrung'}`,
    });
  });

  // Safe Default Tone
  setTone({
    preset: 'data-driven',
    targetLanguage: setupData.detectedJobLanguage,
    hasStyleSample: setupData.hasStyleSample,
    styleWarningAcknowledged: true,
  });
};

// Button (top-right in Wizard header):
// <button onClick={() => handleAutoFill(setupData)}>
//   <Sparkles className="w-3.5 h-3.5" /> Auto-Fill
// </button>
```

#### B: Language Toggle (StepToneConfig)
```typescript
// Kleiner Segmented Control oben rechts in Step C
// [ 🇩🇪 DE | 🇬🇧 EN ]
// Default: detectedJobLanguage aus SetupDataResponse
// Speichert als tone.targetLanguage im Store
```

#### C: Mobile Layout Step B
```
Desktop: grid-cols-2 (Requirements links, Stationen rechts)
Mobile:  Stacked. Requirements als Accordion oben.
         Sticky Summary Bar unten: "2/3 gewählt | [Weiter →]"
```

#### D: Intent-Matching (CVStationCard)
```typescript
// Wenn User Station klickt → optionales Inline-Dropdown:
// "Für welche Anforderung ist das der Beweis?"
// → wählt aus jobRequirements[] (Radio-Liste, max 3 Items)
// → speichert als matchedRequirement im Store

// Auto-Suggestion (keyword matching):
const suggestMatch = (bullets: string[], requirements: string[]): string => {
  return requirements.find((req) =>
    bullets.some((b) =>
      b.toLowerCase().split(' ').some((word) =>
        req.toLowerCase().includes(word) && word.length > 4
      )
    )
  ) || requirements[0] || '';
};
```

---

### 1.6: DESIGN SPEC (nach DESIGN_SYSTEM.md)

#### WizardProgressBar
```
Completed Step:  w-6 h-6 rounded-full bg-[#002e7a] text-white text-xs font-semibold
Active Step:     w-6 h-6 rounded-full border-2 border-[#002e7a] bg-white text-[#002e7a]
Inactive Step:   w-6 h-6 rounded-full bg-[#E7E7E5] text-[#73726E]
Connector On:    flex-1 h-px bg-[#002e7a]
Connector Off:   flex-1 h-px bg-[#E7E7E5]
Step Label:      text-xs font-semibold text-[#002e7a] (active) | text-[#73726E] (inactive)
Sub-Label:       text-[10px] text-[#A8A29E]
```

#### HookCard
```
Default:   bg-white border border-[#E7E7E5] rounded-lg p-3 shadow-xs
Hover:     shadow-md scale(1.01) [Framer Motion whileHover]
Selected:  border-2 border-[#002e7a] bg-[#f0f4ff]
Source:    text-[10px] text-[#A8A29E] flex items-center gap-1 mt-2
           → ExternalLink icon w-3 h-3
           → <a href={sourceUrl} target="_blank" rel="noopener"> (echter Link!)
No-Data:   Freitext-Input mit Placeholder "Eigenen Aufhänger eingeben..."
```

#### CVStationCard
```
Default:   bg-white border border-[#E7E7E5] rounded-md px-3 py-2
Selected:  border-2 border-[#002e7a] bg-[#f0f4ff]
Disabled:  opacity-40 cursor-not-allowed (wenn 3/3 bereits gewählt)
Badge:     w-5 h-5 rounded-full bg-[#002e7a] text-white text-[10px] font-bold
```

#### Anti-GPT Callout (StepToneConfig)
```
Container: bg-[#EEF3FF] border-l-4 border-[#002e7a] rounded-md p-4 mb-4
Icon:      Info (lucide) text-[#002e7a] w-4 h-4 shrink-0
Title:     text-xs font-semibold text-[#002e7a]
Body:      text-xs text-[#37352F] leading-relaxed mt-1
Text:      "Wir kalibrieren Claude auf DEINE Schreibweise aus deinem hochgeladenen
            Anschreiben. Falls dein Text bereits GPT-typische Formulierungen
            enthält, wird das Ergebnis genauso klingen. Wähle zusätzlich einen
            Stil, der zur Unternehmenskultur passt — aber immer in deiner Stimme."
```

---

## GRACEFUL DEGRADATION MAP

| Scenario | Behaviour | UX |
|---|---|---|
| Perplexity liefert keine Daten | `hooks[]` = 1 Manual-Entry | Freitext statt Cards |
| `confidence_score < 0.3` | Warnung in Step A | Badge "⚠️ Wenige Daten" |
| `cv_structured_data` leer | `cvStations[]` = [] | Freitext-Input in Step B |
| Kein altes Anschreiben | `hasStyleSample = false` | Gelbes Warning-Badge |
| `/setup-data` Timeout >10s | Skeleton + Retry-Button | Kein White-Screen |
| Wizard-Store korrupt | `initForJob()` → reset | Zurück zu Step 1 |
| 0 Stationen gewählt | `onNext()` disabled | Button: "min. 1 Station wählen" |
| `buildContext()` returns null | Kein `onComplete()` call | Error-Toast |

---

## VERIFICATION CHECKLIST

- [ ] Alle Prerequisite-Docs gelesen und cross-referenced
- [ ] `DEMO_MODE` + alle MOCK-Konstanten entfernt — Build läuft durch
- [ ] `npx tsc --noEmit` passes (0 TypeScript-Fehler)
- [ ] `GET /api/cover-letter/setup-data?jobId=xxx` — korrekte Shape, kein 500
- [ ] Wizard rendert alle 3 Steps sequenziell
- [ ] Step A: Perplexity-Cards mit echten `sourceUrl`-Links (kein `#`)
- [ ] Step B: Stationen selektierbar, Badge 1→2→3, De-Selektion re-nummeriert
- [ ] Step C: Language Toggle ändert `tone.targetLanguage`
- [ ] Step C: Anti-GPT Callout sichtbar, `styleWarningAcknowledged` wird gesetzt
- [ ] Auto-Fill selektiert Hook + Stationen + Tone in < 100ms
- [ ] `buildContext()` liefert valides `CoverLetterSetupContext`-Objekt
- [ ] Wizard-State überlebt Page-Reload (localStorage persist)
- [ ] Mobile: Step B Stacked-Layout, keine Overflow-Probleme
- [ ] Alle Graceful-Degradation-Fälle ohne Crash
- [ ] `localhost:3000` → Cover Letter Tab öffnet Wizard (nicht Mock)
- [ ] Bestehende Tabs (Steckbrief, CV Match, CV Opt.) unverändert
- [ ] `docs/MASTER_PLAN.md` aktualisiert (Phase 1 ✅)

---

## SUCCESS CRITERIA

✅ DEMO_MODE-Platzhalter vollständig entfernt  
✅ User durchläuft 3 interaktive Steps vor jeder Generierung  
✅ Jede Perplexity-Quelle ist als echter, klickbarer Link sichtbar  
✅ Max. 3 CV-Stationen mit explizitem Intent gemappt  
✅ Valides `CoverLetterSetupContext`-Objekt wird an Phase 2 übergeben  
✅ Auto-Fill ermöglicht Wizard-Completion in einem Klick  
✅ Alle Fehlerszenarien enden nicht im White Screen  

---

## EXECUTION ORDER

1. **Lese alle Prerequisite-Docs** (insbesondere `company-enrichment.ts`
   und `quote-matcher.ts` für den exakten Shape der Perplexity-Daten)
2. **Demolition** (Task 1.0) — zuerst, damit kein Mock-Code mehr existiert
3. **Daten-Vertrag** (Task 1.1) — `types/cover-letter-setup.ts`
4. **Zustand Store** (Task 1.2) — `stores/useCoverLetterSetupStore.ts`
5. **API Endpoint** (Task 1.3) — `/api/cover-letter/setup-data`
6. **Wizard Parent** (Task 1.4) — `CoverLetterWizard.tsx` + Steps + Cards
7. **UX Refinements** (Task 1.5) — Auto-Fill, Language Toggle, Mobile, Intent
8. **Integration** (Task 1.6) — Wizard in `step-4-cover-letter.tsx` einbinden
9. **Interoperability Test** — `tsc`, `build`, Browser-Test auf localhost:3000
10. **`docs/MASTER_PLAN.md` updaten** — Phase 1 als ✅ markieren

---

## ⚠️ PARALLELISIERUNGS-HINWEIS

**Dieser Agent läuft NICHT parallel** zu einem Agent, der gleichzeitig
`lib/services/cover-letter-generator.ts` anfasst (Phase 2).

**Grund:** Task 1.0 (Demolition) entfernt den DEMO_MODE-Guard, der den
echten API-Call bisher verhindert hat. Phase 2 verändert `buildSystemPrompt()`,
was denselben Generator betrifft. Sequenziell ausführen:

```
Phase 1 complete (buildContext() liefert valides Objekt)
    ↓
Phase 2 start (buildSystemPrompt() empfängt CoverLetterSetupContext)
```

Phase 1 kann **parallel zu** reinen UI-Änderungen an anderen Tabs laufen
(Steckbrief, CV Match, CV Opt.) — diese Files werden nicht angefasst.
