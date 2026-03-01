"use client"

import { useState, useRef } from "react"
import { Search, X } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"
// Local type — original SentenceAnnotation was replaced by AuditTrailCard in the active flow
interface SentenceAnnotation {
    text: string;
    source: 'user_style' | 'company_research' | 'job_fit';
    reference: string;
}
import { cn } from "@/lib/utils"

// ─── Color Map (from QUALITY_CV_COVER_LETTER.md) ─────────────────────────────
const SOURCE_CONFIG: Record<SentenceAnnotation['source'], {
    bg: string
    border: string
    text: string
    label: string
    badgeVariant: 'success' | 'primary' | 'outline'
}> = {
    user_style: {
        bg: 'bg-green-50',
        border: 'border-green-200',
        text: 'text-green-800',
        label: 'Schreibstil',
        badgeVariant: 'success',
    },
    company_research: {
        bg: 'bg-blue-50',
        border: 'border-blue-200',
        text: 'text-blue-800',
        label: 'Firmenrecherche',
        badgeVariant: 'primary',
    },
    job_fit: {
        bg: 'bg-purple-50',
        border: 'border-purple-200',
        text: 'text-purple-800',
        label: 'Job-Passung',
        badgeVariant: 'outline',
    },
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface XRayEditorProps {
    coverLetter: string
    annotations?: SentenceAnnotation[] | null
    xRayActive: boolean
    onToggle: () => void
}

export function XRayEditor({
    coverLetter,
    annotations,
    xRayActive,
    onToggle,
}: XRayEditorProps) {
    const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
    const hasAnnotations = annotations && annotations.length > 0

    // Split cover letter into paragraphs for plain-text mode
    const paragraphs = coverLetter.split(/\n\n/).filter(p => p.trim())

    // Word count
    const wordCount = coverLetter.trim().split(/\s+/).length

    return (
        <div className="space-y-4">
            {/* Header with Toggle */}
            <div className="flex items-center justify-between pb-2 border-b border-[#E7E7E5]">
                <div className="flex items-center gap-3">
                    <h3 className="text-sm font-semibold text-[#37352F]">
                        Anschreiben
                    </h3>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                        {wordCount} Wörter
                    </span>
                </div>

                {/* X-Ray Toggle */}
                <button
                    onClick={onToggle}
                    disabled={!hasAnnotations}
                    className={cn(
                        "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                        hasAnnotations
                            ? xRayActive
                                ? "bg-indigo-100 text-indigo-700 hover:bg-indigo-200"
                                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                            : "bg-gray-50 text-gray-300 cursor-not-allowed"
                    )}
                    title={!hasAnnotations ? "Generiere mit X-Ray Mode für Annotations" : undefined}
                >
                    <Search size={14} />
                    X-Ray
                    {/* CSS Toggle indicator */}
                    <span className={cn(
                        "w-7 h-4 rounded-full relative transition-colors inline-block",
                        xRayActive && hasAnnotations ? "bg-indigo-500" : "bg-gray-300"
                    )}>
                        <span className={cn(
                            "absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform shadow-sm",
                            xRayActive && hasAnnotations ? "translate-x-3.5" : "translate-x-0.5"
                        )} />
                    </span>
                </button>
            </div>

            {/* Legend (only when X-Ray active) */}
            {xRayActive && hasAnnotations && (
                <div className="flex items-center gap-3 text-xs">
                    {Object.entries(SOURCE_CONFIG).map(([key, config]) => (
                        <div key={key} className="flex items-center gap-1.5">
                            <span className={cn("w-3 h-3 rounded-sm", config.bg, config.border, "border")} />
                            <span className="text-gray-500">{config.label}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Content */}
            <div className="bg-white rounded-lg border border-[#E7E7E5] p-6 shadow-sm">
                {xRayActive && hasAnnotations ? (
                    /* X-Ray Mode: Color-coded sentences */
                    <div className="text-sm text-[#37352F] leading-relaxed font-serif">
                        {annotations.map((sentence, idx) => {
                            const config = SOURCE_CONFIG[sentence.source] || SOURCE_CONFIG.job_fit
                            return (
                                <Popover key={idx} open={hoveredIdx === idx}>
                                    <PopoverTrigger asChild>
                                        <span
                                            className={cn(
                                                "px-0.5 py-0.5 rounded cursor-pointer transition-all inline",
                                                config.bg,
                                                hoveredIdx === idx && `${config.border} border ring-1 ring-offset-1`
                                            )}
                                            onMouseEnter={() => setHoveredIdx(idx)}
                                            onMouseLeave={() => setHoveredIdx(null)}
                                        >
                                            {sentence.text}{' '}
                                        </span>
                                    </PopoverTrigger>
                                    <PopoverContent
                                        side="top"
                                        className="w-64 p-3 text-xs"
                                        onMouseEnter={() => setHoveredIdx(idx)}
                                        onMouseLeave={() => setHoveredIdx(null)}
                                    >
                                        <div className="space-y-2">
                                            <Badge variant={config.badgeVariant} className="text-[10px]">
                                                {config.label}
                                            </Badge>
                                            <p className="text-gray-600 leading-relaxed">
                                                {sentence.reference}
                                            </p>
                                        </div>
                                    </PopoverContent>
                                </Popover>
                            )
                        })}
                    </div>
                ) : (
                    /* Plain-Text Mode (default) */
                    <div className="space-y-4 text-sm text-[#37352F] leading-relaxed font-serif">
                        {paragraphs.map((paragraph, idx) => (
                            <p key={idx} className="text-justify">
                                {paragraph}
                            </p>
                        ))}
                    </div>
                )}
            </div>

            {/* Dismiss button when X-Ray active */}
            {xRayActive && hasAnnotations && (
                <button
                    onClick={onToggle}
                    className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors mx-auto"
                >
                    <X size={12} /> X-Ray schliessen
                </button>
            )}
        </div>
    )
}
