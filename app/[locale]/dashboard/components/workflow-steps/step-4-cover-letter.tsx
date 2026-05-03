"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import { motion } from "framer-motion"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { CoverLetterWizard } from "./cover-letter-wizard/CoverLetterWizard"
import type { CoverLetterSetupContext } from "@/types/cover-letter-setup"
import { createClient } from "@/lib/supabase/client"
import { CoverLetterResultView } from "./cover-letter-result/CoverLetterResultView"
import { useCoverLetterSetupStore } from "@/store/useCoverLetterSetupStore"
import { useTranslations } from 'next-intl'
import { useCreditExhausted } from '@/app/[locale]/dashboard/hooks/credit-exhausted-context'

interface Step4CoverLetterProps {
    jobId: string
    companyName: string
    jobTitle: string
    companyWebsite?: string | null
    onComplete?: () => void
    onJobApplied?: () => void
    initialData?: GenerationResult | null
}

interface GenerationResult {
    coverLetter: string
    iterations: number
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

// Cancel button — appears after 15s
function CLCancelButton({ onCancel, label }: { onCancel: () => void; label: string }) {
    const [visible, setVisible] = useState(false);
    useEffect(() => {
        const t = setTimeout(() => setVisible(true), 15000);
        return () => clearTimeout(t);
    }, []);
    if (!visible) return null;
    return (
        <motion.button
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            onClick={onCancel}
            className="text-xs text-gray-400 hover:text-red-500 transition-colors mt-1"
        >
            {label}
        </motion.button>
    );
}

function GenerationProgressView({ onCancel, steps, title, duration, cancelLabel }: {
    onCancel?: () => void;
    steps: string[];
    title: string;
    duration: string;
    cancelLabel: string;
}) {
    const [activeStep, setActiveStep] = useState(0);

    useEffect(() => {
        setActiveStep(0);
        let idx = 0;
        const interval = setInterval(() => {
            idx = Math.min(idx + 1, steps.length - 1);
            setActiveStep(idx);
            if (idx >= steps.length - 1) clearInterval(interval);
        }, 4000);
        return () => clearInterval(interval);
    }, [steps.length]);

    return (
        <div className="w-full px-6 py-8 bg-[#FAFAF9] rounded-xl border border-slate-200">
            {/* Spinner + title — left-aligned */}
            <div className="flex items-center gap-2.5 mb-1">
                <LoadingSpinner className="w-5 h-5 text-[#002e7a] shrink-0" />
                <span className="text-sm font-semibold text-[#37352F]">
                    {title}
                </span>
            </div>
            <p className="text-xs text-[#73726E] mb-5 pl-[29px]">{duration}</p>

            {/* Step list */}
            <div className="space-y-2">
                {steps.map((label, i) => {
                    const isDone = i < activeStep;
                    const isActive = i === activeStep;
                    return (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, x: -6 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.07, duration: 0.25 }}
                            className={cn(
                                'flex items-center gap-3 px-4 py-2.5 rounded-lg border transition-all duration-300',
                                isDone
                                    ? 'bg-[#EEF2FF] border-[#C7D6F7]'
                                    : isActive
                                        ? 'bg-white border-[#002e7a] shadow-sm'
                                        : 'bg-white border-[#E7E7E5]'
                            )}
                        >
                            {/* Badge */}
                            <div className={cn(
                                'w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 transition-all duration-300',
                                isDone
                                    ? 'bg-[#002e7a] text-white'
                                    : isActive
                                        ? 'border-2 border-[#002e7a] bg-white text-[#002e7a]'
                                        : 'border border-[#D0CFC8] bg-white text-[#A8A29E]'
                            )}>
                                {isDone ? <Check size={12} /> : <span>{i + 1}</span>}
                            </div>

                            {/* Label */}
                            <span className={cn(
                                'text-xs flex-1 transition-all duration-300',
                                isDone
                                    ? 'line-through text-[#002e7a] opacity-60'
                                    : isActive
                                        ? 'font-semibold text-[#37352F]'
                                        : 'font-normal text-[#A8A29E]'
                            )}>
                                {label}
                            </span>

                            {/* Grey dot for active step */}
                            {isActive && (
                                <div className="w-3.5 h-3.5 rounded-full bg-[#9CA3AF] shrink-0" />
                            )}
                        </motion.div>
                    );
                })}
            </div>

            <div className="mt-5 pl-1">
                {onCancel && <CLCancelButton onCancel={onCancel} label={cancelLabel} />}
            </div>
        </div>
    );
}

