'use client';

/**
 * useMoodCheckIn — Controls visibility of the MoodCheckInOverlay.
 *
 * Contract (SICHERHEITSARCHITEKTUR.md Section 5):
 * - Modal appears ONLY on first dashboard visit after a fresh login (< 60s ago)
 * - sessionStorage key `pathly_checkin_{userId}_{date}` prevents re-appearing on reload
 * - Falls back silently on any error — never blocks dashboard access
 */

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

export function useMoodCheckIn() {
    const [showOverlay, setShowOverlay] = useState(false);

    const checkIfDue = useCallback(async () => {
        try {
            const supabase = createClient();
            const { data } = await supabase.auth.getSession();
            const session = data.session;
            if (!session?.user) return;

            const userId = session.user.id;

            // ✅ sessionStorage guard — only show once per login-session per day
            // (SICHERHEITSARCHITEKTUR.md Section 5)
            const CHECKIN_KEY = `pathly_checkin_${userId}_${new Date().toDateString()}`;
            const alreadyShown = sessionStorage.getItem(CHECKIN_KEY);
            if (alreadyShown) return; // Already shown this session — do not show again

            // ✅ Only show on fresh login (last_sign_in_at < 60 seconds ago)
            const lastSignIn = new Date(session.user.last_sign_in_at ?? 0);
            const isRecentLogin = Date.now() - lastSignIn.getTime() < 60_000;
            if (!isRecentLogin) return; // Not a fresh login — skip modal

            // Mark as shown immediately (before setShowOverlay) to prevent race conditions
            sessionStorage.setItem(CHECKIN_KEY, 'true');
            setShowOverlay(true);
        } catch (err) {
            console.error('[useMoodCheckIn] Check failed:', err);
            // Non-blocking — never prevent dashboard from loading
        }
    }, []);

    useEffect(() => {
        // Short delay to let the page render first
        const initialTimeout = setTimeout(checkIfDue, 2000);
        return () => clearTimeout(initialTimeout);
        // No polling interval — sessionStorage guard makes recurring checks unnecessary
    }, [checkIfDue]);

    const dismiss = useCallback(() => {
        setShowOverlay(false);
    }, []);

    return { showOverlay, dismiss };
}
