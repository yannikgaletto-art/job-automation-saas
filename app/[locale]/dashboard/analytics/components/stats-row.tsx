'use client';

import { motion } from 'framer-motion';
import { CountUp } from '@/components/motion/count-up';
import { useTranslations } from 'next-intl';

interface Session {
    completed: boolean;
    energy_level: number | null;
}

export function StatsRow({ sessions }: { sessions: Session[] }) {
    const t = useTranslations('dashboard.analytics');
    const total = sessions.length;
    const completed = sessions.filter(s => s.completed).length;
    const completionPct = total > 0 ? Math.round((completed / total) * 100) : 0;
    const energySessions = sessions.filter(s => s.energy_level !== null);
    const avgEnergy = energySessions.length > 0
        ? (energySessions.reduce((s, x) => s + (x.energy_level ?? 0), 0) / energySessions.length)
        : 0;

    const MOON = ['', '🌑', '🌒', '🌓', '🌔', '🌕'];
    const moonIcon = avgEnergy > 0 ? MOON[Math.round(avgEnergy)] : '—';

    const stats = [
        { label: t('stats_sessions'), value: total, suffix: '' },
        { label: t('stats_completion'), value: completionPct, suffix: '%' },
        { label: t('stats_energy'), value: avgEnergy, suffix: ` ${moonIcon}`, isDecimal: true },
    ];

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {stats.map((stat) => (
                <motion.div
                    key={stat.label}
                    className="bg-white rounded-xl border border-[#d6d6d6] p-5 shadow-sm"
                    whileHover={{ scale: 1.02, y: -2, boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                    transition={{ duration: 0.2 }}
                >
                    <p className="text-[10px] font-semibold text-[#002e7a]/60 uppercase tracking-wider mb-1">
                        {stat.label}
                    </p>
                    <div className="text-3xl font-bold text-[#002e7a]">
                        {stat.isDecimal ? (
                            <span>{avgEnergy.toFixed(1)} {moonIcon}</span>
                        ) : (
                            <>
                                <CountUp value={stat.value} duration={1} />
                                {stat.suffix}
                            </>
                        )}
                    </div>
                </motion.div>
            ))}
        </div>
    );
}
