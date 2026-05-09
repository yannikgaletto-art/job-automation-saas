"use client";

import { Check } from 'lucide-react';

export type InitiativStep = 'strengths' | 'discovery' | 'insight';

type StepperStepConfig = {
    key: InitiativStep;
    label: string;
    enabled: boolean;
};

type InitiativStepperProps = {
    activeStep: InitiativStep;
    steps: StepperStepConfig[];
    progressLabel: string;
    onStepClick?: (step: InitiativStep) => void;
};

const STEP_ORDER: InitiativStep[] = ['strengths', 'discovery', 'insight'];

function indexOf(step: InitiativStep): number {
    return STEP_ORDER.indexOf(step);
}

export function InitiativStepper({ activeStep, steps, progressLabel, onStepClick }: InitiativStepperProps) {
    const activeIndex = indexOf(activeStep);

    return (
        <nav aria-label={progressLabel} className="rounded-lg border border-[#E7E7E5] bg-white px-4 py-3 shadow-sm">
            <div className="flex items-center justify-between gap-3">
                <ol className="flex flex-1 items-center gap-2 sm:gap-3">
                    {steps.map((step, index) => {
                        const stepIndex = indexOf(step.key);
                        const isActive = step.key === activeStep;
                        const isComplete = stepIndex < activeIndex;
                        const clickable = step.enabled && Boolean(onStepClick) && !isActive;

                        const circleClasses = isActive
                            ? 'bg-[#012e7a] text-white'
                            : isComplete
                                ? 'bg-[#012e7a] text-white'
                                : step.enabled
                                    ? 'bg-[#F4F7FC] text-[#012e7a]'
                                    : 'bg-[#F1F1EF] text-[#A8A29E]';

                        const labelClasses = isActive
                            ? 'text-[#37352F]'
                            : step.enabled
                                ? 'text-[#73726E]'
                                : 'text-[#A8A29E]';

                        return (
                            <li key={step.key} className="flex flex-1 items-center gap-2 sm:gap-3">
                                <button
                                    type="button"
                                    disabled={!clickable}
                                    onClick={clickable ? () => onStepClick?.(step.key) : undefined}
                                    aria-current={isActive ? 'step' : undefined}
                                    className={`flex items-center gap-2 rounded-full px-2 py-1 text-left transition-colors ${
                                        clickable ? 'hover:bg-[#F4F7FC]' : ''
                                    } ${clickable ? '' : 'cursor-default'}`}
                                >
                                    <span
                                        className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors ${circleClasses}`}
                                    >
                                        {isComplete ? <Check className="h-3.5 w-3.5" /> : index + 1}
                                    </span>
                                    <span className={`text-sm font-semibold ${labelClasses}`}>
                                        {step.label}
                                    </span>
                                </button>
                                {index < steps.length - 1 && (
                                    <span
                                        aria-hidden="true"
                                        className={`hidden h-px flex-1 sm:block ${
                                            stepIndex < activeIndex ? 'bg-[#012e7a]' : 'bg-[#E7E7E5]'
                                        }`}
                                    />
                                )}
                            </li>
                        );
                    })}
                </ol>
                <span className="hidden shrink-0 text-xs font-semibold text-[#73726E] sm:block">
                    {progressLabel}
                </span>
            </div>
        </nav>
    );
}
