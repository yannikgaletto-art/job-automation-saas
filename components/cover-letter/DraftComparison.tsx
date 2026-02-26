"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { GitCompare, FileText, Check, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────
interface DraftPreview {
    id: string
    job_id: string | null
    created_at: string
    quality_scores: { overall_score: number } | null
    fluff_warning: boolean
    preview: string | null
}

interface DraftFull {
    id: string
    generated_content: string | null
    quality_scores: { overall_score: number } | null
}

interface DraftComparisonProps {
    drafts: DraftPreview[]
    onSelectDraft: (draftId: string, content: string) => void
}

// ─── Simple line diff (adapted from DiffReview.tsx pattern) ───────────────────
function computeDiff(textA: string, textB: string): Array<{
    type: 'unchanged' | 'removed' | 'added'
    text: string
}> {
    const linesA = textA.split('\n')
    const linesB = textB.split('\n')
    const result: Array<{ type: 'unchanged' | 'removed' | 'added'; text: string }> = []

    const maxLen = Math.max(linesA.length, linesB.length)
    for (let i = 0; i < maxLen; i++) {
        const a = linesA[i]
        const b = linesB[i]
        if (a === b) {
            result.push({ type: 'unchanged', text: a || '' })
        } else {
            if (a !== undefined) result.push({ type: 'removed', text: a })
            if (b !== undefined) result.push({ type: 'added', text: b })
        }
    }
    return result
}

// ─── Component ────────────────────────────────────────────────────────────────
export function DraftComparison({ drafts, onSelectDraft }: DraftComparisonProps) {
    const [selectedA, setSelectedA] = useState<string | null>(null)
    const [selectedB, setSelectedB] = useState<string | null>(null)
    const [fullA, setFullA] = useState<DraftFull | null>(null)
    const [fullB, setFullB] = useState<DraftFull | null>(null)
    const [loading, setLoading] = useState(false)

    const canCompare = drafts.length >= 2

    const fetchDraft = async (draftId: string): Promise<DraftFull | null> => {
        try {
            const res = await fetch(`/api/cover-letter/drafts/${draftId}`)
            if (!res.ok) return null
            const data = await res.json()
            return data.draft ?? null
        } catch {
            return null
        }
    }

    const handleSelectDraft = async (draftId: string, slot: 'A' | 'B') => {
        setLoading(true)
        const full = await fetchDraft(draftId)
        if (slot === 'A') {
            setSelectedA(draftId)
            setFullA(full)
        } else {
            setSelectedB(draftId)
            setFullB(full)
        }
        setLoading(false)
    }

    const formatDate = (iso: string) => {
        const d = new Date(iso)
        return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    }

    const diff = fullA?.generated_content && fullB?.generated_content
        ? computeDiff(fullA.generated_content, fullB.generated_content)
        : null

    return (
        <div className="w-full max-w-4xl mx-auto flex flex-col bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50/50">
                <div className="flex items-center gap-2">
                    <GitCompare className="w-4 h-4 text-gray-500" />
                    <h2 className="text-lg font-semibold text-gray-900">Draft-Vergleich</h2>
                </div>
                {!canCompare && (
                    <span className="text-xs text-gray-400">Mindestens 2 Drafts nötig</span>
                )}
            </div>

            {canCompare && (
                <>
                    {/* Draft Selectors */}
                    <div className="grid grid-cols-2 gap-4 p-4 border-b border-gray-100">
                        {(['A', 'B'] as const).map(slot => (
                            <div key={slot} className="space-y-2">
                                <span className="text-xs font-medium text-gray-500">
                                    Draft {slot}
                                </span>
                                <div className="space-y-1.5 max-h-32 overflow-y-auto">
                                    {drafts.map(draft => {
                                        const isSelected = slot === 'A' ? selectedA === draft.id : selectedB === draft.id
                                        const isOther = slot === 'A' ? selectedB === draft.id : selectedA === draft.id
                                        return (
                                            <button
                                                key={draft.id}
                                                onClick={() => !isOther && handleSelectDraft(draft.id, slot)}
                                                disabled={isOther}
                                                className={cn(
                                                    "w-full text-left px-3 py-2 rounded-md text-xs transition-all",
                                                    isSelected
                                                        ? "bg-blue-50 border border-blue-200 text-blue-700"
                                                        : isOther
                                                            ? "opacity-30 cursor-not-allowed bg-gray-50"
                                                            : "border border-gray-100 hover:bg-gray-50"
                                                )}
                                            >
                                                <div className="flex justify-between">
                                                    <span>{formatDate(draft.created_at)}</span>
                                                    {draft.quality_scores && (
                                                        <span className="text-gray-400">
                                                            Score: {draft.quality_scores.overall_score}/10
                                                        </span>
                                                    )}
                                                </div>
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Diff View */}
                    <div className="flex-1 overflow-y-auto p-6 bg-gray-50 max-h-[55vh]">
                        {loading && (
                            <div className="flex items-center gap-2 text-xs text-gray-400 py-8 justify-center">
                                <Loader2 className="w-4 h-4 animate-spin" /> Lade Draft...
                            </div>
                        )}

                        {!loading && diff && (
                            <div className="space-y-1 font-mono text-xs">
                                {diff.map((line, idx) => (
                                    <motion.div
                                        key={idx}
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        className={cn(
                                            "px-3 py-1 rounded",
                                            line.type === 'removed' && "bg-red-50 text-red-800 border-l-2 border-red-300",
                                            line.type === 'added' && "bg-green-50 text-green-800 border-l-2 border-green-300",
                                            line.type === 'unchanged' && "text-gray-600"
                                        )}
                                    >
                                        <span className="select-none text-gray-300 mr-2">
                                            {line.type === 'removed' ? '−' : line.type === 'added' ? '+' : ' '}
                                        </span>
                                        {line.text || '\u00a0'}
                                    </motion.div>
                                ))}
                            </div>
                        )}

                        {!loading && !diff && selectedA && selectedB && (
                            <p className="text-xs text-gray-400 text-center py-8">
                                Kein Inhalt zum Vergleichen verfügbar
                            </p>
                        )}

                        {!loading && (!selectedA || !selectedB) && (
                            <div className="flex flex-col items-center gap-2 py-8 text-gray-300">
                                <FileText className="w-8 h-8" />
                                <span className="text-xs">Wähle zwei Drafts zum Vergleichen</span>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    {fullB?.generated_content && (
                        <div className="px-6 py-3 border-t border-gray-200 bg-white flex justify-end">
                            <button
                                onClick={() => onSelectDraft(fullB!.id, fullB!.generated_content!)}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg shadow-sm transition-all flex items-center gap-2"
                            >
                                <Check className="w-3.5 h-3.5" /> Draft B verwenden
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    )
}
