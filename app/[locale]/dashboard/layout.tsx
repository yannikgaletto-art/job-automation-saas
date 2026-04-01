"use client";

import { useEffect, useState, useCallback, useRef } from 'react';
import { Sidebar, NavSection, NavItem } from '@/components/motion/sidebar';
import { Home, Search, Inbox, BarChart3, Users, Heart, Shield, Settings, MessageSquare, Mic } from 'lucide-react';
import { PomodoroMiniWidget } from './components/pomodoro-mini-widget';
import { usePathname } from '@/i18n/navigation';
import { useLocale, useTranslations } from 'next-intl';

import { MorningBriefing } from '@/components/dashboard/morning-briefing';
import { CommandPalette } from '@/components/dashboard/command-palette';
import { GuidedTourOverlay } from '@/components/dashboard/guided-tour-overlay';
import { MoodCheckInOverlay } from '@/components/MoodCheckInOverlay';
import { useMoodCheckIn, MoodCheckinProvider } from './hooks/useMoodCheckIn';
import { useDashboardTour, type TourStep } from './hooks/useDashboardTour';
import { useJobQueueCount } from '@/store/use-job-queue-count';
import { useCalendarStore } from '@/store/use-calendar-store';
import { createClient } from '@/lib/supabase/client';

const ADMIN_EMAILS = ['galettoyannik7@gmail.com', 'yannik.galetto@gmail.com'];

// ─── Tour Step Configuration for "Tagesziele" tab ──────────────
const GOALS_TOUR_STEPS: TourStep[] = [
    {
        targetSelector: '[data-tour="timeline-grid"]',
        position: 'right',
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
        targetSelector: '[data-tour="focus-panel"]',
        position: 'left',
        titleKey: 'step3_title',
        bodyKey: 'step3_body',
    },
];

/** Admin NavItem — only renders for whitelisted admin emails */
function AdminNavItem() {
    const [isAdminUser, setIsAdminUser] = useState(false);
    const locale = useLocale();

    useEffect(() => {
        const supabase = createClient();
        supabase.auth.getUser().then(({ data }) => {
            if (data?.user?.email && ADMIN_EMAILS.includes(data.user.email.toLowerCase())) {
                setIsAdminUser(true);
            }
        });
    }, []);

    if (!isAdminUser) return null;
    return <NavItem icon={Shield} label="Admin" href={`/${locale}/dashboard/admin`} />;
}

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <MoodCheckinProvider>
            <DashboardLayoutInner>{children}</DashboardLayoutInner>
        </MoodCheckinProvider>
    );
}

