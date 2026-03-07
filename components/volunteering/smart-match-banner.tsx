'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import type { VolunteeringOpportunity } from '@/types/volunteering';

interface SmartMatchBannerProps {
    suggestions: VolunteeringOpportunity[];
    matchedCategories: string[];
}

const CATEGORY_LABELS: Record<string, string> = {
    social: 'Soziales',
    environment: 'Umwelt',
    education: 'Bildung',
    health: 'Gesundheit',
    culture: 'Kultur',
};

export function SmartMatchBanner({ suggestions, matchedCategories }: SmartMatchBannerProps) {
    const [dismissed, setDismissed] = useState(false);

    if (dismissed || suggestions.length === 0) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.3 }}
                className="rounded-xl border border-[#E7E7E5] bg-gradient-to-r from-blue-50/60 to-indigo-50/60 p-5 relative"
            >
                {/* Dismiss */}
                <button
                    onClick={() => setDismissed(true)}
                    className="absolute top-3 right-3 p-1 rounded-lg hover:bg-white/60 transition-colors text-[#A9A9A6] hover:text-[#73726E]"
                    aria-label="Schließen"
                >
                    <X className="w-4 h-4" />
                </button>

                {/* Header */}
                <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="w-4.5 h-4.5 text-[#012e7a]" />
                    <h3 className="text-sm font-semibold text-[#37352F]">
                        Basierend auf deinem Lebenslauf
                    </h3>
                </div>

                <p className="text-sm text-[#73726E] mb-3">
                    Deine Skills passen besonders gut zu:{' '}
                    {matchedCategories.map(c => CATEGORY_LABELS[c] ?? c).join(', ')}
                </p>

                {/* Suggestions (max 3) */}
                <div className="space-y-2">
                    {suggestions.slice(0, 3).map((s) => (
                        <a
                            key={s.id}
                            href={s.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-between px-3.5 py-2.5 rounded-lg bg-white/70 border border-[#E7E7E5] hover:border-[#012e7a]/30 hover:bg-white transition-all group"
                        >
                            <div className="min-w-0">
                                <p className="text-sm font-medium text-[#37352F] truncate group-hover:text-[#012e7a] transition-colors">
                                    {s.title}
                                </p>
                                <p className="text-xs text-[#A9A9A6]">{s.organization}</p>
                            </div>
                            <ArrowRight className="w-4 h-4 text-[#A9A9A6] group-hover:text-[#012e7a] flex-shrink-0 ml-2 transition-colors" />
                        </a>
                    ))}
                </div>
            </motion.div>
        </AnimatePresence>
    );
}
