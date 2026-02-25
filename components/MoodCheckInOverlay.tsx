'use client';

/**
 * MoodCheckInOverlay — Soft frosted-glass overlay for midday mood tracking.
 * Shows when last_mood_checkin_at is NULL or older than 3 hours.
 * After submission: POST /api/mood/checkin, then dismiss.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const MOOD_OPTIONS = [
    { value: 1, label: 'Sehr niedrig', icon: '🌑' },
    { value: 2, label: 'Niedrig', icon: '🌒' },
    { value: 3, label: 'Mittel', icon: '🌓' },
    { value: 4, label: 'Gut', icon: '🌔' },
    { value: 5, label: 'Sehr gut', icon: '🌕' },
];

interface MoodCheckInOverlayProps {
    visible: boolean;
    onDismiss: () => void;
}

export function MoodCheckInOverlay({ visible, onDismiss }: MoodCheckInOverlayProps) {
    const [selectedMood, setSelectedMood] = useState<number | null>(null);
    const [note, setNote] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async () => {
        if (!selectedMood) return;

        setSubmitting(true);
        try {
            const res = await fetch('/api/mood/checkin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mood: selectedMood,
                    context: 'midday',
                    note: note.trim() || null,
                }),
            });

            if (!res.ok) {
                console.error('[MoodCheckIn] API error:', await res.text());
            }
        } catch (err) {
            console.error('[MoodCheckIn] Network error:', err);
        } finally {
            setSubmitting(false);
            setSelectedMood(null);
            setNote('');
            onDismiss();
        }
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
                            Kurzer Check-in
                        </p>
                        <h2 className="text-xl font-semibold text-[#0f172a] mb-5">
                            Wie geht es dir gerade?
                        </h2>

                        {/* Mood selector */}
                        <div className="flex gap-3 justify-center mb-6">
                            {MOOD_OPTIONS.map((opt) => (
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

                        {/* Optional note */}
                        <textarea
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="Optional: kurze Notiz..."
                            rows={2}
                            className="w-full resize-none rounded-lg border border-[#E7E7E5] bg-[#FAFAF9] px-3 py-2 text-sm text-[#37352F] placeholder:text-[#A8A29E] focus:outline-none focus:ring-1 focus:ring-[#002e7a] mb-5"
                        />

                        {/* Submit */}
                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={handleSubmit}
                            disabled={!selectedMood || submitting}
                            className="w-full py-3 bg-[#002e7a] text-white border-none rounded-xl text-sm font-semibold cursor-pointer tracking-tight hover:bg-[#001d4f] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            {submitting ? 'Speichern...' : 'Check-in abschließen'}
                        </motion.button>

                        {/* Skip link */}
                        <button
                            onClick={onDismiss}
                            className="mt-3 text-xs text-[#94a3b8] hover:text-[#64748b] bg-transparent border-none cursor-pointer transition-colors"
                        >
                            Jetzt nicht
                        </button>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
