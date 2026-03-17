'use client';

/**
 * NextBestAction — Deterministic actionable insights.
 * Pure-TS logic, no AI, $0 cost, 0ms latency.
 * QA: Strict waterfall priority (if/else if) — no flicker between two actions.
 */

import { motion } from 'framer-motion';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, Send, FileCheck, BrainCircuit, Timer } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface NextBestActionProps {
    jobs: { status: string }[];
    coachingSessions: { session_status: string }[];
    todayHasPomodoro: boolean;
    streak: number;
}

interface ActionConfig {
    message: string;
    cta: string;
    href: string;
    icon: React.ReactNode;
    gradient: string;
    borderColor: string;
}

export function NextBestAction({ jobs, coachingSessions, todayHasPomodoro, streak }: NextBestActionProps) {
    const t = useTranslations('dashboard.analytics');
    const readyForReview = jobs.filter(j => j.status === 'ready_for_review').length;
    const readyToApply = jobs.filter(j => j.status === 'ready_to_apply').length;
    const hasJobs = jobs.length > 0;
    const hasCoaching = coachingSessions.some(s => s.session_status === 'completed');

    // QA: Strict waterfall priority — exactly ONE action, no overlapping
    let action: ActionConfig;

    if (readyForReview > 0) {
        action = {
            message: t('nba_review', { n: readyForReview }),
            cta: t('nba_cta_queue'),
            href: '/dashboard/queue',
            icon: <FileCheck className="w-5 h-5" />,
            gradient: 'from-amber-50 to-orange-50',
            borderColor: 'border-amber-200',
        };
    } else if (readyToApply > 0) {
        action = {
            message: readyToApply === 1
                ? t('nba_apply_single', { n: readyToApply })
                : t('nba_apply_plural', { n: readyToApply }),
            cta: t('nba_cta_queue'),
            href: '/dashboard/queue',
            icon: <Send className="w-5 h-5" />,
            gradient: 'from-green-50 to-emerald-50',
            borderColor: 'border-green-200',
        };
    } else if (!hasCoaching && hasJobs) {
        action = {
            message: t('nba_coaching'),
            cta: t('nba_cta_coaching'),
            href: '/dashboard/coaching',
            icon: <BrainCircuit className="w-5 h-5" />,
            gradient: 'from-blue-50 to-indigo-50',
            borderColor: 'border-blue-200',
        };
    } else if (!todayHasPomodoro) {
        action = {
            message: streak > 0
                ? t('nba_session_streak', { streak })
                : t('nba_session_start'),
            cta: t('nba_cta_session'),
            href: '/dashboard',
            icon: <Timer className="w-5 h-5" />,
            gradient: 'from-violet-50 to-purple-50',
            borderColor: 'border-violet-200',
        };
    } else {
        action = {
            message: t('nba_done'),
            cta: '',
            href: '',
            icon: <CheckCircle2 className="w-5 h-5 text-green-600" />,
            gradient: 'from-green-50 to-emerald-50',
            borderColor: 'border-green-200',
        };
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`bg-gradient-to-r ${action.gradient} ${action.borderColor} border rounded-xl px-5 py-4 flex items-center justify-between gap-4`}
        >
            <div className="flex items-center gap-3 min-w-0">
                <div className="shrink-0 text-[#002e7a]">
                    {action.icon}
                </div>
                <div className="min-w-0">
                    <p className="text-[10px] font-semibold text-[#002e7a]/60 uppercase tracking-wider mb-0.5">
                        {t('next_step_label')}
                    </p>
                    <p className="text-sm font-medium text-[#37352F]">
                        {action.message}
                    </p>
                </div>
            </div>

            {action.cta && (
                <Link
                    href={action.href}
                    className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white bg-[#002e7a] hover:bg-[#001d4f] transition-colors"
                >
                    {action.cta}
                    <ArrowRight className="w-3.5 h-3.5" />
                </Link>
            )}
        </motion.div>
    );
}
