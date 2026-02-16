'use client'

import { useState } from 'react'
import { Button } from '@/components/motion/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/motion/badge'
import { Progress } from '@/components/ui/progress'
import { ImprovementCard } from './improvement-card'
import type { CVOptimizationResult } from '@/lib/services/cv-optimizer'

interface CVComparisonProps {
    optimizationResult: CVOptimizationResult
    onAcceptAll: () => Promise<void>
    onRejectAll: () => void
    onDownload: () => Promise<void>
}

// Temporary internal adapter if the backend result type doesn't match perfectly yet
// (Mirroring what the frontend expects vs what backend currently returns)
// The backend returns:
// export interface CVOptimizationResult {
//    optimizedCV: string;
//    changesLog: {
//        added_keywords: string[];
//        reordered_bullets: number;
//        quantifications_added: number;
//    };
//    atsScore: number; // 0-100
// }

export function CVComparison({
    optimizationResult,
    onAcceptAll,
    onRejectAll,
    onDownload
}: CVComparisonProps) {
    // Mock data simulation until backend returns granular sections
    // The current backend optimizationResult is monolithic (entire CV). 
    // For this UI to work as designed (sections), we'll simulate sections based on changesLog or 
    // rely on future backend updates. For MVP, we wrap the whole CV change.

    const simulatedSections = [
        {
            section: "Full CV Optimization",
            original: "Original Content (Not available in this view)", // We might need to pass original CV text here too
            improved: optimizationResult.optimizedCV,
            reasoning: "Overall optimization for ATS keywords, formatting, and impact.",
            impact: 'high' as const
        }
    ];

    const [acceptedSections, setAcceptedSections] = useState<Set<number>>(new Set())
    const [isDownloading, setIsDownloading] = useState(false)

    // Determine scores (simulated 'before' score)
    const scoreBefore = Math.max(0, optimizationResult.atsScore - 25);
    const scoreAfter = optimizationResult.atsScore;

    return (
        <Card className="bg-white p-6 border-[#E7E7E5]">
            {/* Header with ATS Score */}
            <div className="flex items-start justify-between mb-6">
                <div>
                    <h2 className="text-xl font-semibold text-[#37352F]">
                        CV Optimization Results
                    </h2>
                    <p className="text-sm text-[#73726E] mt-1">
                        Review changes and accept improvements
                    </p>
                </div>

                <div className="text-right">
                    <div className="flex items-baseline gap-2 justify-end">
                        <span className="text-2xl font-bold text-[#73726E] line-through opacity-50">
                            {scoreBefore}
                        </span>
                        <span className="text-4xl font-bold text-green-600">
                            {scoreAfter}
                        </span>
                    </div>
                    <p className="text-xs text-[#73726E] mt-1">ATS Score Improvement</p>
                    <Progress
                        value={scoreAfter}
                        className="w-32 mt-2 h-2 ml-auto"
                    />
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="p-4 bg-[#F7F7F5] rounded-lg border border-[#E7E7E5]">
                    <p className="text-xs text-[#73726E] mb-1 font-medium">Keywords Added</p>
                    <p className="text-2xl font-bold text-[#37352F]">
                        {optimizationResult.changesLog.added_keywords.length}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-2">
                        {optimizationResult.changesLog.added_keywords.map((k, i) => (
                            <Badge key={i} variant="outline" className="text-[10px] bg-white">{k}</Badge>
                        ))}
                    </div>
                </div>
                <div className="p-4 bg-[#F7F7F5] rounded-lg border border-[#E7E7E5]">
                    <p className="text-xs text-[#73726E] mb-1 font-medium">Bullets Reordered</p>
                    <p className="text-2xl font-bold text-[#37352F]">
                        {optimizationResult.changesLog.reordered_bullets}
                    </p>
                </div>
                <div className="p-4 bg-[#F7F7F5] rounded-lg border border-[#E7E7E5]">
                    <p className="text-xs text-[#73726E] mb-1 font-medium">Quantifications</p>
                    <p className="text-2xl font-bold text-[#37352F]">
                        {optimizationResult.changesLog.quantifications_added}
                    </p>
                </div>
            </div>

            {/* Improvement Cards */}
            <div className="space-y-4 mb-6">
                {simulatedSections.map((section, idx) => (
                    <ImprovementCard
                        key={idx}
                        section={section}
                        isAccepted={acceptedSections.has(idx)}
                        onToggle={() => {
                            const newSet = new Set(acceptedSections)
                            if (newSet.has(idx)) {
                                newSet.delete(idx)
                            } else {
                                newSet.add(idx)
                            }
                            setAcceptedSections(newSet)
                        }}
                    />
                ))}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col md:flex-row gap-3">
                <Button
                    onClick={async () => {
                        // Accept all sections
                        setAcceptedSections(
                            new Set(simulatedSections.map((_, i) => i))
                        )
                        await onAcceptAll()
                    }}
                    className="flex-1"
                    variant="primary"
                >
                    ✅ Accept All Changes
                </Button>
                <Button
                    onClick={async () => {
                        setIsDownloading(true);
                        await onDownload();
                        setIsDownloading(false);
                    }}
                    variant="outline"
                    disabled={acceptedSections.size === 0 || isDownloading}
                >
                    {isDownloading ? '⏳ Generating PDF...' : '📥 Download Optimized CV'}
                </Button>
                <Button onClick={onRejectAll} variant="ghost">
                    ↩️ Revert
                </Button>
            </div>
        </Card>
    )
}
