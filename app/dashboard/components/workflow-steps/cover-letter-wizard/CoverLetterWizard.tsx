'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
    const { currentStep, setStep, initForJob, buildContext } =
        useCoverLetterSetupStore();

    const [setupData, setSetupData] = useState<SetupDataResponse | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    // Track the highest step reached so completed circles become clickable
    const [maxReachedStep, setMaxReachedStep] = useState<1 | 2 | 3>(1);

    useEffect(() => {
        initForJob(jobId);
        fetchSetupData();
    }, [jobId]);

    const fetchSetupData = async () => {
        try {
            const res = await fetch(`/api/cover-letter/setup-data?jobId=${jobId}`);
            if (!res.ok) throw new Error('Fehler beim Laden der Daten');
            const data: SetupDataResponse = await res.json();
            setSetupData(data);
            console.log(`✅ [WizardSetup] Setup data loaded for job ${jobId}`);
        } catch (err) {
            console.error('❌ [WizardSetup] Setup data fetch failed:', err);
            setLoadError(err instanceof Error ? err.message : 'Unbekannter Fehler');
        }
    };



    // Navigate to a step — only backward allowed (forward is handled by step buttons)
    const handleNavigateToStep = (step: 1 | 2 | 3) => {
        if (step < currentStep) {
            setStep(step);
        }
    };

    const handleFinish = () => {
        const context = buildContext();
        if (!context) {
            console.warn('⚠️ [WizardSetup] buildContext() returned null');
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
                <p className="text-xs text-[#73726E] text-center">Lade Wizard-Daten...</p>
            </div>
        );
    }

    // Error state
    if (loadError || !setupData) {
        return (
            <div className="px-5 py-8 text-center space-y-3">
                <p className="text-xs text-red-600">⚠️ {loadError || 'Daten konnten nicht geladen werden.'}</p>
                <button
                    onClick={fetchSetupData}
                    className="text-xs text-[#002e7a] hover:underline"
                >
                    Erneut versuchen
                </button>
            </div>
        );
    }

    const slideVariants = {
        initial: { opacity: 0, x: 20 },
        animate: { opacity: 1, x: 0 },
        exit: { opacity: 0, x: -20 },
    };

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

            {/* Steps */}
            <AnimatePresence mode="wait">
                {currentStep === 1 && (
                    <motion.div key="step-1" variants={slideVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.2 }}>
                        <StepHookSelection
                            jobId={jobId}
                            companyName={companyName}
                            setupData={setupData}
                            onNext={() => { setStep(2); setMaxReachedStep(prev => Math.max(prev, 2) as 1 | 2 | 3); }}
                            onReloadData={fetchSetupData}
                        />
                    </motion.div>
                )}

                {currentStep === 2 && (
                    <motion.div key="step-2" variants={slideVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.2 }}>
                        <StepStationMapping
                            setupData={setupData}
                            onBack={() => setStep(1)}
                            onNext={() => { setStep(3); setMaxReachedStep(prev => Math.max(prev, 3) as 1 | 2 | 3); }}
                        />
                    </motion.div>
                )}

                {currentStep === 3 && (
                    <motion.div key="step-3" variants={slideVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.2 }}>
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
