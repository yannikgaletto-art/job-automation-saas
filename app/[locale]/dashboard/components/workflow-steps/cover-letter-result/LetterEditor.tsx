import { useState, useEffect } from "react"
import { Pencil, Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"

interface LetterEditorProps {
    letter: string
    onLetterChange: (newLetter: string) => void
    fixingParagraphIndex?: number | null
}

export function LetterEditor({ letter, onLetterChange, fixingParagraphIndex }: LetterEditorProps) {
    const t = useTranslations('cover_letter')
    const [paragraphs, setParagraphs] = useState<string[]>([])

    // Sync paragraphs when external letter changes (e.g., after targeted fix)
    useEffect(() => {
        setParagraphs(letter.split(/\n\n+/).filter(p => p.trim().length > 0))
    }, [letter])

    const handleBlur = (index: number, newText: string) => {
        const updated = [...paragraphs]
        updated[index] = newText.trim()
        setParagraphs(updated)
        onLetterChange(updated.join('\n\n'))
    }

    return (
        <div className="space-y-1.5">
            <p className="text-[10px] text-[#A8A29E] flex items-center gap-1 select-none">
                <Pencil className="w-2.5 h-2.5" />
                {t('editor_manual_hint')}
            </p>
            <div className="bg-white p-8 rounded-lg border border-[#E7E7E5] shadow-sm font-serif text-[11pt] leading-relaxed text-[#000] space-y-4">

            {paragraphs.map((p, idx) => (
                <div key={idx} className="relative group">
                    {fixingParagraphIndex === idx ? (
                        <div className="absolute inset-0 bg-white/50 z-10 flex items-center justify-center">
                            <Loader2 className="w-5 h-5 text-[#002e7a] animate-spin" />
                        </div>
                    ) : null}

                    <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                        <Pencil className="w-3 h-3 text-[#A8A29E]" />
                    </div>

                    <p
                        contentEditable
                        suppressContentEditableWarning
                        onBlur={(e) => handleBlur(idx, e.currentTarget.textContent || '')}
                        className="outline-none focus:outline-2 focus:outline-[#002e7a] focus:rounded p-1 -mx-1 transition-all"
                    >
                        {p}
                    </p>
                </div>
            ))}
            </div>
        </div>
    )
}
