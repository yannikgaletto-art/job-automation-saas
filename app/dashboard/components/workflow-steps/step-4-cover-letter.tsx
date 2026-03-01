"use client"

import { useState, useEffect, useRef } from "react"
import { CoverLetterWizard } from "./cover-letter-wizard/CoverLetterWizard"
import type { CoverLetterSetupContext, AuditTrailCard } from "@/types/cover-letter-setup"
import { createClient } from "@/lib/supabase/client"
import { CoverLetterResultView } from "./cover-letter-result/CoverLetterResultView"
import { useCoverLetterSetupStore } from "@/store/useCoverLetterSetupStore"

interface Step4CoverLetterProps {
    jobId: string
    companyName: string
    jobTitle: string
    onComplete?: () => void
    initialData?: GenerationResult | null
}

interface GenerationResult {
    coverLetter: string
    iterations: number
    auditTrail?: AuditTrailCard[]
    iteration_log?: any[]
    validation?: {
        isValid: boolean
        stats: { wordCount: number; companyMentions: number; paragraphCount: number; forbiddenPhraseCount: number }
        errors: string[]
        warnings: string[]
    }
}

// ─── AI Generation Progress View ─────────────────────────────────────────────
const AI_STEPS = [
    { label: 'Firmendaten abrufen', detail: 'Perplexity durchsucht aktuelle Firmen-Infos', pct: 15 },
    { label: 'Profil analysieren', detail: 'Claude liest deinen Lebenslauf & die Stellenanzeige', pct: 35 },
    { label: 'Anschreiben verfassen', detail: 'Claude Sonnet schreibt den ersten Entwurf', pct: 70 },
    { label: 'Qualitätsprüfung', detail: 'AI-Judge prüft Constraints & Stil', pct: 92 },
];

function GenerationProgressView() {
    const [progress, setProgress] = useState(0);
    const [activeStep, setActiveStep] = useState(0);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        // Smooth progress fill over ~22 seconds
        const TOTAL_MS = 22000;
        const TICK_MS = 120;
        let elapsed = 0;

        intervalRef.current = setInterval(() => {
            elapsed += TICK_MS;
            // Ease-out: fast at start, slows to ~95%
            const raw = Math.min(95, (elapsed / TOTAL_MS) * 100);
            setProgress(Math.round(raw));

            // Advance step label based on thresholds
            const nextStep = AI_STEPS.reduce((last, s, i) => raw >= s.pct ? i : last, 0);
            setActiveStep(Math.max(0, nextStep));
        }, TICK_MS);

        return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }, []);

    const current = AI_STEPS[activeStep];

    return (
        <div className="flex flex-col items-center justify-center gap-3 px-6 py-4">
            {/* Skeleton shimmer */}
            <div className="w-full space-y-3">
                {[1, 0.85, 1, 0.72, 0.9, 0.6].map((w, i) => (
                    <div
                        key={i}
                        className="h-3.5 rounded-full bg-gradient-to-r from-[#E7E7E5] via-[#F0F0EE] to-[#E7E7E5] animate-pulse"
                        style={{ width: `${w * 100}%`, animationDelay: `${i * 80}ms` }}
                    />
                ))}
            </div>

            {/* Progress bar */}
            <div className="w-full">
                <div className="flex justify-between items-center mb-1.5">
                    <span className="text-xs font-semibold text-[#002e7a]">{current.label}</span>
                    <span className="text-xs text-[#A8A29E]">{progress}%</span>
                </div>
                <div className="h-2 w-full bg-[#E7E7E5] rounded-full overflow-hidden">
                    <div
                        className="h-full bg-gradient-to-r from-[#002e7a] to-[#3B82F6] rounded-full"
                        style={{ width: `${progress}%`, transition: 'width 120ms linear' }}
                    />
                </div>
                <p className="text-[11px] text-[#73726E] mt-1.5 text-center">{current.detail}</p>
            </div>

            {/* Step indicators */}
            <div className="flex items-center gap-1.5 w-full justify-center">
                {AI_STEPS.map((step, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                        <div className={[
                            'w-2 h-2 rounded-full transition-all duration-300',
                            i < activeStep ? 'bg-[#22C55E]' :
                                i === activeStep ? 'bg-[#002e7a] scale-125' :
                                    'bg-[#E7E7E5]',
                        ].join(' ')} />
                        {i < AI_STEPS.length - 1 && (
                            <div className={[
                                'h-px w-5 transition-colors duration-500',
                                i < activeStep ? 'bg-[#22C55E]' : 'bg-[#E7E7E5]',
                            ].join(' ')} />
                        )}
                    </div>
                ))}
            </div>

            <p className="text-[11px] text-[#A8A29E]">Dauert ca. 20–30 Sekunden</p>
        </div>
    );
}



