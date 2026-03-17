'use client';

/**
 * Analytics Page — Performance Center
 * Combines Flow State (Pomodoro), Coaching Performance, and Actionable Insights.
 * Client component with two independent data fetches (flow + coaching).
 */

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import { StatsRow } from './components/stats-row';
import { FlowHeatmap } from './components/flow-heatmap';
import { GoldenHoursClock } from './components/golden-hours-clock';
import { EnergyResonanceChart } from './components/energy-resonance-chart';
import { MomentumScore } from './components/momentum-score';
import { InsightBox } from './components/insight-box';
import { CoachingPerformance } from './components/coaching-performance';
import { NextBestAction } from './components/next-best-action';
import { buildHeatmapGrid, findPeakWindow } from '@/lib/analytics/heatmap-utils';
import {
    calcMomentumScore,
    generatePeakInsight,
    generateEnergyInsight,
    calcStreak,
} from '@/lib/analytics/insights';

interface AnalyticsData {
    heatmap: any[];
    momentum: any[];
    funnel: any[];
    energyTimeline: any[];
}

interface CoachingSessionData {
    id: string;
    coaching_score: number | null;
    session_status: string;
    created_at: string;
    feedback_report?: string | null;
}

const PERIOD_OPTIONS = [
    { key: 'period_7', value: 7 },
    { key: 'period_30', value: 30 },
    { key: 'period_90', value: 90 },
];

export default function AnalyticsPage() {
    const t = useTranslations('dashboard.analytics');
    const [data, setData] = useState<AnalyticsData | null>(null);
    const [coachingSessions, setCoachingSessions] = useState<CoachingSessionData[]>([]);
    const [loading, setLoading] = useState(true);
    const [coachingLoading, setCoachingLoading] = useState(true);
    const [days, setDays] = useState(30);

    // Fetch 1: Flow analytics (Pomodoro + Job funnel)
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

    // Fetch 2: Coaching sessions (QA: AbortController + error fallback + loading state)
    useEffect(() => {
        const controller = new AbortController();
        setCoachingLoading(true);

        fetch('/api/coaching/session', { signal: controller.signal })
            .then(res => {
                if (!res.ok) throw new Error('Failed to fetch coaching data');
                return res.json();
            })
            .then(d => setCoachingSessions(d.sessions || []))
            .catch(err => {
                if (err.name !== 'AbortError') {
                    console.error('[Analytics] Coaching fetch error:', err);
                    setCoachingSessions([]); // Fallback to empty state
                }
            })
            .finally(() => setCoachingLoading(false));

        return () => controller.abort();
    }, []);;

    // Compute insights
    const grid = data ? buildHeatmapGrid(data.heatmap) : [];
    const peak = grid.length > 0 ? findPeakWindow(grid) : { day: 0, startHour: 8, count: 0 };
    const peakText = data ? generatePeakInsight(peak, data.momentum.length) : null;
    const energyText = data ? generateEnergyInsight(data.energyTimeline) : null;
    const momentumScore = data ? calcMomentumScore(data.momentum, data.funnel) : 0;
    const streak = data ? calcStreak(data.momentum) : 0;

    // Check if user has a Pomodoro session today
    const todayStr = new Date().toISOString().split('T')[0];
    const todayHasPomodoro = data?.momentum.some((s: { started_at: string }) =>
        s.started_at.startsWith(todayStr)
    ) ?? false;

    const hasFlowData = data && (data.momentum.length > 0 || data.heatmap.length > 0);

    return (
        <div className="space-y-8 pb-12">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-semibold text-[#37352F]">
                        Performance Center
                    </h1>
                    <p className="text-[#73726E] mt-1">
                        {t('subtitle')}
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
                            {t(opt.key as Parameters<typeof t>[0])}
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
            ) : (
                <>
                    {/* ── Next Best Action (always visible) ─────────────────── */}
                    <NextBestAction
                        jobs={data?.funnel ?? []}
                        coachingSessions={coachingSessions}
                        todayHasPomodoro={todayHasPomodoro}
                        streak={streak}
                    />

                    {/* ── Coaching Performance ─────────────────────────────── */}
                    {coachingLoading ? (
                        <div className="bg-white rounded-xl border border-[#d6d6d6] p-6 shadow-sm h-32 animate-pulse" />
                    ) : (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 }}
                        >
                            <CoachingPerformance sessions={coachingSessions} />
                        </motion.div>
                    )}

                    {/* ── Flow State Section (Pomodoro-dependent) ──────────── */}
                    {!hasFlowData ? (
                        /* Pomodoro Empty State */
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.2 }}
                            className="bg-white rounded-xl border border-[#d6d6d6] p-12 text-center shadow-sm"
                        >
                            <p className="text-4xl mb-4">—</p>
                            <h2 className="text-lg font-semibold text-[#37352F] mb-2">
                                {t('empty_title')}
                            </h2>
                            <p className="text-sm text-[#73726E] max-w-md mx-auto">
                                {t('empty_desc')}
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
                                    <span className="text-2xl font-bold text-[#002e7a]">{t('streak_label')}</span>
                                    <p className="text-sm text-amber-800">
                                        <strong>{t('streak_text', { count: streak })}</strong>
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
                                        {t('heatmap_title')}
                                    </h2>
                                    <p className="text-xs text-[#73726E]">{t('heatmap_subtitle')}</p>
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
                                        {t('golden_hours')}
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
                                    {t('energy')}
                                </h2>
                                <p className="text-xs text-[#73726E]">{t('energy_subtitle')}</p>
                                <EnergyResonanceChart sessions={data!.energyTimeline} />
                                {energyText && <InsightBox text={energyText} icon="" />}
                            </motion.div>

                            {/* Momentum */}
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.4 }}
                                className="bg-white rounded-xl border border-[#d6d6d6] p-6 shadow-sm space-y-4"
                            >
                                <h2 className="text-sm font-semibold text-[#002e7a] uppercase tracking-wider">
                                    {t('momentum')}
                                </h2>
                                <MomentumScore score={momentumScore} sessions={data!.momentum} />
                            </motion.div>
                        </>
                    )}
                </>
            )}
        </div>
    );
}
