"use client";

import { Sidebar, NavSection, NavItem } from '@/components/motion/sidebar';
import { Home, Inbox, BarChart3, Shield, Settings } from 'lucide-react';
import { PomodoroCard } from './components/pomodoro-card';

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen bg-[#FAFAF9] flex">
            {/* Sidebar */}
            <Sidebar>
                <NavSection title="Main">
                    <NavItem icon={Home} label="Dashboard" href="/dashboard" isActive />
                    <NavItem icon={Inbox} label="Job Queue" href="/dashboard" badge={3} />
                    <NavItem icon={BarChart3} label="Analytics" href="/dashboard/analytics" />
                </NavSection>

                <NavSection title="Tools">
                    <NavItem icon={Shield} label="Data Security" href="/dashboard/security" />
                    <NavItem icon={Settings} label="Settings" href="/dashboard/settings" />
                </NavSection>

                <NavSection title="Focus" className="mt-auto">
                    <PomodoroCard />
                </NavSection>
            </Sidebar>

            {/* Main Content */}
            <main className="flex-1 ml-64 p-8">
                {children}
            </main>
        </div>
    );
}