export function Step4CoverLetter({
    jobId,
    companyName,
    jobTitle,
    onComplete,
    initialData
}: Step4CoverLetterProps) {
    const [result, setResult] = useState<GenerationResult | null>(initialData || null)
    const [isLoading, setIsLoading] = useState(false)
    const [isRegenerating, setIsRegenerating] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [wizardCompleted, setWizardCompleted] = useState(false)
    const [wizardContext, setWizardContext] = useState<CoverLetterSetupContext | null>(null)
    const [userId, setUserId] = useState<string | null>(null)

    // Read from Zustand store — persisted across mounts (store > local state > null)
    const buildContextFromStore = useCoverLetterSetupStore(state => state.buildContext)

    const generateCoverLetter = async (context?: CoverLetterSetupContext) => {
        try {
            if (!result) setIsLoading(true)
            setError(null)

            // Use current user session from Supabase
            const supabase = createClient()
            const { data: { user } } = await supabase.auth.getUser()
            const currentUserId = user?.id

            if (!currentUserId) {
                throw new Error('Nicht angemeldet. Bitte einloggen.')
            }
            setUserId(currentUserId)

            // Fallback: store.buildContext() → local wizardContext → null
            const resolvedContext: CoverLetterSetupContext | null =
                context ?? buildContextFromStore() ?? wizardContext

            const response = await fetch('/api/cover-letter/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jobId,
                    userId: currentUserId,
                    setupContext: resolvedContext,
                })
            })

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}))
                throw new Error(errorData.error || 'Generierung fehlgeschlagen')
            }

            const data = await response.json()

            const rawValidation = data.validation || {};
            const coverLetterText: string = data.cover_letter || data.coverLetter || '';
            const wordCount = coverLetterText.trim().split(/\s+/).filter(Boolean).length;
            const paragraphCount = coverLetterText.split(/\n\n+/).filter((p: string) => p.trim()).length;
            const companyNamesToMatch = companyName ? [companyName] : [];
            const companyMentions = companyNamesToMatch.length > 0
                ? (coverLetterText.match(new RegExp(companyName, 'gi')) || []).length
                : 0;

            const mappedResult: GenerationResult = {
                coverLetter: coverLetterText,
                iterations: data.iterations || 1,
                auditTrail: data.audit_trail || [],
                iteration_log: data.iteration_log,
                validation: {
                    isValid: rawValidation.isValid ?? true,
                    stats: rawValidation.stats ?? {
                        wordCount,
                        paragraphCount,
                        companyMentions,
                        forbiddenPhraseCount: 0,
                    },
                    errors: rawValidation.errors ?? rawValidation.issues ?? [],
                    warnings: rawValidation.warnings ?? [],
                }
            }

            setResult(mappedResult)
            console.log('✅ Cover letter generated successfully')

            if (onComplete) {
                onComplete()
            }

        } catch (err) {
            console.error('❌ Cover letter generation failed:', err)
            setError(err instanceof Error ? err.message : 'Unbekannter Fehler')
        } finally {
            setIsLoading(false)
            setIsRegenerating(false)
        }
    }

    const handleRegenerate = async () => {
        setIsRegenerating(true)
        await generateCoverLetter()
    }

    const handleWizardComplete = (context: CoverLetterSetupContext) => {
        setWizardContext(context)
        setWizardCompleted(true)
        generateCoverLetter(context)
    }

    // Show wizard if not yet completed and no existing result
    if (!wizardCompleted && !result) {
        return (
            <CoverLetterWizard
                jobId={jobId}
                companyName={companyName}
                onComplete={handleWizardComplete}
            />
        )
    }

    // AI Progress loading view
    if (isLoading && !result) {
        return <GenerationProgressView />;
    }

    // Error state
    if (error) {
        return (
            <div className="p-6 bg-red-50 rounded-lg border border-red-200 m-6">
                <h3 className="text-sm font-semibold text-red-800 mb-2">Generierung fehlgeschlagen</h3>
                <p className="text-xs text-red-600 mb-4">{error}</p>
                <button
                    onClick={() => generateCoverLetter()}
                    className="text-xs bg-white border border-red-200 text-red-600 px-3 py-1.5 rounded-md hover:bg-red-50 transition-colors"
                >
                    Erneut versuchen
                </button>
            </div>
        )
    }

    // Success state
    if (result && userId) {
        return (
            <div className="space-y-6 p-6 bg-[#FAFAF9]">
                <CoverLetterResultView
                    initialResult={result}
                    userId={userId}
                    jobId={jobId}
                    setupContext={buildContextFromStore() ?? wizardContext}
                />
            </div>
        )
    }

    return null
}