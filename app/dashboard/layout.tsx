"use client";

import { useEffect } from 'react';
import { Sidebar, NavSection, NavItem } from '@/components/motion/sidebar';
import { Home, Search, Inbox, BarChart3, Users, Heart, Shield, Settings } from 'lucide-react';
import { PomodoroMiniWidget } from './components/pomodoro-mini-widget';
import { usePathname } from 'next/navigation';
import { Toaster } from 'sonner';
import { MorningBriefing } from '@/components/dashboard/morning-briefing';
import { CommandPalette } from '@/components/dashboard/command-palette';
import { MoodCheckInOverlay } from '@/components/MoodCheckInOverlay';
import { useMoodCheckIn } from './hooks/useMoodCheckIn';
import { useJobQueueCount } from '@/store/use-job-queue-count';
import { useCalendarStore } from '@/store/use-calendar-store';

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();
    const { showOverlay: showMoodOverlay, dismiss: dismissMoodOverlay } = useMoodCheckIn();
    const { count: queueCount, setCount } = useJobQueueCount();
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
                    <NavSection title="Main">
                        <NavItem
                            icon={Home}
                            label="Today's Goals"
                            href="/dashboard"
                            isActive={pathname === '/dashboard'}
                            shortcut="G"
                        />
                        <NavItem icon={Search} label="Job Search" href="/dashboard/job-search" shortcut="S" />
                        <NavItem icon={Inbox} label="Job Queue" href="/dashboard/job-queue" shortcut="Q" />
                        <NavItem icon={BarChart3} label="Analytics" href="/dashboard/analytics" shortcut="A" />
                    </NavSection>

                    <NavSection title="Community">
                        <NavItem icon={Users} label="Community" href="/dashboard/community" shortcut="C" />
                        <NavItem icon={Heart} label="Ehrenamt" href="/dashboard/volunteering" shortcut="E" />
                    </NavSection>

                    <NavSection title="Tools">
                        <NavItem icon={Shield} label="Data Security" href="/dashboard/security" />
                        <NavItem icon={Settings} label="Settings" href="/dashboard/settings" />
                    </NavSection>

                </Sidebar>

                {/* Main Content */}
                <main className="flex-1 p-8">
                    {children}
                </main>
            </div>

            {/* Persistent circular timer widget — top-right on all pages */}
            <PomodoroMiniWidget />

            {/* Morning Briefing overlay (once per day) */}
            <MorningBriefing />

            {/* Midday Mood Check-in overlay (every 3 hours) */}
            <MoodCheckInOverlay visible={showMoodOverlay} onDismiss={dismissMoodOverlay} />

            {/* Command Palette (Cmd+K) */}
            <CommandPalette />

            <Toaster richColors position="top-right" offset={{ top: 72 }} />
        </>
    );
}
