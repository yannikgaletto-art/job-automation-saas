'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useCoverLetterSetupStore } from '@/store/useCoverLetterSetupStore';
import { WizardProgressBar } from './WizardProgressBar';
import { StepHookSelection } from './steps/StepHookSelection';
import { StepStationMapping } from './steps/StepStationMapping';
import { StepToneConfig } from './steps/StepToneConfig';
import type { CoverLetterSetupContext, SetupDataResponse } from '@/types/cover-letter-setup';

// ─── Module-level constant: prevents framer-motion from losing track
//     of variant identity across re-renders (was causing Step 2 blank bug) ───
const SLIDE_VARIANTS = {
    initial: { opacity: 0, x: 20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 },
} as const;

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
        fetchSetupData();
    }, [jobId]);

    const fetchSetupData = async () => {
        try {
            const res = await fetch(`/api/cover-letter/setup-data?jobId=${jobId}`);
            if (!res.ok) throw new Error(t('error_load_data'));
            const data: SetupDataResponse = await res.json();
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

            {/* Steps — mode="popLayout" prevents exit animations from blocking entry.
                WHY: "wait" mode caused Step 2 to get stuck at opacity:0 when
                     Zustand state updates (setStep) fired during the exit→enter gap.
                     "popLayout" exits outgoing content with layout animation while
                     immediately mounting incoming content. */}
            <AnimatePresence mode="popLayout">
                {currentStep === 1 && (
                    <motion.div key="step-1" variants={SLIDE_VARIANTS} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.15 }}>
                        <StepHookSelection
                            jobId={jobId}
                            companyName={companyName}
                            setupData={setupData}
                            onNext={() => setStep(2)}
                            onReloadData={fetchSetupData}
                        />
                    </motion.div>
                )}

                {currentStep === 2 && (
                    <motion.div key="step-2" variants={SLIDE_VARIANTS} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.15 }}>
                        <StepStationMapping
                            setupData={setupData}
                            onBack={() => setStep(1)}
                            onNext={() => setStep(3)}
                        />
                    </motion.div>
                )}

                {currentStep === 3 && (
                    <motion.div key="step-3" variants={SLIDE_VARIANTS} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.15 }}>
                        <StepToneConfig
                            setupData={setupData}
                            onBack={() => setStep(2)}
                            onGenerate={handleFinish}
                        />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
