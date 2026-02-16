"use client"

import { useState } from "react"
import { ChevronDown, ChevronUp, CheckCircle2, XCircle, AlertCircle, RefreshCw } from "lucide-react"
import type { QualityScores } from "./types" // Use local types
import type { ValidationResult } from "@/lib/services/cover-letter-validator"

interface QualityFeedbackProps {
    validation?: ValidationResult
    scores: QualityScores
    iterations?: number
    showDetails?: boolean
}

function ScoreCard({ label, score }: { label: string; score: number }) {
    const getColor = (score: number) => {
        if (score >= 8) return "text-green-600 bg-green-50 border-green-200"
        if (score >= 6) return "text-yellow-600 bg-yellow-50 border-yellow-200"
        return "text-red-600 bg-red-50 border-red-200"
    }

    return (
        <div className={`border rounded-lg p-2 ${getColor(score)}`}>
            <div className="text-[10px] font-medium mb-0.5 uppercase tracking-wide">{label}</div>
            <div className="text-lg font-bold">{score}<span className="text-xs font-normal">/10</span></div>
        </div>
    )
}

export function QualityFeedback({ validation, scores, iterations, showDetails }: QualityFeedbackProps) {
    const [isExpanded, setIsExpanded] = useState(showDetails || false)

    // Overall assessment
    const isValidationPassed = validation?.isValid ?? true
    const isQualityGood = scores.overall_score >= 8
    const overallStatus = isValidationPassed && isQualityGood ? "excellent" :
        isValidationPassed && scores.overall_score >= 6 ? "good" :
            isValidationPassed ? "needs_improvement" : "validation_failed"

    return (
        <div className="space-y-4">
            {/* Header with Overall Status */}
            <div className="flex items-center justify-between pb-3 border-b border-[#E7E7E5]">
                <div className="flex items-center gap-3">
                    {overallStatus === "excellent" && (
                        <>
                            <CheckCircle2 className="w-5 h-5 text-green-600" />
                            <span className="text-sm font-semibold text-green-700">Excellent Quality</span>
                        </>
                    )}
                    {overallStatus === "good" && (
                        <>
                            <CheckCircle2 className="w-5 h-5 text-blue-600" />
                            <span className="text-sm font-semibold text-blue-700">Good Quality</span>
                        </>
                    )}
                    {overallStatus === "needs_improvement" && (
                        <>
                            <AlertCircle className="w-5 h-5 text-yellow-600" />
                            <span className="text-sm font-semibold text-yellow-700">Needs Improvement</span>
                        </>
                    )}
                    {overallStatus === "validation_failed" && (
                        <>
                            <XCircle className="w-5 h-5 text-red-600" />
                            <span className="text-sm font-semibold text-red-700">Validation Failed</span>
                        </>
                    )}
                </div>

                <div className="flex items-center gap-3">
                    {iterations && (
                        <div className="flex items-center text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                            <RefreshCw className="w-3 h-3 mr-1" />
                            Iteration {iterations}
                        </div>
                    )}

                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="text-xs text-[#73726E] hover:text-[#37352F] flex items-center gap-1 transition-colors"
                    >
                        {isExpanded ? (
                            <><ChevronUp size={14} /> Hide Details</>
                        ) : (
                            <><ChevronDown size={14} /> Show Details</>
                        )}
                    </button>
                </div>
            </div>

            {/* Validation Status */}
            {validation && (
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="flex items-center gap-2">
                        {isValidationPassed ? (
                            <CheckCircle2 className="w-4 h-4 text-green-600" />
                        ) : (
                            <XCircle className="w-4 h-4 text-red-600" />
                        )}
                        <span className="text-sm font-medium">
                            {isValidationPassed ? 'Validation Passed' : 'Validation Failed'}
                        </span>
                    </div>
                    {validation.stats && (
                        <div className="flex items-center gap-4 text-xs text-[#73726E]">
                            <span>{validation.stats.wordCount} words</span>
                            <span>{validation.stats.companyMentions}x company</span>
                            <span>{validation.stats.paragraphCount} paragraphs</span>
                        </div>
                    )}
                </div>
            )}

            {/* Validation Errors (if any) */}
            {validation?.errors && validation.errors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                        <XCircle className="w-4 h-4 text-red-600" />
                        <h4 className="text-sm font-semibold text-red-900">Validation Errors</h4>
                    </div>
                    <ul className="list-disc pl-5 space-y-1">
                        {validation.errors.map((error, i) => (
                            <li key={i} className="text-sm text-red-700">{error}</li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Validation Warnings (if any) */}
            {validation?.warnings && validation.warnings.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                        <AlertCircle className="w-4 h-4 text-yellow-600" />
                        <h4 className="text-sm font-semibold text-yellow-900">Suggestions</h4>
                    </div>
                    <ul className="list-disc pl-5 space-y-1">
                        {validation.warnings.map((warning, i) => (
                            <li key={i} className="text-sm text-yellow-700">{warning}</li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Quality Scores (only if expanded) */}
            {isExpanded && (
                <div className="space-y-4 pt-4 border-t border-[#E7E7E5]">
                    <h4 className="text-sm font-semibold text-[#37352F]">Quality Scores</h4>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        <ScoreCard label="Overall" score={scores.overall_score} />
                        <ScoreCard label="Naturalness" score={scores.naturalness_score} />
                        <ScoreCard label="Style Match" score={scores.style_match_score} />
                        <ScoreCard label="Relevance" score={scores.company_relevance_score} />
                        <ScoreCard label="Individuality" score={scores.individuality_score} />
                    </div>

                    {/* Issues (if any) */}
                    {scores.issues && scores.issues.length > 0 && (
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                            <h5 className="text-sm font-semibold text-blue-900 mb-2">Issues Detected</h5>
                            <ul className="list-disc pl-5 space-y-1">
                                {scores.issues.map((issue, i) => (
                                    <li key={i} className="text-sm text-blue-700">{issue}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Suggestions (if any) */}
                    {scores.suggestions && scores.suggestions.length > 0 && (
                        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                            <h5 className="text-sm font-semibold text-purple-900 mb-2">Suggestions</h5>
                            <ul className="list-disc pl-5 space-y-1">
                                {scores.suggestions.map((suggestion, i) => (
                                    <li key={i} className="text-sm text-purple-700">{suggestion}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}