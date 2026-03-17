"use client";

import { useTranslations } from 'next-intl';
import { CalendarOrchestrator } from './components/calendar/calendar-orchestrator';

export default function DashboardPage() {
    const t = useTranslations('dashboard.todays_goals');
    return (
        <div className="space-y-8">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-semibold text-[#37352F]">{t('title')}</h1>
                <p className="text-[#73726E] mt-1">{t('subtitle')}</p>
            </div>

            {/* Calendar + Task System — the core of Today's Goals */}
            <CalendarOrchestrator />
        </div>
    );
}
