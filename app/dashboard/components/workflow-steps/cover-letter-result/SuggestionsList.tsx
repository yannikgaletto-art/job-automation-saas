import { useState } from "react"
import { CheckCircle2, AlertCircle, Loader2, Sparkles } from "lucide-react"

interface SuggestionsListProps {
    weaknesses: string[]
    onFix: (weakness: string) => void
    onCustomFix: (instruction: string) => void
    fixingWeakness?: string | null
}

export function SuggestionsList({ weaknesses, onFix, onCustomFix, fixingWeakness }: SuggestionsListProps) {
    const [customInstruction, setCustomInstruction] = useState("")

    const handleCustomSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (customInstruction.trim()) {
            onCustomFix(customInstruction.trim())
            setCustomInstruction("")
        }
    }

    const CustomInputForm = () => (
        <form onSubmit={handleCustomSubmit} className="mt-4 pt-3 border-t border-yellow-200/50 flex gap-2">
            <input
                type="text"
                value={customInstruction}
                onChange={e => setCustomInstruction(e.target.value)}
                placeholder="Eigene Anweisung an KI (z.B. 'Absatz 2 kürzen')"
                className="flex-1 border border-yellow-200 rounded-md px-3 py-1.5 text-xs bg-white focus:outline-none focus:border-yellow-400"
                disabled={!!fixingWeakness}
            />
            <button
                type="submit"
                disabled={!customInstruction.trim() || !!fixingWeakness}
                className="bg-yellow-100 text-yellow-800 px-3 py-1.5 rounded-md text-xs font-semibold hover:bg-yellow-200 disabled:opacity-50 transition-colors flex items-center gap-1"
            >
                {fixingWeakness === customInstruction ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                Überarbeiten
            </button>
        </form>
    )

    if (!weaknesses || weaknesses.length === 0) {
        return (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                <div>
                    <h4 className="text-sm font-semibold text-green-900">Exzellente Qualität</h4>
                    <p className="text-xs text-green-700 mt-1 mb-3">Keine Verbesserungsvorschläge — das Anschreiben ist startklar.</p>
                    <CustomInputForm />
                </div>
            </div>
        )
    }

    return (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
                <AlertCircle className="w-4 h-4 text-yellow-600" />
                <h4 className="text-sm font-semibold text-yellow-900">Verbesserungsvorschläge</h4>
            </div>
            <ul className="space-y-3">
                {weaknesses.map((weakness, i) => (
                    <li key={i} className="text-sm text-yellow-800 flex flex-col gap-1">
                        <div className="flex items-start gap-2">
                            <span className="text-yellow-600 shrink-0 mt-0.5">•</span>
                            <span>{weakness}</span>
                        </div>
                        <div className="pl-4">
                            <button
                                onClick={() => onFix(weakness)}
                                disabled={!!fixingWeakness}
                                className="text-xs text-[#002e7a] hover:underline cursor-pointer flex items-center gap-1 disabled:opacity-50"
                            >
                                {fixingWeakness === weakness ? (
                                    <><Loader2 className="w-3 h-3 animate-spin" /> Korrigiere...</>
                                ) : (
                                    <>✏️ Fix</>
                                )}
                            </button>
                        </div>
                    </li>
                ))}
            </ul>
            <CustomInputForm />
        </div>
    )
}
