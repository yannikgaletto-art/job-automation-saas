"use client"

import { useState } from "react"
import { Button } from "@/components/motion/button"
import { CoverLetterPreview } from "@/components/cover-letter/cover-letter-preview"
import { CoverLetterActions } from "@/components/cover-letter/cover-letter-actions"
import { QualityFeedback } from "@/components/cover-letter/quality-feedback"
import { Sparkles, AlertCircle } from "lucide-react"
import type { QualityScores } from "@/lib/services/quality-judge"
import type { ValidationResult } from "@/lib/services/cover-letter-validator"

interface CoverLetterStepProps {
    userId: string
    jobId: string
    initialCoverLetter?: string
    initialScores?: QualityScores
    initialValidation?: ValidationResult
}

export function CoverLetterStep({
    userId,
    jobId,
    initialCoverLetter,
    initialScores,
    initialValidation
}: CoverLetterStepProps) {
    const [coverLetter, setCoverLetter] = useState(initialCoverLetter || "")
    const [qualityScores, setQualityScores] = useState<QualityScores | null>(initialScores || null)
    const [validation, setValidation] = useState<ValidationResult | null>(initialValidation || null)
    const [isGenerating, setIsGenerating] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleGenerate = async () => {
        setIsGenerating(true)
        setError(null)

        try {
            const response = await fetch('/api/cover-letter/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, jobId })
            })

            if (!response.ok) {
                const errorData = await response.json()
                throw new Error(errorData.error || 'Generation failed')
            }

            const data = await response.json()
            setCoverLetter(data.cover_letter)
            setQualityScores(data.quality_scores)
            setValidation(data.validation)
        } catch (err: any) {
            console.error('❌ Cover letter generation failed:', err)
            setError(err.message || 'Failed to generate cover letter')
        } finally {
            setIsGenerating(false)
        }
    }

    const handleRegenerate = async () => {
        // Same as generate, but user-initiated
        await handleGenerate()
    }

    if (!coverLetter) {
        return (
            <div className="space-y-6">
                {/* Empty State */}
                <div className="text-center py-12 px-6 bg-gradient-to-br from-blue-50 to-purple-50 rounded-xl border-2 border-dashed border-blue-200">
                    <Sparkles className="w-12 h-12 mx-auto mb-4 text-blue-500" />
                    <h3 className="text-xl font-semibold text-[#37352F] mb-2">
                        Generate Your Cover Letter
                    </h3>
                    <p className="text-sm text-[#73726E] mb-6 max-w-md mx-auto">
                        Create a personalized cover letter that matches your writing style
                        and highlights your fit for this position.
                    </p>
                    <Button
                        onClick={handleGenerate}
                        disabled={isGenerating}
                        className="px-6"
                    >
                        {isGenerating ? (
                            <>
                                <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                                <span className="ml-2">Generating...</span>
                            </>
                        ) : (
                            <>
                                <Sparkles className="w-4 h-4" />
                                <span className="ml-2">Generate Cover Letter</span>
                            </>
                        )}
                    </Button>
                </div>

                {/* Error Display */}
                {error && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                        <div>
                            <h4 className="text-sm font-semibold text-red-900 mb-1">Generation Failed</h4>
                            <p className="text-sm text-red-700">{error}</p>
                        </div>
                    </div>
                )}
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Quality Feedback (if available) */}
            {qualityScores && validation && (
                <QualityFeedback
                    validation={validation}
                    scores={qualityScores}
                />
            )}

            {/* Cover Letter Preview */}
            <CoverLetterPreview coverLetter={coverLetter} />

            {/* Actions */}
            <CoverLetterActions
                coverLetter={coverLetter}
                onRegenerate={handleRegenerate}
                isRegenerating={isGenerating}
            />

            {/* Error Display */}
            {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <div>
                        <h4 className="text-sm font-semibold text-red-900 mb-1">Regeneration Failed</h4>
                        <p className="text-sm text-red-700">{error}</p>
                    </div>
                </div>
            )}
        </div>
    )
}