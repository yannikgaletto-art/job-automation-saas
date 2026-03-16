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
    judgePassed?: boolean
    judgeFailReasons?: string[]
    warnings?: string[]
    draftId?: string
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
    { label: 'Anschreiben fertigstellen', detail: 'Qualitätsprüfung & Anti-Fluff-Scan', pct: 92 },
];

function GenerationProgressView() {
    const [progress, setProgress] = useState(0);
    const [activeStep, setActiveStep] = useState(0);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        // Smooth progress fill over ~16 seconds (adjusted for faster sync path)
        const TOTAL_MS = 16000;
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

    // ─── Persisted context: Never lose wizard settings across re-generations ────
    // WHY: The Zustand store can lose state when switching jobs or on page reload.
    // We store the last successfully used context in a ref AND load from DB draft.
    const buildContextFromStore = useCoverLetterSetupStore(state => state.buildContext)
    const lastUsedContextRef = useRef<CoverLetterSetupContext | null>(null)

    // On mount: try to load the last saved draft's setupContext from DB
    useEffect(() => {
        async function loadPersistedContext() {
            const supabase = createClient()
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            const { data: lastDraft } = await supabase
                .from('documents')
                .select('metadata')
                .eq('user_id', user.id)
                .eq('document_type', 'cover_letter')
                .eq('metadata->>job_id', jobId)
                .order('created_at', { ascending: false })
                .limit(1)
                .single()

            if (lastDraft?.metadata?.setup_context) {
                lastUsedContextRef.current = lastDraft.metadata.setup_context
                console.log('✅ [CoverLetter] Loaded persisted setupContext from last draft')
            }
        }
        loadPersistedContext()
    }, [jobId])

    // ─── Poll for Audit Trail (async Inngest result) ──────────────────────────
    // WHY: Inngest polish job runs ~15-20s after generation and writes audit_trail
    // to documents.metadata. We poll every 4s for up to 35s (8 attempts).
    async function pollForAuditTrail(
        draftId: string,
        updateResult: React.Dispatch<React.SetStateAction<GenerationResult | null>>
    ) {
        const supabase = createClient()
        const MAX_ATTEMPTS = 8
        const INTERVAL_MS = 4000

        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            await new Promise(resolve => setTimeout(resolve, INTERVAL_MS))
            const { data: doc } = await supabase
                .from('documents')
                .select('metadata')
                .eq('id', draftId)
                .single()

            const trail: AuditTrailCard[] | undefined = doc?.metadata?.audit_trail
            if (trail && trail.length > 0) {
                console.log(`✅ [AuditTrail] Found ${trail.length} cards after ${(attempt + 1) * 4}s`)
                updateResult(prev => prev ? { ...prev, auditTrail: trail } : prev)
                return
            }
        }
        console.log('⚠️ [AuditTrail] Polling ended without data')
    }

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

            // Context resolution chain: explicit > ref > store > local state > null
            const resolvedContext: CoverLetterSetupContext | null =
                context ?? lastUsedContextRef.current ?? buildContextFromStore() ?? wizardContext

            // Persist the context we're about to use (so re-generation reuses it)
            if (resolvedContext) {
                lastUsedContextRef.current = resolvedContext
            }

            if (!resolvedContext) {
                console.warn('⚠️ [CoverLetter] No setupContext available — generation quality will be reduced')
            }

            // 60s client-side timeout (Batch 2.3 — Stale-Recovery)
            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), 180_000) // 3 min — Cover Letter AI generation is slow

            const response = await fetch('/api/cover-letter/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jobId,
                    userId: currentUserId,
                    setupContext: resolvedContext,
                }),
                signal: controller.signal,
            })
            clearTimeout(timeoutId)

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
                auditTrail: [],
                draftId: data.draft_id ?? undefined,
                iteration_log: data.iteration_log,
                judgePassed: data.judge_passed ?? true,
                judgeFailReasons: data.judge_fail_reasons || [],
                warnings: data.warnings || [],
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

            if (data.draft_id) {
                pollForAuditTrail(data.draft_id, setResult)
            }

            if (onComplete) {
                onComplete()
            }

        } catch (err) {
            console.error('❌ Cover letter generation failed:', err)
            if (err instanceof DOMException && err.name === 'AbortError') {
                setError('Zeitüberschreitung — bitte erneut versuchen.')
            } else {
                setError(err instanceof Error ? err.message : 'Unbekannter Fehler')
            }
        } finally {
            setIsLoading(false)
            setIsRegenerating(false)
        }
    }

    const handleRegenerate = async () => {
        setIsRegenerating(true)
        // Always pass the last used context — prevents context loss on re-generation
        await generateCoverLetter(lastUsedContextRef.current ?? buildContextFromStore() ?? wizardContext ?? undefined)
    }

    const handleWizardComplete = (context: CoverLetterSetupContext) => {
        setWizardContext(context)
        lastUsedContextRef.current = context  // Persist for future re-generations
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
            <div className="space-y-4 p-6 bg-[#FAFAF9]">
                {/* 1D: Judge Warning Banner — covers both generation and targeted fix */}
                {result.judgePassed === false && (
                    <details className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                        <summary className="text-xs font-medium text-amber-700 cursor-pointer">
                            ⚠️ Qualitätsprüfung nicht bestanden — bitte manuell überprüfen
                        </summary>
                        {(result.judgeFailReasons?.length ?? 0) > 0 && (
                            <ul className="mt-2 space-y-1">
                                {result.judgeFailReasons!.map((reason, i) => (
                                    <li key={i} className="text-xs text-amber-600">• {reason}</li>
                                ))}
                            </ul>
                        )}
                    </details>
                )}

                {/* API Warnings Banner */}
                {(result.warnings?.length ?? 0) > 0 && (
                    <div className="flex items-start gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
                        <span className="text-xs">ℹ️</span>
                        <div className="space-y-1">
                            {result.warnings!.map((w, i) => (
                                <p key={i} className="text-xs text-blue-700">{w}</p>
                            ))}
                        </div>
                    </div>
                )}

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