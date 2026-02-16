"use client"

import { useState } from "react"
import { Eye, EyeOff } from "lucide-react"

interface CoverLetterPreviewProps {
    coverLetter: string
    showFormatted?: boolean
}

export function CoverLetterPreview({
    coverLetter,
    showFormatted = true
}: CoverLetterPreviewProps) {
    const [isFormatted, setIsFormatted] = useState(showFormatted)

    // Word count
    const wordCount = coverLetter.trim().split(/\s+/).length

    // Split into paragraphs (assumes paragraphs separated by double newline)
    const paragraphs = coverLetter.split(/\n\n/).filter(p => p.trim())

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between pb-2 border-b border-[#E7E7E5]">
                <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-[#37352F]">
                        📄 Generated Cover Letter
                    </h3>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                        {wordCount} words
                    </span>
                </div>
                <button
                    onClick={() => setIsFormatted(!isFormatted)}
                    className="text-xs text-[#73726E] hover:text-[#37352F] flex items-center gap-1"
                >
                    {isFormatted ? (
                        <><Eye size={14} /> Formatted</>
                    ) : (
                        <><EyeOff size={14} /> Raw Text</>
                    )}
                </button>
            </div>

            {/* Content */}
            <div className="bg-white rounded-lg border border-[#E7E7E5] p-6 shadow-sm">
                {isFormatted ? (
                    <div className="space-y-4 text-sm text-[#37352F] leading-relaxed font-serif">
                        {paragraphs.map((paragraph, idx) => (
                            <p key={idx} className="text-justify">
                                {paragraph}
                            </p>
                        ))}
                    </div>
                ) : (
                    <pre className="text-xs text-[#73726E] whitespace-pre-wrap font-mono overflow-x-auto">
                        {coverLetter}
                    </pre>
                )}
            </div>
        </div>
    )
}