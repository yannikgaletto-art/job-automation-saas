'use client';

import { motion } from 'framer-motion';

interface CVStationCardProps {
    company: string;
    role: string;
    period: string;
    selectedIndex: number | null;
    isDisabled: boolean;
    onToggle: () => void;
    hint?: string;  // Server-generated hint from CV Match analysis
}

export function CVStationCard({
    company,
    role,
    period,
    selectedIndex,
    isDisabled,
    onToggle,
    hint,
}: CVStationCardProps) {
    const isSelected = selectedIndex !== null;

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

                    {/* CV Match hint — clean, one-liner */}
                    {hint && (
                        <p className="text-[11px] text-[#002e7a] mt-1.5 line-clamp-2">{hint}</p>
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
