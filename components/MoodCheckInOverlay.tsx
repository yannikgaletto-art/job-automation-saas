'use client';

/**
 * MoodCheckInOverlay — V2
 *
 * Changes from V1:
 * - Removed textarea (note field)
 * - Dynamic day/night symbols via useMoodSymbol
 * - All strings use i18n (useTranslations('mood'))
 * - onSkip prop for progressive reduction
 * - onSubmit prop delegates to hook (no direct API call here)
 * - Loading state with checkin_submitting text
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useTimeOfDay, getSymbolsForTime } from '@/lib/mood/mood-symbols';

interface MoodCheckInOverlayProps {
    visible: boolean;
    onDismiss: () => void;
    onSkip: () => Promise<{ hidden: boolean }>;
    onSubmit: (score: number) => Promise<void>;
}

export function MoodCheckInOverlay({ visible, onDismiss, onSkip, onSubmit }: MoodCheckInOverlayProps) {
    const [selectedMood, setSelectedMood] = useState<number | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const t = useTranslations('mood');
    const timeOfDay = useTimeOfDay();
    const symbols = getSymbolsForTime(timeOfDay);

    const moodOptions = [1, 2, 3, 4, 5].map((value) => ({
        value,
        label: t(`mood_${value}` as `mood_1` | `mood_2` | `mood_3` | `mood_4` | `mood_5`),
        icon: symbols[value - 1],
    }));

    const handleSubmit = async () => {
        if (!selectedMood) return;
        setSubmitting(true);
        try {
            await onSubmit(selectedMood);
        } finally {
            setSubmitting(false);
            setSelectedMood(null);
        }
    };

    const handleSkip = async () => {
        await onSkip();
        // Toast for "auto_hidden" is handled by the parent when hidden = true
    };

    return (
        <AnimatePresence>
            {visible && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, y: -40 }}
                    transition={{ duration: 0.35, ease: 'easeOut' }}
                    className="fixed inset-0 z-50 flex items-center justify-center p-4"
                    style={{ backdropFilter: 'blur(14px)', background: 'rgba(255,255,255,0.82)' }}
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 16 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        transition={{ delay: 0.1, duration: 0.35 }}
                        className="max-w-[460px] w-full bg-white rounded-2xl shadow-2xl p-8 text-center"
                    >
                        {/* Header */}
                        <p className="text-xs text-[#94a3b8] mb-1 tracking-wide uppercase">
                            {t('checkin_label')}
                        </p>
                        <h2 className="text-xl font-semibold text-[#0f172a] mb-5">
                            {t('checkin_question')}
                        </h2>

                        {/* Mood selector */}
                        <div className="flex gap-3 justify-center mb-6">
                            {moodOptions.map((opt) => (
                                <motion.button
                                    key={opt.value}
                                    whileHover={{ scale: 1.12 }}
                                    whileTap={{ scale: 0.92 }}
                                    onClick={() => setSelectedMood(opt.value)}
                                    className="flex flex-col items-center gap-1 bg-transparent border-none cursor-pointer transition-all"
                                    style={{
                                        opacity: selectedMood === null || selectedMood === opt.value ? 1 : 0.3,
                                    }}
                                    title={opt.label}
                                >
                                    <span
                                        className="text-3xl transition-transform"
                                        style={{
                                            transform: selectedMood === opt.value ? 'scale(1.35)' : 'scale(1)',
                                        }}
                                    >
                                        {opt.icon}
                                    </span>
                                    <span className="text-[10px] text-[#94a3b8]">{opt.label}</span>
                                </motion.button>
                            ))}
                        </div>

                        {/* Submit */}
                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={handleSubmit}
                            disabled={!selectedMood || submitting}
                            className="w-full py-3 bg-[#002e7a] text-white border-none rounded-xl text-sm font-semibold cursor-pointer tracking-tight hover:bg-[#001d4f] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            {submitting ? t('checkin_submitting') : t('checkin_cta')}
                        </motion.button>

                        {/* Skip link */}
                        <button
                            onClick={handleSkip}
                            className="mt-3 text-xs text-[#94a3b8] hover:text-[#64748b] bg-transparent border-none cursor-pointer transition-colors"
                        >
                            {t('checkin_skip')}
                        </button>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
