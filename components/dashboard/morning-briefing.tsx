'use client';

/**
 * Morning Briefing — Frosted glass overlay, once per day.
 * KI-generates a personalized message.
 * Energy check-in (optional, 1-click).
 * No X button — only "Let's go" dismisses.
 */

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface BriefingData {
    message: string;
    completedYesterday: number;
    firstBlockTime: string | null;
    userName: string;
}

const ENERGY_ICONS = ['🌑', '🌒', '🌓', '🌔', '🌕'];

export function MorningBriefing() {
    const [visible, setVisible] = useState(false);
    const [briefing, setBriefing] = useState<BriefingData | null>(null);
    const [energy, setEnergy] = useState<number | null>(null);

    useEffect(() => {
        const todayKey = `pathly_briefing_${new Date().toISOString().split('T')[0]}`;
        if (localStorage.getItem(todayKey)) return;

        fetch('/api/briefing/generate')
            .then(r => r.json())
            .then(data => {
                setBriefing(data);
                setVisible(true);
            })
            .catch(() => {
                setBriefing({
                    message: 'Ein neuer Tag, eine neue Chance. Fokussiere dich auf das Wesentliche.',
                    completedYesterday: 0,
                    firstBlockTime: null,
                    userName: 'Hey',
                });
                setVisible(true);
            });
    }, []);

    const handleStartDay = async () => {
        if (energy !== null) {
            fetch('/api/user/energy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ energy }),
            }).catch(() => { });
        }

        const todayKey = `pathly_briefing_${new Date().toISOString().split('T')[0]}`;
        localStorage.setItem(todayKey, '1');
        setVisible(false);
    };

    return (
        <AnimatePresence>
            {visible && briefing && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, y: -60 }}
                    transition={{ duration: 0.4, ease: 'easeOut' }}
                    className="fixed inset-0 z-50 flex items-center justify-center p-4"
                    style={{ backdropFilter: 'blur(16px)', background: 'rgba(255,255,255,0.85)' }}
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        transition={{ delay: 0.15, duration: 0.4 }}
                        className="max-w-[520px] w-full bg-white rounded-3xl shadow-2xl p-10 text-center"
                    >
                        {/* Date */}
                        <p className="text-[13px] text-[#94a3b8] mb-2">
                            {new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}
                        </p>

                        {/* Greeting */}
                        <h2 className="text-2xl font-bold text-[#0f172a] mb-5">
                            Guten Morgen, {briefing.userName} 🌅
                        </h2>

                        {/* AI Message */}
                        <div className="bg-[#f8fafc] rounded-xl p-5 mb-7">
                            <p className="text-base text-[#334155] leading-relaxed">
                                „{briefing.message}"
                            </p>
                        </div>

                        {/* Energy selector */}
                        <div className="mb-8">
                            <p className="text-[13px] text-[#64748b] mb-3">
                                Wie ist deine Energie heute?
                            </p>
                            <div className="flex gap-3 justify-center">
                                {ENERGY_ICONS.map((icon, i) => (
                                    <motion.button
                                        key={i}
                                        whileHover={{ scale: 1.15 }}
                                        whileTap={{ scale: 0.9 }}
                                        onClick={() => setEnergy(i + 1)}
                                        className="text-3xl bg-transparent border-none cursor-pointer transition-all"
                                        style={{
                                            opacity: energy === null || energy === i + 1 ? 1 : 0.3,
                                            transform: energy === i + 1 ? 'scale(1.3)' : 'scale(1)',
                                        }}
                                        title={`Energielevel ${i + 1}/5`}
                                    >
                                        {icon}
                                    </motion.button>
                                ))}
                            </div>
                        </div>

                        {/* CTA */}
                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={handleStartDay}
                            className="w-full py-3.5 bg-[#002e7a] text-white border-none rounded-xl text-base font-bold cursor-pointer tracking-tight hover:bg-[#001d4f] transition-colors"
                        >
                            Let's go — Start Day →
                        </motion.button>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
