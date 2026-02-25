'use client';

/**
 * Analytics Page — Flow State & Human Performance
 * Silicon Valley precision × Lee Harris energy awareness.
 * Client component using useAnalytics hook.
 */

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { StatsRow } from './components/stats-row';
import { FlowHeatmap } from './components/flow-heatmap';
import { GoldenHoursClock } from './components/golden-hours-clock';
import { EnergyResonanceChart } from './components/energy-resonance-chart';
import { MomentumScore } from './components/momentum-score';
import { ApplicationFunnel } from './components/application-funnel';
import { InsightBox } from './components/insight-box';
import { buildHeatmapGrid, findPeakWindow } from '@/lib/analytics/heatmap-utils';
import {
    calcMomentumScore,
    generatePeakInsight,
    generateEnergyInsight,
    generateFunnelInsight,
    calcStreak,
} from '@/lib/analytics/insights';

interface AnalyticsData {
    heatmap: any[];
    momentum: any[];
    funnel: any[];
    energyTimeline: any[];
}

const PERIOD_OPTIONS = [
    { label: '7 Tage', value: 7 },
    { label: '30 Tage', value: 30 },
    { label: '90 Tage', value: 90 },
];

export default function AnalyticsPage() {
    const [data, setData] = useState<AnalyticsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [days, setDays] = useState(30);

    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);

        fetch(`/api/analytics/flow?days=${days}`, { signal: controller.signal })
            .then(res => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.json();
            })
            .then(setData)
            .catch(err => {
                if (err.name !== 'AbortError') console.error('Analytics fetch error:', err);
            })
            .finally(() => setLoading(false));

        return () => controller.abort();
    }, [days]);

    // Compute insights
    const grid = data ? buildHeatmapGrid(data.heatmap) : [];
    const peak = grid.length > 0 ? findPeakWindow(grid) : { day: 0, startHour: 8, count: 0 };
    const peakText = data ? generatePeakInsight(peak, data.momentum.length) : null;
    const energyText = data ? generateEnergyInsight(data.energyTimeline) : null;
    const funnelText = data ? generateFunnelInsight(data.funnel) : null;
    const momentumScore = data ? calcMomentumScore(data.momentum, data.funnel) : 0;
    const streak = data ? calcStreak(data.momentum) : 0;

    const isEmpty = !data || (data.momentum.length === 0 && data.heatmap.length === 0);

    return (
        <div className="space-y-8 pb-12">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-semibold text-[#37352F]">
                        Flow State & Performance
                    </h1>
                    <p className="text-[#73726E] mt-1">
                        Deine Muster. Dein Rhythmus. Deine Golden Hours.
                    </p>
                </div>

                {/* Period Selector */}
                <div className="flex items-center gap-1 bg-[#F7F7F5] rounded-lg p-1">
                    {PERIOD_OPTIONS.map(opt => (
                        <button
                            key={opt.value}
                            onClick={() => setDays(opt.value)}
                            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${days === opt.value
                                ? 'bg-white text-[#002e7a] shadow-sm'
                                : 'text-[#73726E] hover:text-[#37352F]'
                                }`}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>

            {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="bg-white rounded-xl border border-[#d6d6d6] p-5 shadow-sm h-24 animate-pulse" />
                    ))}
                </div>
            ) : isEmpty ? (
                /* Empty State */
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white rounded-xl border border-[#d6d6d6] p-12 text-center shadow-sm"
                >
                    <p className="text-4xl mb-4">—</p>
                    <h2 className="text-lg font-semibold text-[#37352F] mb-2">
                        Starte deine erste Pomodoro-Session
                    </h2>
                    <p className="text-sm text-[#73726E] max-w-md mx-auto">
                        Sobald du deine erste Fokus-Session abschließt, erscheinen hier deine Flow State Heatmap,
                        Golden Hours, Energie-Resonanz und dein persönliches Momentum.
                    </p>
                </motion.div>
            ) : (
                <>
                    {/* Stat Cards */}
                    <StatsRow sessions={data!.momentum} />

                    {/* Streak banner */}
                    {streak >= 3 && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl px-5 py-3 flex items-center gap-3"
                        >
                            <span className="text-2xl font-bold text-[#002e7a]">Streak</span>
                            <p className="text-sm text-amber-800">
                                <strong>{streak}-Tage-Streak!</strong> Du bist seit {streak} Tagen in Folge aktiv.
                            </p>
                        </motion.div>
                    )}

                    {/* Heatmap + Clock */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 }}
                            className="lg:col-span-2 bg-white rounded-xl border border-[#d6d6d6] p-6 shadow-sm space-y-4"
                        >
                            <h2 className="text-sm font-semibold text-[#002e7a] uppercase tracking-wider">
                                Flow State Heatmap
                            </h2>
                            <p className="text-xs text-[#73726E]">Wann bist du am schärfsten?</p>
                            <FlowHeatmap cells={data!.heatmap} />
                            {peakText && <InsightBox text={peakText} icon="" />}
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.2 }}
                            className="bg-white rounded-xl border border-[#d6d6d6] p-6 shadow-sm flex flex-col items-center justify-center gap-4"
                        >
                            <h2 className="text-sm font-semibold text-[#002e7a] uppercase tracking-wider self-start">
                                Golden Hours
                            </h2>
                            <GoldenHoursClock cells={data!.heatmap} />
                        </motion.div>
                    </div>

                    {/* Energy Resonance */}
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="bg-white rounded-xl border border-[#d6d6d6] p-6 shadow-sm space-y-4"
                    >
                        <h2 className="text-sm font-semibold text-[#002e7a] uppercase tracking-wider">
                            Energie Resonanz
                        </h2>
                        <p className="text-xs text-[#73726E]">Dein Energielevel × Completion Rate der Sessions</p>
                        <EnergyResonanceChart sessions={data!.energyTimeline} />
                        {energyText && <InsightBox text={energyText} icon="" />}
                    </motion.div>

                    {/* Momentum + Funnel */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.4 }}
                            className="bg-white rounded-xl border border-[#d6d6d6] p-6 shadow-sm space-y-4"
                        >
                            <h2 className="text-sm font-semibold text-[#002e7a] uppercase tracking-wider">
                                Bewerbungs-Momentum
                            </h2>
                            <MomentumScore score={momentumScore} sessions={data!.momentum} />
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.5 }}
                            className="bg-white rounded-xl border border-[#d6d6d6] p-6 shadow-sm space-y-4"
                        >
                            <h2 className="text-sm font-semibold text-[#002e7a] uppercase tracking-wider">
                                Bewerbungs-Funnel
                            </h2>
                            <ApplicationFunnel jobs={data!.funnel} />
                            {funnelText && <InsightBox text={funnelText} icon="⚠️" />}
                        </motion.div>
                    </div>
                </>
            )}
        </div>
    );
}
