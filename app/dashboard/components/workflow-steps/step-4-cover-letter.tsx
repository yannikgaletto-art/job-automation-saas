"use client"

import { useState, useEffect } from "react"
import { CoverLetterWizard } from "./cover-letter-wizard/CoverLetterWizard"
import type { CoverLetterSetupContext } from "@/types/cover-letter-setup"
import { QualityScores } from "@/components/cover-letter/types"
import { createClient } from "@/lib/supabase/client"
import { CoverLetterResultView } from "./cover-letter-result/CoverLetterResultView"

interface Step4CoverLetterProps {
    jobId: string
    companyName: string
    jobTitle: string
    onComplete?: () => void
    initialData?: GenerationResult | null
}

interface GenerationResult {
    coverLetter: string
    qualityScores: QualityScores
    iterations: number
    iteration_log?: any[]
    validation?: {
        isValid: boolean
        stats: { wordCount: number; companyMentions: number; paragraphCount: number; forbiddenPhraseCount: number }
        errors: string[]
        warnings: string[]
    }
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

            const response = await fetch('/api/cover-letter/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jobId,
                    userId: currentUserId,
                    setupContext: context || wizardContext,
                })
            })

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}))
                throw new Error(errorData.error || 'Generierung fehlgeschlagen')
            }

            const data = await response.json()

            const scores = data.quality_scores || {}

            const qualityScores: QualityScores = {
                naturalness_score: scores.naturalness || scores.naturalness_score || 8,
                style_match_score: scores.style_match || scores.style_match_score || 8,
                company_relevance_score: scores.company_relevance || scores.company_relevance_score || 8,
                individuality_score: scores.individuality || scores.individuality_score || 8,
                overall_score: scores.overall_score || 8,
                issues: scores.issues || [],
                suggestions: scores.suggestions || []
            }

            const rawValidation = data.validation || {};
            const coverLetterText: string = data.cover_letter || data.coverLetter || '';
            const wordCount = coverLetterText.trim().split(/\s+/).filter(Boolean).length;
            const paragraphCount = coverLetterText.split(/\n\n+/).filter(p => p.trim()).length;
            const companyNamesToMatch = companyName ? [companyName] : [];
            const companyMentions = companyNamesToMatch.length > 0
                ? (coverLetterText.match(new RegExp(companyName, 'gi')) || []).length
                : 0;

            const mappedResult: GenerationResult = {
                coverLetter: coverLetterText,
                qualityScores,
                iterations: data.iterations || 1,
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

    // Loading skeleton
    if (isLoading && !result) {
        return (
            <div className="space-y-6 p-6">
                <div className="animate-pulse space-y-4">
                    <div className="h-6 bg-[#E7E7E5] rounded w-1/3 mb-4"></div>
                    <div className="space-y-3">
                        <div className="h-4 bg-[#E7E7E5] rounded w-full"></div>
                        <div className="h-4 bg-[#E7E7E5] rounded w-full"></div>
                        <div className="h-4 bg-[#E7E7E5] rounded w-5/6"></div>
                        <div className="h-4 bg-[#E7E7E5] rounded w-full"></div>
                        <div className="h-4 bg-[#E7E7E5] rounded w-4/5"></div>
                    </div>
                </div>
                <p className="text-sm text-[#73726E] text-center flex items-center justify-center gap-2">
                    <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></span>
                    ✨ Generiere personalisiertes Anschreiben...
                </p>
            </div>
        )
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
                    setupContext={wizardContext}
                />
            </div>
        )
    }

    return null
}