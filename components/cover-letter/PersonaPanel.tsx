"use client"

import { useState, useEffect } from "react"
import { Users, RefreshCw, AlertCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type { HiringPersona } from "@/lib/services/hiring-manager-resolver"
import { cn } from "@/lib/utils"

// ─── Props ────────────────────────────────────────────────────────────────────
interface PersonaPanelProps {
    jobDescription: string
    companyName: string
    contactPerson?: string
    selectedPersona?: HiringPersona
    onPersonaSelect: (persona: HiringPersona) => void
    onRegenerate: (persona: HiringPersona) => void
}

export function PersonaPanel({
    jobDescription,
    companyName,
    contactPerson,
    selectedPersona,
    onPersonaSelect,
    onRegenerate,
}: PersonaPanelProps) {
    const [personas, setPersonas] = useState<HiringPersona[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const fetchPersonas = async () => {
        setLoading(true)
        setError(null)
        try {
            const res = await fetch('/api/cover-letter/resolve-personas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jobDescription, companyName, contactPerson }),
            })

            if (!res.ok) {
                throw new Error(res.status === 400 ? 'Fehlende Eingabedaten' : `Fehler ${res.status}`)
            }

            const data = await res.json()
            setPersonas(data.personas || [])
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Unbekannter Fehler'
            setError(msg)
            console.error('[PersonaPanel] Fetch failed:', msg)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        if (jobDescription && companyName) {
            fetchPersonas()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [jobDescription, companyName])

    const STYLE_LABELS: Record<string, string> = {
        'storytelling': 'Narrativ',
        'data-driven': 'Datengetrieben',
        'formal': 'Klassisch',
    }

    return (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-gray-500" />
                    <h3 className="text-sm font-semibold text-gray-900">Recruiter Simulation</h3>
                </div>
                <button
                    onClick={fetchPersonas}
                    disabled={loading}
                    className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                    title="Personas neu laden"
                >
                    <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
                </button>
            </div>

            {/* Content */}
            <div className="p-4 space-y-3">
                {loading && (
                    <div className="flex items-center gap-2 text-xs text-gray-400 py-4 justify-center">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Personas werden geladen...
                    </div>
                )}

                {error && !loading && (
                    <div className="flex items-center gap-2 text-xs text-red-500 py-2">
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>{error}</span>
                        <button
                            onClick={fetchPersonas}
                            className="ml-auto text-blue-500 hover:text-blue-700 underline"
                        >
                            Erneut versuchen
                        </button>
                    </div>
                )}

                {!loading && !error && personas.map((persona, idx) => {
                    const isSelected = selectedPersona?.name === persona.name
                    const isDisabled = persona.confidence < 0.4 && persona.confidence > 0

                    return (
                        <button
                            key={idx}
                            onClick={() => !isDisabled && onPersonaSelect(persona)}
                            disabled={isDisabled}
                            className={cn(
                                "w-full text-left p-3 rounded-lg border transition-all",
                                isSelected
                                    ? "border-blue-300 bg-blue-50/50 ring-1 ring-blue-200"
                                    : isDisabled
                                        ? "border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed"
                                        : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                            )}
                        >
                            <div className="flex items-start justify-between mb-1.5">
                                <div>
                                    <span className="text-sm font-medium text-gray-900">
                                        {persona.name}
                                    </span>
                                    {persona.role && (
                                        <span className="text-xs text-gray-400 ml-2">
                                            {persona.role}
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-1.5">
                                    {isDisabled && (
                                        <Badge variant="outline" className="text-[10px] text-gray-400">
                                            Unsicher
                                        </Badge>
                                    )}
                                    {isSelected && (
                                        <span className="w-2 h-2 rounded-full bg-blue-500" />
                                    )}
                                </div>
                            </div>

                            {persona.traits.length > 0 && (
                                <div className="flex flex-wrap gap-1 mb-1.5">
                                    {persona.traits.slice(0, 3).map((trait, tIdx) => (
                                        <span
                                            key={tIdx}
                                            className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500"
                                        >
                                            {trait}
                                        </span>
                                    ))}
                                </div>
                            )}

                            <div className="flex items-center justify-between">
                                <span className="text-[10px] text-gray-400">
                                    Stil: {STYLE_LABELS[persona.preferredStyle] || persona.preferredStyle}
                                </span>
                                {persona.confidence > 0 && (
                                    <span className="text-[10px] text-gray-300">
                                        {Math.round(persona.confidence * 100)}% Konfidenz
                                    </span>
                                )}
                            </div>
                        </button>
                    )
                })}

                {/* No persona default */}
                {!loading && !error && personas.length > 0 && (
                    <button
                        onClick={() => onPersonaSelect({ name: 'Unbekannt', role: '', traits: [], preferredStyle: 'formal', confidence: 0 })}
                        className={cn(
                            "w-full text-left p-2.5 rounded-lg border text-xs transition-all",
                            !selectedPersona || selectedPersona.name === 'Unbekannt'
                                ? "border-gray-300 bg-gray-50"
                                : "border-gray-100 text-gray-400 hover:border-gray-200"
                        )}
                    >
                        Kein Persona-Kontext
                    </button>
                )}
            </div>

            {/* Regenerate CTA */}
            {selectedPersona && selectedPersona.confidence > 0 && (
                <div className="px-4 py-3 border-t border-gray-100">
                    <button
                        onClick={() => onRegenerate(selectedPersona)}
                        className="w-full py-2 text-xs font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                        Neu generieren mit Persona →
                    </button>
                </div>
            )}
        </div>
    )
}
