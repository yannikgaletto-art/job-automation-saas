"use client";

import { Sidebar, NavSection, NavItem } from '@/components/motion/sidebar';
import { Home, Search, Inbox, BarChart3, Shield, Settings, ChevronRight } from 'lucide-react';
import { PomodoroCard } from './components/pomodoro-card';
import { usePathname } from 'next/navigation';
import { Toaster } from 'sonner';
import { MorningBriefing } from '@/components/dashboard/morning-briefing';
import { CommandPalette } from '@/components/dashboard/command-palette';
import { useCalendarStore } from '@/store/use-calendar-store';
import { motion, AnimatePresence } from 'framer-motion';

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();
    const contextMode = useCalendarStore((s) => s.contextMode);
    const focusedTaskId = useCalendarStore((s) => s.focusedTaskId);
    const isFocusMode = contextMode === 'focus' && focusedTaskId !== null;

    return (
        <>
            <div className="min-h-screen bg-[#FAFAF9] flex">
                {/* Sidebar — auto-hides in focus mode */}
                <Sidebar collapsed={isFocusMode}>
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

                    <NavSection title="Tools">
                        <NavItem icon={Shield} label="Data Security" href="/dashboard/security" />
                        <NavItem icon={Settings} label="Settings" href="/dashboard/settings" />
                    </NavSection>

                    <NavSection title="Focus" className="mt-auto">
                        <PomodoroCard />
                    </NavSection>
                </Sidebar>

                {/* Sidebar re-open handle when collapsed */}
                <AnimatePresence>
                    {isFocusMode && (
                        <motion.button
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -10 }}
                            onClick={() => useCalendarStore.getState().exitFocus()}
                            className="fixed left-2 top-1/2 -translate-y-1/2 z-40 w-6 h-12 bg-white border border-[#E7E7E5] rounded-r-lg shadow-sm flex items-center justify-center text-[#A8A29E] hover:text-[#002e7a] transition-colors"
                            title="Sidebar einblenden"
                        >
                            <ChevronRight className="w-3 h-3" />
                        </motion.button>
                    )}
                </AnimatePresence>

                {/* Main Content — adjusts margin when sidebar collapses */}
                <motion.main
                    className="flex-1 p-8"
                    animate={{ marginLeft: isFocusMode ? 0 : 256 }}
                    transition={{ duration: 0.3, ease: 'easeInOut' }}
                >
                    {children}
                </motion.main>
            </div>

            {/* Morning Briefing overlay (once per day) */}
            <MorningBriefing />

            {/* Command Palette (Cmd+K) */}
            <CommandPalette />

            <Toaster richColors position="top-right" />
        </>
    );
}
