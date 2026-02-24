"use client";

import { CalendarOrchestrator } from './components/calendar/calendar-orchestrator';

export default function DashboardPage() {
    return (
        <div className="space-y-8">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-semibold text-[#37352F]">Today&apos;s Goals</h1>
                <p className="text-[#73726E] mt-1">Was machst du heute? Plane deinen Tag.</p>
            </div>

            {/* Calendar + Task System — the core of Today's Goals */}
            <CalendarOrchestrator />
        </div>
    );
}