function DashboardLayoutInner({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();
    const locale = useLocale();
    const t = useTranslations('dashboard');
    const { showOverlay: showMoodOverlay, dismiss: dismissMoodOverlay, handleSkip, handleSubmit } = useMoodCheckIn();
    const { setCount } = useJobQueueCount();
    const timerTick = useCalendarStore((s) => s.timerTick);

    // ─── Global Pomodoro timer tick — runs on ALL pages ───────────
    useEffect(() => {
        const interval = setInterval(() => { timerTick(); }, 1000);
        return () => clearInterval(interval);
    }, [timerTick]);

    // Fetch initial queue count on mount
    useEffect(() => {
        fetch('/api/jobs/list')
            .then(r => r.json())
            .then(data => {
                if (data.jobs && Array.isArray(data.jobs)) {
                    setCount(data.jobs.length);
                }
            })
            .catch(() => { }); // Silent — badge is nice-to-have
    }, [setCount]);

    // ─── Guided Tour (Tagesziele) ─────────────────────────────────
    // Only activates on Dashboard root (Tagesziele tab), waits for MoodCheckIn to close
    const isOnGoalsTab = pathname === '/dashboard';
    const demoTaskIdRef = useRef<string | null>(null);

    const tour = useDashboardTour('goals', GOALS_TOUR_STEPS, {
        delayMs: 3500, // After confetti animation
        enabled: isOnGoalsTab && !showMoodOverlay,
        requireOnboardingFlag: true, // Only trigger after fresh onboarding completion
    });

    // Step 3 — Create demo task & enter focus mode when reaching the Pomodoro step
    useEffect(() => {
        if (!tour.isActive || tour.currentStep !== 2) return;

        let cancelled = false;

        async function createDemoTask() {
            try {
                const res = await fetch('/api/tasks', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        title: '🍅 Meine erste Pomodoro-Session',
                        estimated_minutes: 25,
                        source: 'manual',
                    }),
                });
                const data = await res.json();
                if (cancelled || !data.success || !data.task) return;

                const taskId = data.task.id;
                demoTaskIdRef.current = taskId;

                // Schedule the task at current time
                const now = new Date();
                const startISO = now.toISOString();
                const endISO = new Date(now.getTime() + 25 * 60000).toISOString();

                // Add to store
                useCalendarStore.getState().addTask(data.task);
                useCalendarStore.getState().scheduleTask(taskId, startISO, endISO);

                // Enter focus mode directly (bypass confirmation modal — QA Blocker #1 fix)
                useCalendarStore.setState({
                    focusedTaskId: taskId,
                    contextMode: 'focus',
                    autoStartTimer: false, // Don't auto-start during tour
                    showFocusConfirmation: false,
                    pendingFocusTaskId: null,
                    tasks: useCalendarStore.getState().tasks.map((task) =>
                        task.id === taskId
                            ? { ...task, status: 'focus' as const, scheduled_start: startISO, scheduled_end: endISO }
                            : task
                    ),
                });

                // Sync schedule to DB
                await fetch('/api/tasks', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id: taskId,
                        status: 'scheduled',
                        scheduled_start: startISO,
                        scheduled_end: endISO,
                    }),
                });
            } catch {
                // Silent — demo task is nice-to-have
            }
        }

        createDemoTask();
        return () => { cancelled = true; };
    }, [tour.isActive, tour.currentStep]);

    // Cleanup demo task when tour completes or is skipped
    const handleTourNext = useCallback(() => {
        const isLastStep = tour.currentStep === tour.totalSteps - 1;

        if (isLastStep) {
            cleanupDemoTask(demoTaskIdRef.current);
            demoTaskIdRef.current = null;
        }

        tour.nextStep();
    }, [tour]);

    const handleTourSkip = useCallback(() => {
        cleanupDemoTask(demoTaskIdRef.current);
        demoTaskIdRef.current = null;
        tour.skipTour();
    }, [tour]);

    return (
        <>
            <div className="min-h-screen bg-[#FAFAF9] flex">
                {/* Sidebar — always visible */}
                <Sidebar>
                    <NavSection title={t('nav_section.main')}>
                        <NavItem
                            icon={Home}
                            label={t('nav.todays_goals')}
                            href={`/${locale}/dashboard`}
                            isActive={pathname === '/dashboard'}
                            shortcut="G"
                        />
                        <NavItem icon={Search} label={t('nav.job_search')} href={`/${locale}/dashboard/job-search`} shortcut="S" />
                        <NavItem icon={Inbox} label={t('nav.job_queue')} href={`/${locale}/dashboard/job-queue`} shortcut="Q" />
                        <NavItem icon={BarChart3} label={t('nav.analytics')} href={`/${locale}/dashboard/analytics`} shortcut="A" />
                        <NavItem icon={MessageSquare} label={t('nav.coaching')} href={`/${locale}/dashboard/coaching`} shortcut="I" />
                    </NavSection>

                    <NavSection title={t('nav_section.community')}>
                        <NavItem icon={Users} label={t('nav.community')} href={`/${locale}/dashboard/community`} shortcut="C" />
                        <NavItem icon={Heart} label={t('nav.volunteering')} href={`/${locale}/dashboard/volunteering`} shortcut="E" />
                    </NavSection>

                    <NavSection title={t('nav_section.tools')}>
                        <NavItem icon={Shield} label={t('nav.data_security')} href={`/${locale}/dashboard/security`} />
                        <NavItem icon={Mic} label={t('nav.feedback_voice')} href={`/${locale}/dashboard/feedback`} />
                        <NavItem icon={Settings} label={t('nav.settings')} href={`/${locale}/dashboard/settings`} />
                        <AdminNavItem />
                    </NavSection>

                </Sidebar>

                {/* Main Content */}
                <main className="flex-1 min-w-0 p-8">
                    {children}
                </main>
            </div>

            {/* Persistent circular timer widget — top-right on all pages */}
            <PomodoroMiniWidget />

            {/* Morning Briefing overlay (once per day) */}
            <MorningBriefing />

            {/* Midday Mood Check-in overlay */}
            <MoodCheckInOverlay
                visible={showMoodOverlay}
                onDismiss={dismissMoodOverlay}
                onSkip={handleSkip}
                onSubmit={handleSubmit}
            />

            {/* Command Palette (Cmd+K) */}
            <CommandPalette />

            {/* Guided Tour Overlay — post-onboarding spotlight tutorial */}
            {tour.isActive && tour.step && (
                <GuidedTourOverlay
                    step={tour.step}
                    currentStep={tour.currentStep}
                    totalSteps={tour.totalSteps}
                    onNext={handleTourNext}
                    onSkip={handleTourSkip}
                />
            )}

        </>
    );
}

// ── Demo task cleanup helper ────────────────────────────────────
function cleanupDemoTask(taskId: string | null) {
    if (!taskId) return;

    // Remove from store
    const store = useCalendarStore.getState();
    store.removeTask(taskId);
    store.exitFocus();

    // Remove from DB (fire-and-forget)
    fetch(`/api/tasks?id=${taskId}`, { method: 'DELETE' }).catch(() => {});
}
