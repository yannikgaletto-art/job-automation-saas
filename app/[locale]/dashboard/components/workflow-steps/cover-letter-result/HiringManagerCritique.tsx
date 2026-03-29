"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Shield, CheckCircle2, AlertCircle, Loader2, Sparkles } from "lucide-react"
import type { HiringManagerCritique as CritiqueType } from "@/types/cover-letter-setup"
import { useTranslations } from 'next-intl'

interface HiringManagerCritiqueProps {
    critique: CritiqueType | null
    isLoading: boolean
    isError: boolean
    critiqueResolved: boolean
    onApplyFix: (fixSuggestion: string) => void
    onCustomFix: (instruction: string) => void
    isFixing: boolean
}

export function HiringManagerCritique({
    critique,
    isLoading,
    isError,
    critiqueResolved,
    onApplyFix,
    onCustomFix,
    isFixing,
}: HiringManagerCritiqueProps) {
    const t = useTranslations('cover_letter');
    const [customInstruction, setCustomInstruction] = useState("")

    const handleCustomSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (customInstruction.trim()) {
            onCustomFix(customInstruction.trim())
            setCustomInstruction("")
        }
    }

    // Loading state
    if (isLoading) {
        return (
            <div className="border border-gray-200 rounded-lg p-4 space-y-3 animate-pulse">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-gray-200 rounded-full" />
                    <div className="space-y-1.5 flex-1">
                        <div className="h-3 bg-gray-200 rounded w-2/3" />
                        <div className="h-2.5 bg-gray-200 rounded w-1/2" />
                    </div>
                </div>
                <div className="space-y-1.5">
                    <div className="h-2.5 bg-gray-200 rounded w-full" />
                    <div className="h-2.5 bg-gray-200 rounded w-5/6" />
                    <div className="h-2.5 bg-gray-200 rounded w-3/4" />
                </div>
            </div>
        )
    }

    // Error / unavailable state
    if (isError || (!critique && !isLoading)) {
        return (
            <div className="space-y-3">
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 flex items-start gap-3">
                    <AlertCircle className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                    <div>
                        <h4 className="text-sm font-semibold text-[#73726E]">{t('critique_sim_title')}</h4>
                        <p className="text-xs text-[#9B9A97] mt-1">
                            {t('critique_unavailable')}
                        </p>
                    </div>
                </div>
                    <CustomInputForm
                        value={customInstruction}
                        onChange={setCustomInstruction}
                        onSubmit={handleCustomSubmit}
                        disabled={isFixing}
                        isFixing={isFixing}
                        placeholder={t('critique_custom_placeholder')}
                        btnLabel={t('critique_ai_fix')}
                    />
            </div>
        )
    }

    // Resolved state (critique was applied)
    if (critiqueResolved) {
        return (
            <AnimatePresence>
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="space-y-3"
                >
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex items-start gap-3">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                        <div>
                            <h4 className="text-sm font-semibold text-emerald-900">{t('critique_resolved_title')}</h4>
                            <p className="text-xs text-emerald-700 mt-1">
                                {t('critique_resolved_desc')}
                            </p>
                        </div>
                    </div>
                    <CustomInputForm
                        value={customInstruction}
                        onChange={setCustomInstruction}
                        onSubmit={handleCustomSubmit}
                        disabled={isFixing}
                        isFixing={isFixing}
                        placeholder={t('critique_custom_placeholder')}
                        btnLabel={t('critique_ai_fix')}
                    />
                </motion.div>
            </AnimatePresence>
        )
    }

    // Active critique state
    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4 }}
                className="space-y-3"
            >
                <div className="border border-amber-200 bg-amber-50/50 rounded-lg p-4 space-y-3">
                    {/* Persona Header */}
                    <div className="flex items-center gap-2.5">
                        <div className="bg-amber-100 p-2 rounded-full shrink-0">
                            <Shield className="w-4 h-4 text-amber-700" />
                        </div>
                        <div>
                            <h4 className="text-sm font-semibold text-[#37352F]">{critique!.persona}</h4>
                            <p className="text-[10px] text-[#9B9A97]">{critique!.role}</p>
                        </div>
                    </div>

                    {/* Critique blockquote — rendered with paragraph splits */}
                    <blockquote className="border-l-2 border-amber-300 pl-3 py-1 space-y-2">
                        {critique!.critique.split(/\n\n+/).map((para, i) => (
                            <p key={i} className="text-xs text-[#37352F] leading-relaxed italic">
                                {para.split(/(\*\*[^*]+\*\*)/).map((chunk, j) =>
                                    chunk.startsWith('**') && chunk.endsWith('**')
                                        ? <strong key={j} className="not-italic font-semibold">{chunk.slice(2, -2)}</strong>
                                        : chunk
                                )}
                            </p>
                        ))}
                    </blockquote>


                    {/* Action Button */}
                    <button
                        onClick={() => onApplyFix(critique!.fixSuggestion)}
                        disabled={isFixing}
                        className="w-full bg-[#002e7a] text-white px-3 py-2 rounded-md text-xs font-semibold hover:bg-[#001f5c] disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                    >
                        {isFixing ? (
                            <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('critique_fixing')}</>
                        ) : (
                            <><Sparkles className="w-3.5 h-3.5" /> {t('critique_apply_fix')}</>
                        )}
                    </button>
                </div>

                <CustomInputForm
                    value={customInstruction}
                    onChange={setCustomInstruction}
                    onSubmit={handleCustomSubmit}
                    disabled={isFixing}
                    isFixing={isFixing}
                    placeholder={t('critique_custom_placeholder')}
                    btnLabel={t('critique_ai_fix')}
                />
            </motion.div>
        </AnimatePresence>
    )
}

// ─── Reusable Custom Input Form ───────────────────────────────────
function CustomInputForm({
    value,
    onChange,
    onSubmit,
    disabled,
    isFixing,
    placeholder,
    btnLabel,
}: {
    value: string
    onChange: (v: string) => void
    onSubmit: (e: React.FormEvent) => void
    disabled: boolean
    isFixing: boolean
    placeholder: string
    btnLabel: string
}) {
    return (
        <form onSubmit={onSubmit} className="flex gap-2">
            <input
                type="text"
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder={placeholder}
                className="flex-1 border border-gray-200 rounded-md px-3 py-1.5 text-xs bg-white focus:outline-none focus:border-[#002e7a] transition-colors"
                disabled={disabled}
            />
            <button
                type="submit"
                disabled={!value.trim() || disabled}
                className="bg-gray-100 text-[#37352F] px-3 py-1.5 rounded-md text-xs font-semibold hover:bg-gray-200 disabled:opacity-50 transition-colors flex items-center gap-1 shrink-0"
            >
                {isFixing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                {btnLabel}
            </button>
        </form>
    )
}
