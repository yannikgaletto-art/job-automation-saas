'use client';

import { motion } from 'framer-motion';

interface CVStationCardProps {
    company: string;
    role: string;
    period: string;
    bullets: string[];
    selectedIndex: number | null;  // 1-3 wenn ausgewählt, null wenn nicht
    isDisabled: boolean;
    onToggle: () => void;
    recommendation?: { requirement: string; reasoning: string };
}

export function CVStationCard({
    company,
    role,
    period,
    bullets,
    selectedIndex,
    isDisabled,
    onToggle,
    recommendation,
}: CVStationCardProps) {
    const isSelected = selectedIndex !== null;

    // Truncate requirement for the badge display (~60 chars)
    const shortRequirement = recommendation?.requirement
        ? recommendation.requirement.length > 60
            ? recommendation.requirement.slice(0, 57) + '...'
            : recommendation.requirement
        : null;

    return (
        <motion.div
            whileHover={!isDisabled ? { scale: 1.01 } : {}}
            whileTap={!isDisabled ? { scale: 0.99 } : {}}
            onClick={!isDisabled ? onToggle : undefined}
            className={[
                'rounded-md px-4 py-3.5 transition-all select-none',
                isDisabled && !isSelected ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
                isSelected
                    ? 'border-2 border-[#002e7a] bg-[#f0f4ff]'
                    : 'bg-white border border-[#E7E7E5]',
            ].join(' ')}
        >
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[13px] font-semibold text-[#37352F]">{role}</span>
                        <span className="text-[11px] text-[#73726E]">@</span>
                        <span className="text-[13px] font-medium text-[#73726E]">{company}</span>
                    </div>
                    <p className="text-[11px] text-[#A8A29E] mt-0.5">{period}</p>
                    {bullets && bullets.length > 0 && bullets[0] && (
                        <p className="text-[12px] text-[#73726E] mt-2 line-clamp-2">· {bullets[0]}</p>
                    )}

                    {/* Match Badge — nur wenn Recommendation vorhanden */}
                    {recommendation && shortRequirement && (
                        <div className="mt-2.5 bg-[#EEF3FF] border border-[#D0DEFF] rounded-md px-3 py-2">
                            <p className="text-[11px] font-semibold text-[#002e7a] leading-tight">
                                🎯 Match: {shortRequirement}
                            </p>
                            <p className="text-[11px] text-[#73726E] leading-snug mt-0.5">
                                {recommendation.reasoning}
                            </p>
                        </div>
                    )}
                </div>

                {/* Selection Badge */}
                {isSelected && (
                    <div className="shrink-0 w-6 h-6 rounded-full bg-[#002e7a] text-white text-[11px] font-bold flex items-center justify-center">
                        {selectedIndex}
                    </div>
                )}
            </div>
        </motion.div>
    );
}
