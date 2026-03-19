"use client";

import { useEffect, useState } from 'react';
import { Sidebar, NavSection, NavItem } from '@/components/motion/sidebar';
import { Home, Search, Inbox, BarChart3, Users, Heart, Shield, Settings, MessageSquare } from 'lucide-react';
import { PomodoroMiniWidget } from './components/pomodoro-mini-widget';
import { usePathname } from '@/i18n/navigation';
import { useLocale, useTranslations } from 'next-intl';

import { MorningBriefing } from '@/components/dashboard/morning-briefing';
import { CommandPalette } from '@/components/dashboard/command-palette';
import { MoodCheckInOverlay } from '@/components/MoodCheckInOverlay';
import { useMoodCheckIn, MoodCheckinProvider } from './hooks/useMoodCheckIn';
import { useJobQueueCount } from '@/store/use-job-queue-count';
import { useCalendarStore } from '@/store/use-calendar-store';
import { createClient } from '@/lib/supabase/client';

const ADMIN_EMAILS = ['galettoyannik7@gmail.com', 'yannik.galetto@gmail.com'];

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


        </>
    );
}