export function Step4CoverLetter({
    jobId,
    companyName,
    jobTitle,
    companyWebsite,
    onComplete,
    onJobApplied,
    initialData
}: Step4CoverLetterProps) {
    const t = useTranslations('cover_letter');
    const { showPaywall } = useCreditExhausted();
    const clSteps = useMemo(() => [
        t('gen_step_1'),
        t('gen_step_2'),
        t('gen_step_3'),
        t('gen_step_4'),
        t('gen_step_5'),
    ], [t]);
    const [result, setResult] = useState<GenerationResult | null>(initialData || null)
    const [isLoading, setIsLoading] = useState(false)
    const [isLoadingDraft, setIsLoadingDraft] = useState(!initialData) // true until DB check completes
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

    // On mount: load existing cover letter + setup_context from DB
    // WHY: result lives in component state — tab switching unmounts the component and loses it.
    // Solution: on every mount, check the DB for a saved draft for this jobId and restore it.
    useEffect(() => {
        let cancelled = false
        async function loadExistingDraft() {
            try {
                const supabase = createClient()
                const { data: { user } } = await supabase.auth.getUser()
                if (!user || cancelled) return

                setUserId(user.id)

                const { data: lastDraft } = await supabase
                    .from('documents')
                    .select('id, metadata')
                    .eq('user_id', user.id)
                    .eq('document_type', 'cover_letter')
                    .eq('metadata->>job_id', jobId)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .single()

                if (cancelled) return

                if (!lastDraft?.metadata) {
                    // No draft found — wizard will show
                    return
                }

                // Restore setup_context for future re-generations
                if (lastDraft.metadata.setup_context) {
                    lastUsedContextRef.current = lastDraft.metadata.setup_context
                }

                // The API saves letter text in metadata.generated_content (NOT the content column)
                const letterText = lastDraft.metadata.generated_content
                if (!result && letterText) {
                    setResult({
                        coverLetter: letterText,
                        iterations: lastDraft.metadata.iterations ?? 1,
                        draftId: lastDraft.id,
                        judgePassed: lastDraft.metadata.judge_passed ?? true,
                        judgeFailReasons: lastDraft.metadata.judge_fail_reasons ?? [],
                        warnings: [],
                        validation: lastDraft.metadata.validation ?? {
                            isValid: true,
                            stats: { wordCount: 0, companyMentions: 0, paragraphCount: 0, forbiddenPhraseCount: 0 },
                            errors: [],
                            warnings: [],
                        },
                    })
                    setWizardCompleted(true)
                    console.log('✅ [CoverLetter] Restored from DB draft on mount')

                    // Sync job status so the Cover Letter tile appears in the progress row.
                    // Statuses below cover_letter_done won't have the tile — fix them silently.
                    const COVER_LETTER_DONE_STATUSES = ['cover_letter_done', 'ready_for_review', 'ready_to_apply', 'submitted', 'video_letter_done']
                    const { data: jobRow } = await supabase
                        .from('job_queue')
                        .select('status')
                        .eq('id', jobId)
                        .single()
                    if (jobRow && !COVER_LETTER_DONE_STATUSES.includes(jobRow.status)) {
                        await supabase
                            .from('job_queue')
                            .update({ status: 'cover_letter_done' })
                            .eq('id', jobId)
                        console.log('✅ [CoverLetter] Synced job status → cover_letter_done')
                    }
                    // Always fire onComplete when a draft is found — keeps optimisticStep in sync
                    if (!cancelled) onComplete?.()
                }
            } finally {
                if (!cancelled) setIsLoadingDraft(false)
            }
        }
        loadExistingDraft()
        return () => { cancelled = true }
    }, [jobId]) // eslint-disable-line react-hooks/exhaustive-deps



    const generateCoverLetter = async (context?: CoverLetterSetupContext) => {
        try {
            if (!result) setIsLoading(true)
            setError(null)

            // Use current user session from Supabase
            const supabase = createClient()
            const { data: { user } } = await supabase.auth.getUser()
            const currentUserId = user?.id

            if (!currentUserId) {
                throw new Error(t('error_not_logged_in'))
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
                if (response.status === 402 && errorData.error === 'CREDITS_EXHAUSTED') {
                    showPaywall('credits', { remaining: errorData.remaining ?? 0 })
                    return
                }
                throw new Error(errorData.error || t('error_generation_failed'))
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


            if (onComplete) {
                onComplete()
            }

        } catch (err) {
            console.error('❌ Cover letter generation failed:', err)
            if (err instanceof DOMException && err.name === 'AbortError') {
                setError(t('error_timeout'))
            } else {
                setError(err instanceof Error ? err.message : t('error_unknown'))
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


    // Waiting for DB draft check — show spinner to prevent wizard flash
    if (isLoadingDraft) {
        return (
            <div className="flex items-center justify-center py-16">
                <LoadingSpinner className="w-5 h-5 text-[#002e7a]" />
            </div>
        )
    }

    // Show wizard if not yet completed and no existing result
    if (!wizardCompleted && !result) {
        return (
            <CoverLetterWizard
                jobId={jobId}
                companyName={companyName}
                companyWebsite={companyWebsite ?? null}
                onComplete={handleWizardComplete}
            />
        )
    }

    // AI Progress loading view
    if (isLoading && !result) {
        return <GenerationProgressView
            onCancel={() => { setIsLoading(false); setError(null); }}
            steps={clSteps}
            title={t('gen_title')}
            duration={t('gen_duration')}
            cancelLabel={t('btn_cancel')}
        />;
    }

    // Error state
    if (error) {
        return (
            <div className="p-6 bg-red-50 rounded-lg border border-red-200 m-6">
                <h3 className="text-sm font-semibold text-red-800 mb-2">{t('error_gen_title')}</h3>
                <p className="text-xs text-red-600 mb-4">{error}</p>
                <button
                    onClick={() => generateCoverLetter()}
                    className="text-xs bg-white border border-red-200 text-red-600 px-3 py-1.5 rounded-md hover:bg-red-50 transition-colors"
                >
                    {t('btn_retry')}
                </button>
            </div>
        )
    }

    // Success state
    if (result && userId) {
        return (
            <div className="space-y-4 p-6 bg-[#FAFAF9]">
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
                    companyName={companyName}
                    jobTitle={jobTitle}
                    setupContext={buildContextFromStore() ?? wizardContext}
                    onApplied={onJobApplied}
                />
            </div>
        )
    }

    return null
}
