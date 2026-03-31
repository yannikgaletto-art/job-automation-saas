'use client';

/**
 * TourResetCard — displayed in Settings.
 * Allows the user to replay any completed tour.
 * Deletes localStorage flags for all known tour IDs.
 */

import { useState } from 'react';
import { RotateCcw, CheckCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';

const TOUR_KEYS = [
    'pathly_tour_completed_goals',
    'pathly_tour_completed_job-queue',
    // Future tabs: 'pathly_tour_completed_coaching', 'pathly_tour_completed_job-search'
];

export function TourResetCard() {
    const [done, setDone] = useState(false);
    const t = useTranslations('settings');

    function handleReset() {
        TOUR_KEYS.forEach((key) => localStorage.removeItem(key));
        setDone(true);
        // Reset done-state after 3s so the button is usable again
        setTimeout(() => setDone(false), 3000);
    }

    return (
        <div className="flex items-center justify-between p-4 rounded-xl border border-[#E7E7E5] bg-[#FAFAF9]">
            <div className="flex items-start gap-3">
                <div className="p-1.5 rounded-lg bg-[#f0f4ff] mt-0.5">
                    <RotateCcw className="w-4 h-4 text-[#002e7a]" />
                </div>
                <div>
                    <p className="text-sm font-medium text-[#37352F]">{t('tours.title')}</p>
                    <p className="text-xs text-[#73726E] mt-0.5">{t('tours.description')}</p>
                </div>
            </div>
            <button
                onClick={handleReset}
                disabled={done}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-70
                    bg-white border border-[#E7E7E5] text-[#37352F] hover:border-[#002e7a] hover:text-[#002e7a]"
            >
                {done ? (
                    <>
                        <CheckCircle className="w-3.5 h-3.5 text-green-600" />
                        {t('tours.reset_done')}
                    </>
                ) : (
                    <>
                        <RotateCcw className="w-3.5 h-3.5" />
                        {t('tours.reset_btn')}
                    </>
                )}
            </button>
        </div>
    );
}
