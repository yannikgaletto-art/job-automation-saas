"use client"

import { useState, useEffect, useRef } from "react"
import { LetterEditor } from "./LetterEditor"
import { HiringManagerCritique } from "./HiringManagerCritique"
import type { HiringManagerCritique as CritiqueType, CoverLetterSetupContext } from "@/types/cover-letter-setup"
import { useTranslations, useLocale } from 'next-intl'
import { useCreditExhausted } from '@/app/[locale]/dashboard/hooks/credit-exhausted-context'

interface GenerationResult {
    coverLetter: string
    iterations: number
    validation?: {
        isValid: boolean
        stats: { wordCount: number; companyMentions: number; paragraphCount: number; forbiddenPhraseCount: number }
        errors: string[]
        warnings: string[]
    }
    iteration_log?: any[]
}

interface CoverLetterResultViewProps {
    initialResult: GenerationResult
    userId: string
    jobId: string
    companyName: string
    jobTitle: string
    setupContext?: CoverLetterSetupContext | null
    onApplied?: () => void
}

export function CoverLetterResultView({ initialResult, userId, jobId, companyName, jobTitle, setupContext, onApplied }: CoverLetterResultViewProps) {
    const t = useTranslations('cover_letter');
    const locale = useLocale();
    const { showPaywall } = useCreditExhausted();
    const [currentLetter, setCurrentLetter] = useState(initialResult.coverLetter)
    const [fixingParagraphIndex, setFixingParagraphIndex] = useState<number | null>(null)
    const [isFixing, setIsFixing] = useState(false)
    const [isApplied, setIsApplied] = useState(false)
    const [isApplyPending, setIsApplyPending] = useState(false)
    const [isApplyError, setIsApplyError] = useState(false)
    const applyErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const [isCopied, setIsCopied] = useState(false)
    const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Cleanup timer on unmount to prevent state-update-on-unmounted-component
    useEffect(() => {
        return () => {
            if (applyErrorTimerRef.current) clearTimeout(applyErrorTimerRef.current)
            if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
        }
    }, [])

    // ─── Hiring Manager Critique State ───────────────────────────────
    const [critique, setCritique] = useState<CritiqueType | null>(null)
    const [critiqueLoading, setCritiqueLoading] = useState(true)
    const [critiqueError, setCritiqueError] = useState(false)
    const [critiqueResolved, setCritiqueResolved] = useState(false)

    // ─── Fetch Critique on Mount (one-shot, no re-fetch after fix) ───
    useEffect(() => {
        if (critiqueResolved) return
        const fetchCritique = async () => {
            try {
                const res = await fetch('/api/cover-letter/critique', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        coverLetter: initialResult.coverLetter,
                        jobTitle: jobTitle || '',
                        companyName: setupContext?.companyName || companyName || '',
                        locale,
                    })
                })
                if (!res.ok) {
                    if (res.status === 402) {
                        const errData = await res.json().catch(() => ({}))
                        if (errData.error === 'CREDITS_EXHAUSTED') {
                            showPaywall('credits', { remaining: errData.remaining ?? 0 })
                            setCritiqueLoading(false)
                            return
                        }
                    }
                    throw new Error('Critique fetch failed')
                }
                const data = await res.json()
                setCritique(data.critique ?? null)
            } catch {
                setCritiqueError(true)
            } finally {
                setCritiqueLoading(false)
            }
        }
        fetchCritique()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []) // One-shot: only on mount

    // ─── Fix API (shared between critique and custom input) ──────────
    const callFixAPI = async (instruction: string) => {
        setIsFixing(true)
        try {
            const response = await fetch('/api/cover-letter/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jobId,
                    userId,
                    setupContext,
                    fixMode: 'targeted',
                    targetFix: instruction,
                    currentLetter
                })
            })
            if (!response.ok) {
                if (response.status === 402) {
                    const errData = await response.json().catch(() => ({}))
                    if (errData.error === 'CREDITS_EXHAUSTED') {
                        showPaywall('credits', { remaining: errData.remaining ?? 0 })
                        return
                    }
                }
                throw new Error('Fix fehlgeschlagen')
            }
            const data = await response.json()
            if (data.cover_letter) {
                setCurrentLetter(data.cover_letter)
            }
        } catch (e) {
            console.error(e)
            // Non-blocking — user can still edit manually
        } finally {
            setIsFixing(false)
            setFixingParagraphIndex(null)
        }
    }

    const handleApplyCritiqueFix = async (fixSuggestion: string) => {
        await callFixAPI(fixSuggestion)
        setCritiqueResolved(true) // Switch to success state, no re-fetch
    }

    const handleCustomFix = async (instruction: string) => {
        setFixingParagraphIndex(null)
        await callFixAPI(instruction)
    }

    const handleCopy = () => {
        navigator.clipboard.writeText(currentLetter)
        setIsCopied(true)
        if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
        copyTimerRef.current = setTimeout(() => setIsCopied(false), 2000)
    }

    const handleDownloadPdf = () => {
        window.print()
    }

    const handleDownloadDocx = () => {
        const header = "<html xmlns:o='urn:schemas-microsoft-com:office:office' " +
            "xmlns:w='urn:schemas-microsoft-com:office:word' " +
            "xmlns='http://www.w3.org/TR/REC-html40'>" +
            "<head><meta charset='utf-8'><title>Cover Letter</title></head><body>";
        const footer = "</body></html>";
        const content = currentLetter
            .split(/\n\n+/)
            .filter(p => p.trim().length > 0)
            .map(p => `<p style="font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.5; margin-bottom: 12pt;">${p.trim()}</p>`)
            .join("");
        const sourceHTML = header + content + footer;

        const source = 'data:application/vnd.ms-word;charset=utf-8,' + encodeURIComponent(sourceHTML);
        const fileDownload = document.createElement("a");
        document.body.appendChild(fileDownload);
        fileDownload.href = source;
        // FIX: use companyName prop (from job data, always set) instead of
        // setupContext.companyName which is hardcoded '' in buildContext()
        const safeCompanyName = companyName?.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'company';
        fileDownload.download = `${t('result_filename')}_${safeCompanyName}.doc`;
        fileDownload.click();
        document.body.removeChild(fileDownload);
    }

    const handleMarkApplied = async () => {
        if (isApplied || isApplyPending) return
        setIsApplyPending(true)
        setIsApplyError(false)
        try {
            const res = await fetch('/api/jobs/mark-applied', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jobId })
            })
            const resData = await res.json()

            // Check both HTTP status AND success flag — API may return 200 with success:false
            if (!res.ok || !resData.success) throw new Error(resData.error || 'Failed')

            setIsApplied(true)
            onApplied?.()
            import('canvas-confetti').then(({ default: confetti }) => {
                confetti({
                    particleCount: 100,
                    spread: 70,
                    origin: { y: 0.6 }
                })
            })
        } catch {
            setIsApplyError(true)
            // Auto-clear error, store ref to cancel if component unmounts
            if (applyErrorTimerRef.current) clearTimeout(applyErrorTimerRef.current)
            applyErrorTimerRef.current = setTimeout(() => setIsApplyError(false), 4000)
        } finally {
            setIsApplyPending(false)
        }
    }

    return (
        <div className="space-y-6">
            <style>{`
                @media print {
                    body { visibility: hidden; }
                    #print-target {
                        visibility: visible;
                        position: absolute;
                        left: 0;
                        top: 0;
                        width: 100%;
                        font-family: Georgia, serif;
                        font-size: 11pt;
                        line-height: 1.6;
                        color: #000;
                        display: block !important;
                    }
                    @page {
                        margin: 2.5cm;
                    }
                }
            `}</style>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:items-stretch">
                {/* Left Column: Editor & Actions — same max-h as right column for visual parity */}
                <div className="lg:col-span-2 space-y-4 lg:max-h-[calc(100vh-200px)] lg:overflow-y-auto lg:pr-1">
                    <LetterEditor
                        letter={currentLetter}
                        onLetterChange={setCurrentLetter}
                        fixingParagraphIndex={fixingParagraphIndex}
                    />

                    <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-[#E7E7E5]">
                        <button
                            onClick={handleCopy}
                            className={[
                                'px-4 py-2 rounded-md text-sm font-medium transition-all duration-300',
                                isCopied
                                    ? 'bg-[#002e7a] text-white border border-[#002e7a]'
                                    : 'bg-white border border-[#E7E7E5] hover:bg-gray-50',
                            ].join(' ')}
                        >
                            {isCopied ? t('btn_copied') : t('btn_copy')}
                        </button>
                        <button
                            onClick={handleDownloadPdf}
                            className="bg-white border border-[#E7E7E5] px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-50 transition-colors"
                        >
                            PDF
                        </button>
                        <button
                            onClick={handleDownloadDocx}
                            className="bg-white border border-[#E7E7E5] px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-50 transition-colors"
                        >
                            Word (.doc)
                        </button>

                        <div className="flex-1" />

                        {isApplyError && (
                            <span className="text-xs text-red-500">
                                {t('error_unknown')}
                            </span>
                        )}

                        {isApplied ? (
                            <div className="text-[#2e7d32] bg-[#e8f5e9] rounded px-3 py-2 text-sm font-medium flex items-center gap-2">
                                {t('result_applied')}
                            </div>
                        ) : (
                            <button
                                onClick={handleMarkApplied}
                                disabled={isApplyPending}
                                aria-label={t('btn_mark_applied')}
                                className="bg-[#002e7a] text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-[#001f5c] transition-colors flex items-center gap-2 disabled:opacity-60 disabled:cursor-wait"
                            >
                                {t('btn_mark_applied')}
                            </button>
                        )}
                    </div>
                </div>

                {/* Right Column: Hiring Manager Critique */}
                <div className="space-y-6 lg:max-h-[calc(100vh-200px)] lg:overflow-y-auto lg:pr-1">
                    <HiringManagerCritique
                        critique={critique}
                        isLoading={critiqueLoading}
                        isError={critiqueError}
                        critiqueResolved={critiqueResolved}
                        onApplyFix={handleApplyCritiqueFix}
                        isFixing={isFixing}
                    />
                </div>
            </div>

            {/* Hidden Print Target */}
            <div id="print-target" className="hidden">
                {currentLetter.split(/\n\n+/).map((p, i) => (
                    <p key={i} style={{ marginBottom: '1em' }}>{p}</p>
                ))}
            </div>
        </div>
    )
}
