// Cover Letter Phase 1 – Daten-Vertrag für den Setup-Wizard
// Dieser Typ-Vertrag verbindet UI-Wizard mit buildSystemPrompt() in Phase 2.

import type { HiringPersona } from '@/lib/services/hiring-manager-resolver';

export type HookType = 'news' | 'value' | 'quote' | 'linkedin' | 'manual' | 'vision' | 'project' | 'funding';
export type TonePreset = 'storytelling' | 'formal';
export type TargetLanguage = 'de' | 'en' | 'es';

// ─── Step A Output ────────────────────────────────────────────────
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

// ─── Step B Output ────────────────────────────────────────────────
export interface SelectedCVStation {
    stationIndex: 1 | 2 | 3;        // Reihenfolge der User-Auswahl
    company: string;                  // z.B. "Fraunhofer FOKUS"
    role: string;                     // z.B. "Innovation Consultant"
    period: string;                   // z.B. "11.2023 - Heute"
    keyBullet: string;                // Wichtigster Bullet-Point dieser Station

    // CRITICAL für Phase 2 Prompt-Qualität:
    matchedRequirement: string;       // z.B. "5-7 Jahre Partnerships"
    intent: string;                   // z.B. "Beweis für strategische Kooperationen"
    bullets?: string[];               // Alle Bullet-Points der gewählten Station für Kontext

    // Strategy 1: User-provided relevance context (optional, zero-friction)
    // When filled, this becomes the HIGHEST-PRIORITY signal in the prompt.
    // Pre-filled with auto-suggestions from CV bullets; user can edit or ignore.
    userContext?: string;
}

// ─── Step C Output ────────────────────────────────────────────────
export interface ToneConfig {
    preset: TonePreset;
    toneSource: 'preset' | 'custom-style';  // Woher der Ton kommt: Preset oder eigenes Anschreiben
    selectedStyleDocId?: string;             // Welches Anschreiben für Custom-Style (Document ID)
    targetLanguage: TargetLanguage;      // Sprache des Anschreibens
    hasStyleSample: boolean;             // Wurde altes Anschreiben hochgeladen?
    styleWarningAcknowledged: boolean;   // User hat Anti-GPT-Callout gelesen
    contactPerson?: string;              // Optionaler Ansprechpartner für die Anrede
    formality: 'sie' | 'du';            // Sie-Form (klassisch) oder Du-Form (Startups/Tech)
}

// ─── Quote Selection (Phase B, optional) ──────────────────────────
export interface SelectedQuote {
    quote: string;
    author: string;
    source: string;         // Book, speech, etc.
    matchedValue: string;   // Company value this quote supports
    relevanceScore: number; // 0-1
}

// ─── B2.2: Opt-In Modules ─────────────────────────────────────────
export interface OptInModules {
    first90DaysHypothesis: boolean;  // Default: false — KI plant ersten Monat
    painPointMatching: boolean;      // Default: true  — Implizite Firmenschmerzen
    vulnerabilityInjector: boolean;  // Default: false — Strategische Schwäche (max 2x)
    pingPong: boolean;               // Default: false — Sets enablePingPong
    stationsSelector: boolean;       // Default: true  — Koppelt an B2.3
}

export const DEFAULT_OPT_IN_MODULES: OptInModules = {
    first90DaysHypothesis: false,
    painPointMatching: true,
    vulnerabilityInjector: false,
    pingPong: false,
    stationsSelector: true,
};



// ─── Hiring Manager Critique ──────────────────────────────────────
export interface HiringManagerCritique {
    persona: string;
    role: string;
    critique: string;
    fixSuggestion: string;
}

// ─── Gesamt-Vertrag (wird an buildSystemPrompt() übergeben) ───────
export interface CoverLetterSetupContext {
    jobId: string;
    companyName: string;
    selectedHook: SelectedHook;
    selectedQuote?: SelectedQuote;     // Optional quote from Phase B
    cvStations: SelectedCVStation[];   // Min 1, Max 3
    tone: ToneConfig;
    completedAt: string;               // ISO Timestamp
    enablePingPong?: boolean;          // B1.3: Set via optInModules.pingPong
    selectedNews?: { title: string; date: string; source?: string }; // B2.5: News-Binding
    optInModules?: OptInModules;       // B2.2: Opt-In Feature-Module
    selectedPersona?: HiringPersona;   // B3.2: Ausgewählte Hiring-Persona
    introFocus?: 'quote' | 'hook';     // Cross-Integration: Wer bekommt die Pole Position?
}

// ─── API Response Shape ───────────────────────────────────────────
export interface SetupDataResponse {
    // Step A
    hooks: SelectedHook[];
    hasPerplexityData: boolean;
    companyWebsite?: string | null; // Enrichment-Kontext für Zero-Fake-Data Gate
    jobTitle?: string | null;       // Für rollenspezifische Zitat-Suche (Contract 11)

    // Step B
    cvStations: Array<{
        company: string;
        role: string;
        period: string;
        bullets: string[];
        hint?: string;               // Server-generated hint based on CV Match analysis
        cvOptimizerContext?: string; // Auto-filled from CV Optimizer appliedChanges for this company/role
    }>;
    jobRequirements: string[];      // Top 3 aus job_queue.requirements

    // Step C
    hasStyleSample: boolean;
    styleAnalysisSummary: string;   // z.B. "Formal, Ø 20 Wörter/Satz"
    detectedJobLanguage: TargetLanguage;
    availableStyleDocs: Array<{
        id: string;
        fileName: string;
        createdAt: string;
        hasStyleAnalysis: boolean;
    }>;

    // Returning user detection: true if user has previously generated a cover letter.
    // Used to hide first-time onboarding tips (e.g. quote example box).
    // Inferred from documents count — no new DB state needed.
    isReturningUser: boolean;
}
