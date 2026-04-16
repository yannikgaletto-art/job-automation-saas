"use client";

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { CalendarOrchestrator } from './components/calendar/calendar-orchestrator';
import { useMoodCheckinContext } from './hooks/useMoodCheckIn';
import { useTimeOfDay, getSymbolForScore } from './hooks/useMoodSymbol';
import { useDashboardTour, type TourStep } from './hooks/useDashboardTour';
import { GuidedTourOverlay } from '@/components/dashboard/guided-tour-overlay';

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

const GOALS_TOUR_STEPS: TourStep[] = [
    {
        targetSelector: '[data-tour="goals-header"]',
        position: 'bottom',
        titleKey: 'step1_title',
        bodyKey: 'step1_body',
    },
    {
        targetSelector: '[data-tour="mission-panel"]',
        position: 'left',
        titleKey: 'step2_title',
        bodyKey: 'step2_body',
    },
    {
        targetSelector: '[data-tour="timeline-grid"]',
        position: 'right',
        titleKey: 'step3_title',
        bodyKey: 'step3_body',
    },
];

export default function DashboardPage() {
    const t = useTranslations('dashboard.todays_goals');

    // 🎉 First-visit confetti — fires once, only after completing onboarding
    // Uses sessionStorage flag set by onboarding page → clears automatically on tab close
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const flag = sessionStorage.getItem('pathly_show_post_onboarding_tour');
        const confettiKey = 'pathly_welcome_confetti_shown';
        // Only fire confetti if: post-onboarding flag present AND never shown before
        if (flag !== '1' || localStorage.getItem(confettiKey)) return;

        localStorage.setItem(confettiKey, '1');
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

    // 🗺️ Tagesziele guided tour — only fires once after onboarding
    const tour = useDashboardTour('goals', GOALS_TOUR_STEPS, {
        delayMs: 3000,
        requireOnboardingFlag: true,
    });

    return (
        <div className="space-y-8">
            {/* Header — data-tour target for guided tour step 1 */}
            <div data-tour="goals-header">
                <h1 className="text-3xl font-semibold text-[#37352F]">{t('title')}</h1>
                <p className="text-[#73726E] mt-1">{t('subtitle')}</p>
            </div>

            {/* Mood-aware Pathly message — shows only after today's check-in */}
            <MoodMessage />

            {/* Calendar + Task System — the core of Today's Goals */}
            <CalendarOrchestrator />

            {/* Guided Tour Overlay */}
            {tour.isActive && tour.step && (
                <GuidedTourOverlay
                    step={tour.step}
                    currentStep={tour.currentStep}
                    totalSteps={tour.totalSteps}
                    onNext={tour.nextStep}
                    onSkip={tour.skipTour}
                />
            )}
        </div>
    );
}

