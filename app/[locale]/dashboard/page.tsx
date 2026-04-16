"use client";

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { CalendarOrchestrator } from './components/calendar/calendar-orchestrator';
import { useMoodCheckinContext } from './hooks/useMoodCheckIn';
import { useTimeOfDay, getSymbolForScore } from './hooks/useMoodSymbol';

/** Mood-aware message below header — only renders if mood was submitted today */
function MoodMessage() {
    const t = useTranslations('mood');
    const { todayMood } = useMoodCheckinContext();
    const timeOfDay = useTimeOfDay();

    if (todayMood === null) return null;

    const symbol = getSymbolForScore(todayMood, timeOfDay);
    const messageKey = `today_message_${todayMood}` as `today_message_1` | `today_message_2` | `today_message_3` | `today_message_4` | `today_message_5`;

    return (
        <div className="flex gap-3 items-center bg-[#F5F5F4] rounded-xl p-3">
            <span className="text-2xl">{symbol}</span>
            <span className="text-sm text-[#73726E]">{t(messageKey)}</span>
        </div>
    );
}

export default function DashboardPage() {
    const t = useTranslations('dashboard.todays_goals');

    // 🎉 Post-onboarding confetti — fires once per onboarding completion.
    // Guard: sessionStorage-only (no stale localStorage from previous test accounts).
    // - 'pathly_show_post_onboarding_tour' is set by onboarding page on completion
    // - 'pathly_confetti_fired' prevents re-firing on same-session page navigation
    // Both keys auto-clear when the browser tab closes (sessionStorage behavior).
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const onboardingFlag = sessionStorage.getItem('pathly_show_post_onboarding_tour');
        if (onboardingFlag !== '1') return; // Not coming from onboarding
        if (sessionStorage.getItem('pathly_confetti_fired') === '1') return; // Already fired this session

        sessionStorage.setItem('pathly_confetti_fired', '1');
        import('canvas-confetti').then(({ default: confetti }) => {
            const duration = 2500;
            const end = Date.now() + duration;
            const frame = () => {
                confetti({ particleCount: 3, angle: 60, spread: 55, origin: { x: 0, y: 0.7 }, colors: ['#002e7a', '#3b82f6', '#60a5fa', '#93c5fd'] });
                confetti({ particleCount: 3, angle: 120, spread: 55, origin: { x: 1, y: 0.7 }, colors: ['#002e7a', '#3b82f6', '#60a5fa', '#93c5fd'] });
                if (Date.now() < end) requestAnimationFrame(frame);
            };
            frame();
        });
    }, []);

    // NOTE: The Tagesziele guided tour is managed by layout.tsx (not here)
    // to avoid duplicate overlays. Layout handles demo-task creation for Step 3.

    return (
        <div className="space-y-8">
            {/* Header */}
            <div data-tour="goals-header">
                <h1 className="text-3xl font-semibold text-[#37352F]">{t('title')}</h1>
                <p className="text-[#73726E] mt-1">{t('subtitle')}</p>
            </div>

            {/* Mood-aware Pathly message — shows only after today's check-in */}
            <MoodMessage />

            {/* Calendar + Task System — the core of Today's Goals */}
            <CalendarOrchestrator />
        </div>
    );
}
