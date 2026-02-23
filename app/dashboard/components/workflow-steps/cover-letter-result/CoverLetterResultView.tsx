"use client"

import { useState } from "react"
import { LetterEditor } from "./LetterEditor"
import { SuggestionsList } from "./SuggestionsList"
import { ScoreBadges } from "./ScoreBadges"
import type { QualityScores } from "@/components/cover-letter/types"
import type { CoverLetterSetupContext } from "@/types/cover-letter-setup"
import confetti from "canvas-confetti"

interface GenerationResult {
    coverLetter: string
    qualityScores: QualityScores
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
    setupContext?: CoverLetterSetupContext | null
}

export function CoverLetterResultView({ initialResult, userId, jobId, setupContext }: CoverLetterResultViewProps) {
    const [result, setResult] = useState<GenerationResult>(initialResult)
    const [currentLetter, setCurrentLetter] = useState(initialResult.coverLetter)
    const [fixingWeakness, setFixingWeakness] = useState<string | null>(null)
    const [fixingIndex, setFixingIndex] = useState<number | null>(null)
    const [isApplied, setIsApplied] = useState(false)

    // Extract latest weaknesses from the log or scores
    const lastLog = result.iteration_log?.[result.iteration_log.length - 1]
    const weaknesses: string[] = lastLog?.scores?.weaknesses || result.qualityScores.issues || []

    const callFixAPI = async (instruction: string) => {
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
            alert("Fix fehlgeschlagen — bitte manuell bearbeiten")
        } finally {
            setFixingWeakness(null)
            setFixingIndex(null)
        }
    }

    const handleFixWeakness = async (weakness: string) => {
        setFixingWeakness(weakness)
        // Find the paragraph most related to this weakness for the spinner
        const paragraphs = currentLetter.split(/\n\n+/).filter(p => p.trim().length > 0)
        const targetWords = weakness.toLowerCase().split(/\s+/).filter(w => w.length > 3)
        let bestMatchIdx = 0
        let maxMatches = -1
        paragraphs.forEach((p, idx) => {
            let matches = 0
            const pLower = p.toLowerCase()
            targetWords.forEach(w => { if (pLower.includes(w)) matches++ })
            if (matches > maxMatches) { maxMatches = matches; bestMatchIdx = idx }
        })
        setFixingIndex(bestMatchIdx)
        // Remove fixed weakness from list on success
        const prevLog = lastLog
        const prevWeaknesses = weaknesses
        try {
            await callFixAPI(weakness)
            setResult(prev => ({
                ...prev,
                iteration_log: [
                    ...(prev.iteration_log || []),
                    {
                        ...prevLog,
                        scores: {
                            ...prevLog?.scores,
                            weaknesses: prevWeaknesses.filter(w => w !== weakness)
                        }
                    }
                ]
            }))
        } catch {
            // already handled in callFixAPI
        }
    }

    const handleCustomFix = async (instruction: string) => {
        setFixingWeakness(instruction)
        setFixingIndex(null) // No specific paragraph for custom instructions
        await callFixAPI(instruction)
    }

    const handleCopy = () => {
        navigator.clipboard.writeText(currentLetter)
        // Optional: show toast
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
        const safeCompanyName = setupContext?.companyName?.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'Unternehmen';
        fileDownload.download = `Anschreiben_${safeCompanyName}.doc`;
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
            confetti({
                particleCount: 100,
                spread: 70,
                origin: { y: 0.6 }
            })
        } catch {
            alert("Konnte den Status nicht aktualisieren.")
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
                        fixingParagraphIndex={fixingIndex}
                    />

                    <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-[#E7E7E5]">
                        <button
                            onClick={handleCopy}
                            className="bg-white border border-[#E7E7E5] px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-50 transition-colors"
                        >
                            📋 Kopieren
                        </button>
                        <button
                            onClick={handleDownloadPdf}
                            className="bg-white border border-[#E7E7E5] px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-50 transition-colors"
                        >
                            📥 PDF
                        </button>
                        <button
                            onClick={handleDownloadDocx}
                            className="bg-white border border-[#E7E7E5] px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-50 transition-colors"
                        >
                            📝 Word (.doc)
                        </button>

                        <div className="flex-1" />

                        {isApplied ? (
                            <div className="text-[#2e7d32] bg-[#e8f5e9] rounded px-3 py-2 text-sm font-medium flex items-center gap-2">
                                ✅ Bewerbung gespeichert
                            </div>
                        ) : (
                            <button
                                onClick={handleMarkApplied}
                                className="bg-[#002e7a] text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-[#001f5c] transition-colors flex items-center gap-2"
                            >
                                ✓ Als beworben markieren
                            </button>
                        )}
                    </div>
                </div>

                {/* Right Column: Feedback */}
                <div className="space-y-6">
                    <ScoreBadges scores={result.qualityScores} />

                    <SuggestionsList
                        weaknesses={weaknesses}
                        onFix={handleFixWeakness}
                        onCustomFix={handleCustomFix}
                        fixingWeakness={fixingWeakness}
                    />

                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-xs text-[#73726E] space-y-1">
                        <div className="font-semibold text-gray-700 mb-2">Statistiken</div>
                        <div>Wörter: {result.validation?.stats?.wordCount ?? 0}</div>
                        <div>Absätze: {result.validation?.stats?.paragraphCount ?? 0}</div>
                        <div>Unternehmensnennungen: {result.validation?.stats?.companyMentions ?? 0}</div>
                    </div>
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
