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
}

export function CVStationCard({
    company,
    role,
    period,
    bullets,
    selectedIndex,
    isDisabled,
    onToggle,
}: CVStationCardProps) {
    const isSelected = selectedIndex !== null;

    return (
        <motion.div
            whileHover={!isDisabled ? { scale: 1.01 } : {}}
            whileTap={!isDisabled ? { scale: 0.99 } : {}}
            onClick={!isDisabled ? onToggle : undefined}
            className={[
                'rounded-md px-3 py-2.5 transition-all select-none',
                isDisabled && !isSelected ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
                isSelected
                    ? 'border-2 border-[#002e7a] bg-[#f0f4ff]'
                    : 'bg-white border border-[#E7E7E5]',
            ].join(' ')}
        >
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-semibold text-[#37352F]">{role}</span>
                        <span className="text-[10px] text-[#73726E]">@</span>
                        <span className="text-xs font-medium text-[#73726E]">{company}</span>
                    </div>
                    <p className="text-[10px] text-[#A8A29E] mt-0.5">{period}</p>
                    {bullets && bullets.length > 0 && bullets[0] && (
                        <p className="text-[11px] text-[#73726E] mt-1.5 line-clamp-2">· {bullets[0]}</p>
                    )}
                </div>

                {/* Selection Badge */}
                {isSelected && (
                    <div className="shrink-0 w-5 h-5 rounded-full bg-[#002e7a] text-white text-[10px] font-bold flex items-center justify-center">
                        {selectedIndex}
                    </div>
                )}
            </div>
        </motion.div>
    );
}
