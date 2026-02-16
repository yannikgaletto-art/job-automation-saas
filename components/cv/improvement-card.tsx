'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/motion/button'
import { Badge } from '@/components/motion/badge'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { CVDiffViewer } from './cv-diff-viewer'

interface ImprovementCardProps {
    section: {
        section: string
        original: string
        improved: string
        reasoning: string
        impact: 'high' | 'medium' | 'low'
    }
    isAccepted: boolean
    onToggle: () => void
}

export function ImprovementCard({
    section,
    isAccepted,
    onToggle
}: ImprovementCardProps) {
    const [isExpanded, setIsExpanded] = useState(false)

    const impactColors = {
        high: 'bg-red-100 text-red-700 border-red-200',
        medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
        low: 'bg-gray-100 text-gray-700 border-gray-200'
    }

    const impactLabels = {
        high: '🔴 High Impact',
        medium: '🟡 Medium Impact',
        low: '🟢 Low Impact'
    }

    return (
        <motion.div
            layout
            className={`border rounded-lg overflow-hidden transition-all ${isAccepted
                    ? 'border-green-500 bg-green-50'
                    : 'border-[#E7E7E5] bg-white'
                }`}
        >
            {/* Header */}
            <div className="p-4">
                <div className="flex items-start justify-between">
                    <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-semibold text-[#37352F]">
                                {section.section}
                            </h3>
                            <Badge
                                variant="outline"
                                className={impactColors[section.impact]}
                            >
                                {impactLabels[section.impact]}
                            </Badge>
                        </div>
                        <p className="text-sm text-[#73726E]">
                            {section.reasoning}
                        </p>
                    </div>

                    <div className="flex items-center gap-2 ml-4">
                        <Button
                            size="sm"
                            variant={isAccepted ? 'primary' : 'outline'}
                            onClick={onToggle}
                        >
                            {isAccepted ? '✅ Accepted' : 'Accept'}
                        </Button>
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setIsExpanded(!isExpanded)}
                        >
                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </Button>
                    </div>
                </div>
            </div>

            {/* Expandable Diff View */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                    >
                        <div className="border-t border-[#E7E7E5] p-4 bg-[#FAFAF9]">
                            <CVDiffViewer
                                original={section.original}
                                improved={section.improved}
                            />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    )
}
