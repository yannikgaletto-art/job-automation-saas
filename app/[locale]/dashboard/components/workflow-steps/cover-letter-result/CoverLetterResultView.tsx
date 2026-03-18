"use client"

import { useState, useEffect } from "react"
import { LetterEditor } from "./LetterEditor"
import { HiringManagerCritique } from "./HiringManagerCritique"
import type { HiringManagerCritique as CritiqueType, CoverLetterSetupContext } from "@/types/cover-letter-setup"
import { useTranslations, useLocale } from 'next-intl'

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
}

export function CoverLetterResultView({ initialResult, userId, jobId, companyName, jobTitle, setupContext }: CoverLetterResultViewProps) {
    const t = useTranslations('cover_letter');
    const locale = useLocale();
    const [currentLetter, setCurrentLetter] = useState(initialResult.coverLetter)
    const [fixingParagraphIndex, setFixingParagraphIndex] = useState<number | null>(null)
    const [isFixing, setIsFixing] = useState(false)
    const [isApplied, setIsApplied] = useState(false)

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
                if (!res.ok) throw new Error('Critique fetch failed')
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
            if (!response.ok) throw new Error('Fix fehlgeschlagen')
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
        const content = currentLetter.split(/\n\n+/).map(p => `<p style="font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.5; margin-bottom: 12pt;">${p}</p>`).join("");
        const sourceHTML = header + content + footer;

        const source = 'data:application/vnd.ms-word;charset=utf-8,' + encodeURIComponent(sourceHTML);
        const fileDownload = document.createElement("a");
        document.body.appendChild(fileDownload);
        fileDownload.href = source;
        const safeCompanyName = setupContext?.companyName?.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'company';
        fileDownload.download = `${t('result_filename')}_${safeCompanyName}.doc`;
        fileDownload.click();
        document.body.removeChild(fileDownload);
    }

    const handleMarkApplied = async () => {
        if (isApplied) return
        try {
            const res = await fetch('/api/jobs/mark-applied', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jobId, userId })
            })

            if (!res.ok) throw new Error()

            setIsApplied(true)
            import('canvas-confetti').then(({ default: confetti }) => {
                confetti({
                    particleCount: 100,
                    spread: 70,
                    origin: { y: 0.6 }
                })
            })
        } catch {
            // Error handled gracefully
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

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column: Editor & Actions */}
                <div className="lg:col-span-2 space-y-4">
                    <LetterEditor
                        letter={currentLetter}
                        onLetterChange={setCurrentLetter}
                        fixingParagraphIndex={fixingParagraphIndex}
                    />

                    <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-[#E7E7E5]">
                        <button
                            onClick={handleCopy}
                            className="bg-white border border-[#E7E7E5] px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-50 transition-colors"
                        >
                            {t('btn_copy')}
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

                        {isApplied ? (
                            <div className="text-[#2e7d32] bg-[#e8f5e9] rounded px-3 py-2 text-sm font-medium flex items-center gap-2">
                                {t('result_applied')}
                            </div>
                        ) : (
                            <button
                                onClick={handleMarkApplied}
                                className="bg-[#002e7a] text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-[#001f5c] transition-colors flex items-center gap-2"
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
                        onCustomFix={handleCustomFix}
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
