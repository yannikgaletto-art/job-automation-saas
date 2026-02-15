"use client"

import { useState } from "react"
import type { QuoteSuggestion } from "@/lib/services/quote-matcher"
import { Quote, Check, PenTool, BarChart3 } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"

interface QuoteSelectorProps {
    quotes: QuoteSuggestion[]
    onQuoteSelect: (quote: QuoteSuggestion | null) => void
    selectedQuoteIndex?: number
}

export function QuoteSelector({
    quotes,
    onQuoteSelect,
    selectedQuoteIndex
}: QuoteSelectorProps) {
    const [customQuoteMode, setCustomQuoteMode] = useState(false)
    const [customQuoteText, setCustomQuoteText] = useState("")

    // Derived state for selection
    const selectedIndex = customQuoteMode ? -1 : selectedQuoteIndex

    const handleSelect = (index: number) => {
        setCustomQuoteMode(false)
        onQuoteSelect(quotes[index])
    }

    const handleCustomQuoteSubmit = () => {
        if (!customQuoteText.trim()) return

        // Create a temporary QuoteSuggestion object for the custom quote
        const customQuote: QuoteSuggestion = {
            quote: customQuoteText,
            author: "Custom",
            relevance_score: 1, // User defined, so high relevance
            value_connection: "User custom input",
            matched_value: "Custom",
            language: "en"
        }

        onQuoteSelect(customQuote)
    }

    const getScoreColor = (score: number) => {
        if (score >= 0.8) return "bg-green-100 text-green-700"
        if (score >= 0.5) return "bg-orange-100 text-orange-700"
        return "bg-gray-100 text-gray-700"
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-[#37352F] flex items-center gap-2">
                    <Quote className="w-4 h-4 text-[#73726E]" />
                    Select a Quote
                </h3>
                <button
                    onClick={() => {
                        setCustomQuoteMode(!customQuoteMode)
                        if (!customQuoteMode) {
                            onQuoteSelect(null) // Clear selection when entering custom mode initially
                        }
                    }}
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                >
                    <PenTool className="w-3 h-3" />
                    {customQuoteMode ? "Choose Suggestion" : "Write Custom"}
                </button>
            </div>

            <AnimatePresence mode="wait">
                {customQuoteMode ? (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="bg-white p-4 rounded-lg border border-[#E7E7E5] shadow-sm"
                    >
                        <label className="block text-xs font-medium text-[#73726E] mb-2">
                            Your Custom Quote
                        </label>
                        <textarea
                            className="w-full p-3 text-sm border border-[#E7E7E5] rounded focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                            rows={3}
                            placeholder="Type a quote that resonates with you..."
                            value={customQuoteText}
                            onChange={(e) => {
                                setCustomQuoteText(e.target.value)
                                // Update parent immediately if treating as controlled input, 
                                // or wait for blur/submit. For now, let's update on change for responsiveness
                                if (e.target.value.trim()) {
                                    const customQuote: QuoteSuggestion = {
                                        quote: e.target.value,
                                        author: "Custom",
                                        relevance_score: 1,
                                        value_connection: "User custom input",
                                        matched_value: "Custom",
                                        language: "en"
                                    }
                                    onQuoteSelect(customQuote)
                                } else {
                                    onQuoteSelect(null)
                                }
                            }}
                            maxLength={200}
                        />
                        <div className="flex justify-between items-center mt-2">
                            <span className="text-xs text-[#A8A29E]">{customQuoteText.length}/200</span>
                        </div>
                    </motion.div>
                ) : (
                    <motion.div className="space-y-3">
                        {quotes.map((suggestion, idx) => {
                            const isSelected = selectedIndex === idx
                            const score = suggestion.match_score || suggestion.relevance_score || 0

                            return (
                                <div
                                    key={idx}
                                    onClick={() => handleSelect(idx)}
                                    className={`
                                        relative p-4 rounded-lg border cursor-pointer transition-all duration-200
                                        ${isSelected
                                            ? "bg-blue-50 border-blue-200 shadow-sm"
                                            : "bg-white border-[#E7E7E5] hover:border-blue-200 hover:shadow-sm"
                                        }
                                    `}
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <div className={`text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${getScoreColor(score)}`}>
                                            <BarChart3 className="w-3 h-3" />
                                            {Math.round(score * 100)}% Match
                                        </div>
                                        {suggestion.matched_value && (
                                            <div className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full border border-blue-100">
                                                {suggestion.matched_value}
                                            </div>
                                        )}
                                        {isSelected && <Check className="w-4 h-4 text-blue-600 ml-auto" />}
                                    </div>

                                    <p className="text-sm text-[#37352F] italic mb-2">"{suggestion.quote}"</p>
                                    <p className="text-xs text-[#73726E] font-medium">— {suggestion.author} {suggestion.source ? `(${suggestion.source})` : ''}</p>

                                    {suggestion.value_connection && (
                                        <div className="mt-3 text-xs text-[#73726E] bg-[#FAFAF9] p-2 rounded border border-[#E7E7E5]">
                                            <span className="font-semibold text-[#37352F]">Why:</span> {suggestion.value_connection}
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                        {quotes.length === 0 && (
                            <div className="text-center p-6 bg-[#FAFAF9] rounded text-[#73726E] text-sm">
                                No quotes found yet. Research company to generate suggestions.
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
