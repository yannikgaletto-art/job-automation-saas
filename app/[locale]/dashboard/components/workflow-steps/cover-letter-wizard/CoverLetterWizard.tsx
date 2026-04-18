'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useCoverLetterSetupStore } from '@/store/useCoverLetterSetupStore';
import { WizardProgressBar } from './WizardProgressBar';
import { StepHookSelection } from './steps/StepHookSelection';
import { StepStationMapping } from './steps/StepStationMapping';
import { StepToneConfig } from './steps/StepToneConfig';
import type { CoverLetterSetupContext, SetupDataResponse } from '@/types/cover-letter-setup';



interface Props {
    jobId: string;
    companyName: string;
    onComplete: (context: CoverLetterSetupContext) => void;
}

export function CoverLetterWizard({ jobId, companyName, onComplete }: Props) {
    const t = useTranslations('cover_letter');
    const { currentStep, setStep, initForJob, buildContext } =
        useCoverLetterSetupStore();

    const [setupData, setSetupData] = useState<SetupDataResponse | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    // Track the highest step reached so completed circles become clickable
    const [maxReachedStep, setMaxReachedStep] = useState<1 | 2 | 3>(1);

    // ─── Sync maxReachedStep from currentStep (single source of truth) ───
    // WHY: Previously onNext() called both setStep() AND setMaxReachedStep()
    //      in the same tick, causing race conditions during AnimatePresence transitions.
    //      Now steps only call onNext() and the parent derives maxReachedStep.
    useEffect(() => {
        setMaxReachedStep(prev => Math.max(prev, currentStep) as 1 | 2 | 3);
    }, [currentStep]);

    useEffect(() => {
        initForJob(jobId);
        // Always reset to step 1 on mount — prevents "stuck on Step 2 with disabled button"
        // WHY: initForJob() only resets the store when jobId CHANGES. If the same job is
        // reopened, currentStep stays persisted (e.g. 2) but cvStations may be empty,
        // resulting in the Weiter button being disabled with no way to proceed.
        // Resetting to step 1 on every mount is safe: the hook selection and tone config
        // are preserved in the store, so the user can skip through quickly.
        setStep(1);
        fetchSetupData();
    }, [jobId]); // eslint-disable-line react-hooks/exhaustive-deps

    const fetchSetupData = async () => {
        try {
            const res = await fetch(`/api/cover-letter/setup-data?jobId=${jobId}`);
            if (!res.ok) throw new Error(t('error_load_data'));
            const data: SetupDataResponse = await res.json();

            // ─── Stale Hook Invalidation ────────────────────────────
            // WHY: Zustand persists selectedHook in localStorage per jobId.
            // When the 7-day company_research cache expires, setup-data returns
            // only a manual hook. The old persisted hook (e.g. 'vision') no longer
            // exists in the server response → UI shows empty "results" dead-end.
            // Fix: Clear the hook BEFORE setSetupData so StepHookSelection mounts
            // with the correct initial phase ('idle' instead of stale 'results').
            const { selectedHook } = useCoverLetterSetupStore.getState();
            if (selectedHook && !data.hooks.some(h => h.id === selectedHook.id)) {
                console.warn(`⚠️ [WizardSetup] Stale hook "${selectedHook.id}" not in server hooks — clearing`);
                useCoverLetterSetupStore.setState({
                    selectedHook: null,
                    selectedQuote: null,
                    fetchedQuotes: [],
                });
            }

            setSetupData(data);
            console.log(`✅ [WizardSetup] Setup data loaded for job ${jobId}`);
        } catch (err) {
            console.error('❌ [WizardSetup] Setup data fetch failed:', err);
            setLoadError(err instanceof Error ? err.message : t('error_unknown'));
        }
    };

    // Navigate to a step — only backward allowed (forward is handled by step buttons)
    const handleNavigateToStep = (step: 1 | 2 | 3) => {
        if (step < currentStep) {
            setStep(step);
        }
    };

    const [contextError, setContextError] = useState<string | null>(null);

    const handleFinish = () => {
        setContextError(null);
        const context = buildContext();
        if (!context) {
            console.warn('⚠️ [WizardSetup] buildContext() returned null — navigating to incomplete step');
            const { isStepComplete } = useCoverLetterSetupStore.getState();
            if (!isStepComplete(1)) { setStep(1); setContextError(t('error_step1')); }
            else if (!isStepComplete(2)) { setStep(2); setContextError(t('error_step2')); }
            else if (!isStepComplete(3)) { setStep(3); setContextError(t('error_step3')); }
            else { setContextError(t('error_check_all')); }
            return;
        }
        onComplete(context);
    };

    // Loading state
    if (!setupData && !loadError) {
        return (
            <div className="px-5 py-8 space-y-3">
                <div className="animate-pulse space-y-3">
                    <div className="h-3 bg-[#E7E7E5] rounded w-2/3" />
                    <div className="h-20 bg-[#E7E7E5] rounded" />
                    <div className="h-20 bg-[#E7E7E5] rounded" />
                </div>
                <p className="text-xs text-[#73726E] text-center">{t('loading_wizard')}</p>
            </div>
        );
    }

    // Error state
    if (loadError || !setupData) {
        return (
            <div className="px-5 py-8 text-center space-y-3">
                <p className="text-xs text-red-600">⚠️ {loadError || t('error_data_load')}</p>
                <button
                    onClick={fetchSetupData}
                    className="text-xs text-[#002e7a] hover:underline"
                >
                    {t('btn_retry')}
                </button>
            </div>
        );
    }

    return (
        <div className="px-5 py-4 bg-[#FAFAF9] space-y-4 min-h-[360px]">
            {/* Header */}
            <div className="flex items-start justify-between">
                <WizardProgressBar
                    currentStep={currentStep as 1 | 2 | 3}
                    maxReachedStep={maxReachedStep}
                    onNavigate={handleNavigateToStep}
                />
            </div>

            {/* Context Error Banner */}
            {contextError && (
                <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                    <span>⚠️</span>
                    <span>{contextError}</span>
                </div>
            )}

            {/* Steps — direct conditional rendering, NO AnimatePresence.
                WHY: AnimatePresence mode="popLayout" caused exit-animated elements to
                     remain in the DOM as position:absolute ghost elements that intercepted
                     all click events on the new step's buttons. This was the root cause of
                     the persistent "Weiter/Zurück buttons don't work" bug. */}
            {currentStep === 1 && (
                <StepHookSelection
                    jobId={jobId}
                    companyName={companyName}
                    setupData={setupData}
                    onNext={() => setStep(2)}
                    onReloadData={fetchSetupData}
                />
            )}

            {currentStep === 2 && (
                <StepStationMapping
                    setupData={setupData}
                    onBack={() => setStep(1)}
                    onNext={() => setStep(3)}
                />
            )}

            {currentStep === 3 && (
                <StepToneConfig
                    setupData={setupData}
                    onBack={() => setStep(2)}
                    onGenerate={handleFinish}
                />
            )}
        </div>
    );
}
