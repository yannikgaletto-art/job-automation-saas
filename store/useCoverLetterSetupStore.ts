import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
    CoverLetterSetupContext,
    SelectedHook,
    SelectedCVStation,
    SelectedQuote,
    ToneConfig,
} from '@/types/cover-letter-setup';

interface SetupStore {
    currentStep: 1 | 2 | 3;
    jobId: string | null;
    selectedHook: SelectedHook | null;
    selectedQuote: SelectedQuote | null;
    fetchedQuotes: SelectedQuote[];
    cvStations: SelectedCVStation[];
    tone: ToneConfig | null;

    // Actions
    setStep: (step: 1 | 2 | 3) => void;
    initForJob: (jobId: string) => void;
    setHook: (hook: SelectedHook) => void;
    setQuote: (quote: SelectedQuote | null) => void;
    setFetchedQuotes: (quotes: SelectedQuote[]) => void;
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
            selectedQuote: null,
            fetchedQuotes: [],
            cvStations: [],
            tone: null,

            setStep: (step) => set({ currentStep: step }),

            initForJob: (jobId) => {
                const current = get().jobId;
                // Reset only if switching to a different job
                if (current !== jobId) {
                    set({ jobId, currentStep: 1, selectedHook: null, selectedQuote: null, fetchedQuotes: [], cvStations: [], tone: null });
                    console.log(`✅ [WizardSetup] Initialized for job: ${jobId}`);
                }
            },

            setHook: (hook) => {
                set({ selectedHook: hook });
                console.log(`✅ [WizardSetup] Hook selected: ${hook.label}`);
            },

            setQuote: (quote) => {
                set({ selectedQuote: quote });
                console.log(`✅ [WizardSetup] Quote ${quote ? 'selected: ' + quote.author : 'cleared'}`);
            },

            setFetchedQuotes: (quotes) => {
                set({ fetchedQuotes: quotes });
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
                selectedQuote: null,
                fetchedQuotes: [],
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
                    companyName: '', // Generator uses jobData.company_name
                    selectedHook: s.selectedHook,
                    selectedQuote: s.selectedQuote ?? undefined,
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
