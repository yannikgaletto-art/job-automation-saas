"use client"

import { Newspaper } from "lucide-react"

interface NewsFeedProps {
    news: string[]
}

export function NewsFeed({ news }: NewsFeedProps) {
    if (!news || news.length === 0) {
        return <p className="text-sm text-[#73726E] italic">No recent news found.</p>
    }

    return (
        <div className="space-y-3">
            <h3 className="text-sm font-semibold text-[#37352F] mb-3 flex items-center gap-2">
                <Newspaper className="w-4 h-4 text-[#73726E]" />
                Recent News
            </h3>
            <ul className="space-y-2">
                {news.map((item, idx) => (
                    <li
                        key={idx}
                        className="text-sm text-[#37352F] hover:bg-[#FAFAF9] p-2 rounded -ml-2 transition-colors border-l-2 border-transparent hover:border-[#E7E7E5]"
                    >
                        {item}
                    </li>
                ))}
            </ul>
        </div>
    )
}
