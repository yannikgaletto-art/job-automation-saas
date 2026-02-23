import type { QualityScores } from "@/components/cover-letter/types"

interface ScoreBadgesProps {
    scores: QualityScores
}

function ScoreCard({ label, score }: { label: string; score: number }) {
    const getColor = (score: number) => {
        if (score >= 8) return "text-green-600 bg-green-50 border-green-200"
        if (score >= 6) return "text-yellow-600 bg-yellow-50 border-yellow-200"
        return "text-red-600 bg-red-50 border-red-200"
    }

    return (
        <div className={`border rounded-lg p-2 flex items-center justify-between ${getColor(score)}`}>
            <div className="text-xs font-semibold mb-0 tracking-wide">{label}</div>
            <div className="text-sm font-bold">{score}<span className="text-[10px] font-normal">/10</span></div>
        </div>
    )
}

export function ScoreBadges({ scores }: ScoreBadgesProps) {
    return (
        <div className="space-y-4">
            <h4 className="text-sm font-semibold text-[#37352F]">Qualitätsbewertung</h4>
            <div className="flex flex-col gap-2">
                <ScoreCard label="Gesamt" score={scores.overall_score || 0} />
                <ScoreCard label="Natürlichkeit" score={scores.naturalness_score || 0} />
                <ScoreCard label="Stil" score={scores.style_match_score || 0} />
                <ScoreCard label="Relevanz" score={scores.company_relevance_score || 0} />
                <ScoreCard label="Individualität" score={scores.individuality_score || 0} />
            </div>
        </div>
    )
}
