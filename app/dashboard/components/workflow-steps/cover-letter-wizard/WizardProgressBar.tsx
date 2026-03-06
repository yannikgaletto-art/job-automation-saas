'use client';

interface WizardProgressBarProps {
    currentStep: 1 | 2 | 3;
    /** Highest step the user has reached — used to allow back-navigation */
    maxReachedStep?: 1 | 2 | 3;
    onNavigate?: (step: 1 | 2 | 3) => void;
}

const steps = [
    { number: 1, title: 'Aufhänger', sub: 'Einstieg wählen' },
    { number: 2, title: 'Erfahrung', sub: 'CV Stationen' },
    { number: 3, title: 'Ton', sub: 'Schreibstil' },
] as const;

export function WizardProgressBar({ currentStep, maxReachedStep, onNavigate }: WizardProgressBarProps) {
    const maxStep = maxReachedStep ?? currentStep;

    return (
        <div className="flex items-center gap-2 mb-6">
            {steps.map((step, idx) => {
                const isDone = step.number < currentStep;
                const isActive = step.number === currentStep;
                // A step is navigable if already visited (done) and we have an onNavigate handler
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
                                    title={`Zurück zu Schritt ${step.number}: ${step.title}`}
                                    onClick={() => onNavigate?.(step.number as 1 | 2 | 3)}
                                    className={circleClasses}
                                    aria-label={`Zu Schritt ${step.number} navigieren`}
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

