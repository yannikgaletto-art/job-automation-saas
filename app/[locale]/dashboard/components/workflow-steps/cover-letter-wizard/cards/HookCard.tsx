'use client';

import { motion } from 'framer-motion';
import { ExternalLink } from 'lucide-react';
import type { SelectedHook, HookType } from '@/types/cover-letter-setup';

interface HookCardProps {
    hook: SelectedHook;
    isSelected: boolean;
    onSelect: () => void;
}

const typeLabel: Record<HookType, string> = {
    news: '📰 News',
    value: '💡 Wert',
    quote: '💬 Zitat',
    linkedin: '💼 LinkedIn',
    manual: '✏️ Eigener',
    vision: '🎯 Vision',
    project: '🚀 Projekt',
    funding: '💰 Wachstum & Funding',
};

export function HookCard({ hook, isSelected, onSelect }: HookCardProps) {
    const isManual = hook.type === 'manual';

    return (
        <motion.div
            whileHover={{ scale: 1.01, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
            whileTap={{ scale: 0.99 }}
            onClick={onSelect}
            className={[
                'cursor-pointer rounded-lg p-3 transition-all select-none',
                isSelected
                    ? 'border-2 border-[#002e7a] bg-[#f0f4ff]'
                    : 'bg-white border border-[#E7E7E5] shadow-sm hover:shadow-md',
            ].join(' ')}
        >
            {/* Type Badge */}
            <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-semibold text-[#73726E]">{typeLabel[hook.type]}</span>
                {hook.relevanceScore > 0 && (
                    <span className="text-[10px] text-[#A8A29E]">{Math.round(hook.relevanceScore * 100)}% Match</span>
                )}
            </div>

            {/* Content */}
            {isManual ? (
                <input
                    type="text"
                    placeholder="Eigenen Aufhänger eingeben..."
                    className="w-full text-xs text-[#37352F] bg-transparent outline-none placeholder-[#A8A29E]"
                    onClick={(e) => e.stopPropagation()}
                />
            ) : (
                <p className="text-xs text-[#37352F] leading-relaxed line-clamp-3">{hook.content}</p>
            )}

            {/* Source */}
            {hook.sourceUrl && (
                <div className="flex items-center gap-1 mt-2">
                    <ExternalLink className="w-3 h-3 text-[#A8A29E] shrink-0" />
                    <a
                        href={hook.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-[#A8A29E] hover:text-[#002e7a] hover:underline truncate"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {hook.sourceName || hook.sourceUrl}
                    </a>
                    {hook.sourceAge && (
                        <span className="text-[10px] text-[#A8A29E] shrink-0">· {hook.sourceAge}</span>
                    )}
                </div>
            )}
        </motion.div>
    );
}
