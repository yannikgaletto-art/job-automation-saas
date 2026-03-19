'use client';

/**
 * CheckinSettingsCard — Allows reactivating the mood check-in after auto-hide.
 *
 * Fetches show_checkin status and renders a reactivation row when hidden.
 * Uses the same PATCH /api/mood/checkin endpoint with action: 'reactivate'.
 * Analogous to LanguageToggleCard and ProfileCard (client component in server page).
 */

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

export function CheckinSettingsCard() {
    const t = useTranslations('mood');
    const [showCheckin, setShowCheckin] = useState<boolean | null>(null); // null = loading
    const [reactivating, setReactivating] = useState(false);

    // Fetch current show_checkin status
    useEffect(() => {
        fetch('/api/mood/checkin')
            .then(r => r.json())
            .then(data => {
                setShowCheckin(data.showCheckin ?? true);
            })
            .catch(() => setShowCheckin(true));
    }, []);

    // Don't render anything if check-in is active (not hidden)
    if (showCheckin === null || showCheckin === true) return null;

    const handleReactivate = async () => {
        setReactivating(true);
        try {
            const res = await fetch('/api/mood/checkin', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'reactivate' }),
            });
            const data = await res.json();
            if (data.reactivated) {
                setShowCheckin(true);
                // Clear today's localStorage guard for immediate overlay
                const keys = Object.keys(localStorage);
                const checkinKey = keys.find(k => k.startsWith('pathly_checkin_'));
                if (checkinKey) localStorage.removeItem(checkinKey);
            }
        } catch {
            // Silent — card stays visible for retry
        } finally {
            setReactivating(false);
        }
    };

    return (
        <div className="flex items-center justify-between p-4 bg-[#FAFAF9] rounded-xl border border-[#E7E7E5]">
            <div>
                <p className="text-sm font-medium text-[#37352F]">{t('checkin_reactivate')}</p>
                <p className="text-xs text-[#73726E] mt-0.5">{t('checkin_reactivate_desc')}</p>
            </div>
            <button
                onClick={handleReactivate}
                disabled={reactivating}
                className="px-4 py-2 bg-[#002e7a] text-white text-sm font-medium rounded-lg hover:bg-[#001d4f] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
                {reactivating ? '...' : t('checkin_reactivate')}
            </button>
        </div>
    );
}
