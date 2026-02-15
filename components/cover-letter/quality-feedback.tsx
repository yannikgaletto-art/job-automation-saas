"use client"

import { QualityScores } from "@/lib/services/quality-judge"
import { useState } from "react"
import { ChevronDown, ChevronUp, AlertCircle, Lightbulb, CheckCircle2 } from "lucide-react"

interface QualityFeedbackProps {
    scores: QualityScores
    iterations: number
    showDetails?: boolean
}

export function QualityFeedback({
    scores,
    iterations,
    showDetails = false
}: QualityFeedbackProps) {
    const [isExpanded, setIsExpanded] = useState(showDetails)

    const getScoreColor = (score: number) => {
        if (score >= 8) return "text-green-600 bg-green-50 border-green-200"
        if (score >= 6) return "text-orange-600 bg-orange-50 border-orange-200"
        return "text-red-600 bg-red-50 border-red-200"
    }

    const getScoreBadgeColor = (score: number) => {
        if (score >= 8) return "bg-green-100 text-green-700"
        if (score >= 6) return "bg-orange-100 text-orange-700"
        return "bg-red-100 text-red-700"
    }

    return (
        <div className="bg-white rounded-lg border border-[#E7E7E5] overflow-hidden">
            {/* Header */}
            <div className="p-4 flex items-center justify-between border-b border-[#E7E7E5] bg-[#FAFAF9]">
                <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-[#37352F]">
                        ✨ Quality Check Results
                    </h3>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                        {iterations} Iteration{iterations > 1 ? "s" : ""}
                    </span>
                </div>
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="text-[#73726E] hover:text-[#37352F]"
                >
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
            </div>

            {isExpanded && (
                <div className="p-6">
                    {/* Overall Score (Big) */}
                    <div className={`text-center mb-6 p-6 rounded-lg border ${getScoreColor(scores.overall_score)}`}>
                        <div className="text-5xl font-bold mb-2">
                            {scores.overall_score}/10
                        </div>
                        <div className="flex items-center justify-center gap-2 font-medium">
                            {scores.overall_score >= 8 ? (
                                <><CheckCircle2 size={18} /> Excellent Quality</>
                            ) : scores.overall_score >= 6 ? (
                                <><AlertCircle size={18} /> Good, Could Improve</>
                            ) : (
                                <><AlertCircle size={18} /> Needs Work</>
                            )}
                        </div>
                    </div>

                    {/* Detailed Scores */}
                    <div className="grid grid-cols-2 gap-4 mb-6">
                        <ScoreCard
                            label="Naturalness"
                            score={scores.naturalness_score}
                            icon="🗣️"
                            colorClass={getScoreBadgeColor(scores.naturalness_score)}
                        />
                        <ScoreCard
                            label="Style Match"
                            score={scores.style_match_score}
                            icon="✍️"
                            colorClass={getScoreBadgeColor(scores.style_match_score)}
                        />
                        <ScoreCard
                            label="Relevance"
                            score={scores.company_relevance_score}
                            icon="🎯"
                            colorClass={getScoreBadgeColor(scores.company_relevance_score)}
                        />
                        <ScoreCard
                            label="Individuality"
                            score={scores.individuality_score}
                            icon="⭐"
                            colorClass={getScoreBadgeColor(scores.individuality_score)}
                        />
                    </div>

                    {/* Issues & Suggestions */}
                    <div className="space-y-4">
                        {scores.issues.length > 0 && (
                            <div className="p-4 bg-red-50 rounded-md border border-red-100">
                                <p className="text-sm font-semibold text-red-800 mb-2 flex items-center gap-2">
                                    <AlertCircle size={16} /> Issues Found:
                                </p>
                                <ul className="text-xs text-red-700 space-y-1 list-disc pl-4">
                                    {scores.issues.map((issue, idx) => (
                                        <li key={idx}>{issue}</li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {scores.suggestions.length > 0 && (
                            <div className="p-4 bg-blue-50 rounded-md border border-blue-100">
                                <p className="text-sm font-semibold text-blue-800 mb-2 flex items-center gap-2">
                                    <Lightbulb size={16} /> Suggestions:
                                </p>
                                <ul className="text-xs text-blue-700 space-y-1 list-disc pl-4">
                                    {scores.suggestions.map((suggestion, idx) => (
                                        <li key={idx}>{suggestion}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

function ScoreCard({ label, score, icon, colorClass }: {
    label: string
    score: number
    icon: string
    colorClass: string
}) {
    return (
        <div className="p-3 border border-[#E7E7E5] rounded-md flex items-center justify-between">
            <div className="flex items-center gap-2">
                <span>{icon}</span>
                <span className="text-xs text-[#73726E] font-medium">{label}</span>
            </div>
            <div className={`px-2 py-0.5 rounded text-sm font-bold ${colorClass}`}>
                {score}/10
            </div>
        </div>
    )
}
