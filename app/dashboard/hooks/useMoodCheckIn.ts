'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

const THREE_HOURS_MS = 3 * 60 * 60 * 1000;
const POLL_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

export function useMoodCheckIn() {
    const [showOverlay, setShowOverlay] = useState(false);

    const checkIfDue = useCallback(async () => {
        try {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data: settings } = await supabase
                .from('user_settings')
                .select('last_mood_checkin_at')
                .eq('user_id', user.id)
                .maybeSingle();

            const lastCheckin = settings?.last_mood_checkin_at;

            if (!lastCheckin) {
                setShowOverlay(true);
                return;
            }

            const elapsed = Date.now() - new Date(lastCheckin).getTime();
            if (elapsed >= THREE_HOURS_MS) {
                setShowOverlay(true);
            }
        } catch (err) {
            console.error('[useMoodCheckIn] Check failed:', err);
        }
    }, []);

    useEffect(() => {
        // Initial check after a short delay (let the page render first)
        const initialTimeout = setTimeout(checkIfDue, 2000);

        // Poll every 30 minutes
        const interval = setInterval(checkIfDue, POLL_INTERVAL_MS);

        return () => {
            clearTimeout(initialTimeout);
            clearInterval(interval);
        };
    }, [checkIfDue]);

    const dismiss = useCallback(() => {
        setShowOverlay(false);
    }, []);

    return { showOverlay, dismiss };
}
