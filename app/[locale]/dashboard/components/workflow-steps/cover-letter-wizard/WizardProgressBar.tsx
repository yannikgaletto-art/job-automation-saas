'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';

interface WizardProgressBarProps {
    currentStep: 1 | 2 | 3;
    /** Highest step the user has reached — used to allow back-navigation */
    maxReachedStep?: 1 | 2 | 3;
    onNavigate?: (step: 1 | 2 | 3) => void;
}

export function WizardProgressBar({ currentStep, maxReachedStep, onNavigate }: WizardProgressBarProps) {
    const t = useTranslations('cover_letter');
    const maxStep = maxReachedStep ?? currentStep;

    const steps = useMemo(() => [
        { number: 1, title: t('step1_title'), sub: t('step1_sub') },
        { number: 2, title: t('step2_title'), sub: t('step2_sub') },
        { number: 3, title: t('step3_title'), sub: t('step3_sub') },
    ] as const, [t]);

    return (
        <div className="flex items-center gap-2 mb-6">
            {steps.map((step, idx) => {
                const isDone = step.number < currentStep;
                const isActive = step.number === currentStep;
                const isNavigable = isDone && !!onNavigate && step.number <= maxStep;

                const circleContent = isDone ? '✓' : step.number;

                const circleClasses = [
                    'w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all',
                    isDone ? 'bg-[#002e7a] text-white' :
                        isActive ? 'border-2 border-[#002e7a] bg-white text-[#002e7a]' :
                            'bg-[#E7E7E5] text-[#73726E]',
                    isNavigable ? 'cursor-pointer hover:bg-[#001e5a] hover:scale-110 shadow-sm' : '',
                ].join(' ');

                return (
                    <div key={step.number} className="flex items-center gap-2 flex-1 min-w-0 last:flex-none">
                        {/* Step Circle + Label */}
                        <div className="flex flex-col items-center gap-0.5 shrink-0">
                            {isNavigable ? (
                                <button
                                    type="button"
                                    title={t('nav_back_to_step', { step: step.number, title: step.title })}
                                    onClick={() => onNavigate?.(step.number as 1 | 2 | 3)}
                                    className={circleClasses}
                                    aria-label={t('nav_goto_step', { step: step.number })}
                                >
                                    {circleContent}
                                </button>
                            ) : (
                                <div className={circleClasses}>
                                    {circleContent}
                                </div>
                            )}
                            <span className={`text-[13px] font-semibold whitespace-nowrap ${isActive ? 'text-[#002e7a]' : 'text-[#73726E]'}`}>
                                {step.title}
                            </span>
                            <span className="text-xs text-[#A8A29E] whitespace-nowrap">{step.sub}</span>
                        </div>

                        {/* Connector */}
                        {idx < steps.length - 1 && (
                            <div className={`flex-1 h-px mt-[-18px] ${isDone ? 'bg-[#002e7a]' : 'bg-[#E7E7E5]'}`} />
                        )}
                    </div>
                );
            })}
        </div>
    );
}
