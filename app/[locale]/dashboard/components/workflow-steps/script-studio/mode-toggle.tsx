"use client";

import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';

interface ModeToggleProps {
    mode: 'teleprompter' | 'bullets';
    onChange: (mode: 'teleprompter' | 'bullets') => void;
}

export function ModeToggle({ mode, onChange }: ModeToggleProps) {
    const t = useTranslations('video_letter');
    return (
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 w-fit">
            {(['bullets', 'teleprompter'] as const).map((m) => (
                <button
                    key={m}
                    onClick={() => onChange(m)}
                    className={`relative px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                        mode === m ? 'text-white' : 'text-gray-600 hover:text-gray-900'
                    }`}
                >
                    {mode === m && (
                        <motion.div
                            layoutId="mode-indicator"
                            className="absolute inset-0 bg-[#012e7a] rounded-md"
                            transition={{ type: 'spring', bounce: 0.15, duration: 0.4 }}
                        />
                    )}
                    <span className="relative z-10">
                        {m === 'bullets' ? t('mode_bullets') : t('mode_teleprompter')}
                    </span>
                </button>
            ))}
        </div>
    );
}
