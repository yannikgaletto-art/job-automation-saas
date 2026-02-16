'use client'

interface CVDiffViewerProps {
    original: string
    improved: string
    showDiff?: boolean
}

export function CVDiffViewer({
    original,
    improved,
    showDiff = true
}: CVDiffViewerProps) {

    if (!showDiff) {
        return (
            <div className="prose prose-sm text-[#37352F] max-w-none">
                <pre className="whitespace-pre-wrap font-sans">
                    {improved}
                </pre>
            </div>
        )
    }

    // Simple diff highlighting (MVP approach)
    // Highlights words in 'improved' that are not in 'original'
    const highlightDiff = (original: string, improved: string) => {
        // Normalize and split
        const normalize = (s: string) => s.replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "").toLowerCase()
        const originalSet = new Set(original.split(/\s+/).map(normalize))
        const improvedWords = improved.split(/(\s+)/) // Split but keep delimiters

        return improvedWords.map((word, idx) => {
            // Skip whitespace
            if (word.trim() === '') return word;

            const normalizedWord = normalize(word);
            const isNew = !originalSet.has(normalizedWord) && normalizedWord.length > 2; // Filter generic short words

            return isNew ? (
                <span
                    key={idx}
                    className="bg-green-100 text-green-800 rounded px-0.5"
                >
                    {word}
                </span>
            ) : (
                <span key={idx}>{word}</span>
            )
        })
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Original */}
            <div className="border border-[#E7E7E5] rounded-lg p-4 bg-[#FAFAF9]">
                <p className="text-xs text-[#73726E] mb-2 font-medium">Original</p>
                <div className="prose prose-sm text-[#37352F] max-w-none overflow-x-auto">
                    <pre className="whitespace-pre-wrap font-sans text-sm">
                        {original}
                    </pre>
                </div>
            </div>

            {/* Improved */}
            <div className="border-2 border-green-500 rounded-lg p-4 bg-green-50">
                <p className="text-xs text-green-700 mb-2 font-medium">✨ Improved</p>
                <div className="prose prose-sm text-[#37352F] max-w-none overflow-x-auto">
                    <div className="font-sans text-sm whitespace-pre-wrap">
                        {highlightDiff(original, improved)}
                    </div>
                </div>
            </div>
        </div>
    )
}
