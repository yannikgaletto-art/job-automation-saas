'use client';

/**
 * CoachingPerformance — Shows interview coaching progress over time.
 * Pure-TS insights, no AI call, $0 cost.
 * Design: matches existing analytics cards (Notion-style).
 */

import { motion } from 'framer-motion';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { CountUp } from '@/components/motion/count-up';
import { ArrowUpRight, ArrowDownRight, Minus, MessageSquare } from 'lucide-react';
import { calcCoachingTrend } from '@/lib/analytics/insights';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

interface CoachingSession {
    id: string;
    coaching_score: number | null;
    session_status: string;
    created_at: string;
    feedback_report?: string | null;
}

export function CoachingPerformance({ sessions }: { sessions: CoachingSession[] }) {
    const t = useTranslations('dashboard.analytics');
    const completed = sessions.filter(s => s.session_status === 'completed');
    const { scores, trend, improvementPct } = calcCoachingTrend(completed);

    // Extract top strengths from latest feedback_report (QA: strict try/catch)
    let topStrengths: string[] = [];
    const latestWithReport = completed.find(s => s.feedback_report);
    if (latestWithReport?.feedback_report) {
        try {
            const report = JSON.parse(latestWithReport.feedback_report);
            if (report.topicSuggestions && Array.isArray(report.topicSuggestions)) {
                topStrengths = report.topicSuggestions
                    .slice(0, 3)
                    .map((t: string | { topic: string }) => typeof t === 'string' ? t : t.topic);
            }
        } catch {
            // QA: Graceful fallback on malformed JSON from LLM
        }
    }

    const trendIcon = trend === 'improving'
        ? <ArrowUpRight className="w-4 h-4 text-green-600" />
        : trend === 'declining'
            ? <ArrowDownRight className="w-4 h-4 text-red-500" />
            : <Minus className="w-4 h-4 text-[#73726E]" />;

    const trendText = trend === 'improving'
        ? t('coaching_trend_improving', { pct: improvementPct })
        : trend === 'declining'
            ? t('coaching_trend_declining', { pct: improvementPct })
            : t('coaching_trend_stable');

    const trendColor = trend === 'improving'
        ? 'text-green-600'
        : trend === 'declining'
            ? 'text-red-500'
            : 'text-[#73726E]';

    const latestScore = scores.length > 0 ? scores[scores.length - 1].score : null;

    // Empty state
    if (completed.length === 0) {
        return (
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-xl border border-[#d6d6d6] p-6 shadow-sm text-center"
            >
                <MessageSquare className="w-8 h-8 text-[#002e7a]/30 mx-auto mb-3" />
                <p className="text-sm font-medium text-[#37352F] mb-1">
                    {t('coaching_empty_title')}
                </p>
                <p className="text-xs text-[#73726E] mb-4 max-w-xs mx-auto">
                    {t('coaching_empty_desc')}
                </p>
                <Link
                    href="/dashboard/coaching"
                    className="inline-block text-xs font-medium text-[#002e7a] hover:underline"
                >
                    {t('coaching_empty_link')}
                </Link>
            </motion.div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl border border-[#d6d6d6] p-6 shadow-sm space-y-4"
        >
            <h2 className="text-sm font-semibold text-[#002e7a] uppercase tracking-wider">
                {t('coaching_title')}
            </h2>

            <div className="flex items-end gap-4">
                {/* Latest score */}
                {latestScore !== null && (
                    <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className={`text-5xl font-bold tabular-nums ${latestScore >= 70 ? 'text-green-600' : latestScore >= 40 ? 'text-amber-500' : 'text-red-500'
                            }`}
                    >
                        <CountUp value={latestScore} duration={1.5} />
                    </motion.div>
                )}
                <div className="pb-2">
                    <p className="text-xs text-stone-400">/ 100</p>
                    {trend !== 'none' && (
                        <div className={`flex items-center gap-1 mt-1 ${trendColor}`}>
                            {trendIcon}
                            <span className="text-[11px] font-medium">{trendText}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Sparkline */}
            {scores.length > 1 ? (
                <ResponsiveContainer width="100%" height={60}>
                    <LineChart data={scores}>
                        <Line
                            type="monotone"
                            dataKey="score"
                            stroke="#002e7a"
                            strokeWidth={2}
                            dot={false}
                        />
                    </LineChart>
                </ResponsiveContainer>
            ) : (
                <p className="text-xs text-stone-400">{t('coaching_more_sessions')}</p>
            )}

            {/* Topic recommendations from latest report */}
            {topStrengths.length > 0 && (
                <div>
                    <p className="text-[10px] font-semibold text-[#002e7a]/50 uppercase tracking-wider mb-1.5">
                        {t('coaching_recommendations')}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                        {topStrengths.map((s, i) => (
                            <span
                                key={i}
                                className="px-2 py-0.5 rounded text-[10px] font-medium bg-[#E8EFF8] text-[#002e7a] border border-[#002e7a]/10"
                            >
                                {s}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            <p className="text-[10px] text-stone-400">
                {t('coaching_based_on', { n: completed.length })}
            </p>
        </motion.div>
    );
}
