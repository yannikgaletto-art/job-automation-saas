'use client';

/**
 * useMoodCheckIn — Controls visibility of the MoodCheckInOverlay.
 *
 * Contract (SICHERHEITSARCHITEKTUR.md Section 5):
 * - Modal appears ONLY on explicit SIGNED_IN event from onAuthStateChange
 * - localStorage key `pathly_checkin_{userId}_{date}` prevents re-appearing
 * - Never fires on TOKEN_REFRESHED, getSession(), or page reload
 * - Falls back silently on any error — never blocks dashboard access
 *
 * BUG-B Fix (Batch 6): Replaced sessionStorage with localStorage and
 * switched from getSession() polling to onAuthStateChange event listener.
 */

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

export function useMoodCheckIn() {
    const [showOverlay, setShowOverlay] = useState(false);

    useEffect(() => {
        const supabase = createClient();

        // Listen ONLY for explicit auth state changes — not cached sessions
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            // BUG-B Fix: ONLY fire on explicit sign-in, never on TOKEN_REFRESHED or INITIAL_SESSION
            if (event !== 'SIGNED_IN') return;
            if (!session?.user) return;

            const userId = session.user.id;

            // localStorage guard — survives tab close (unlike sessionStorage)
            const CHECKIN_KEY = `pathly_checkin_${userId}_${new Date().toDateString()}`;
            const alreadyShown = localStorage.getItem(CHECKIN_KEY);
            if (alreadyShown) return;

            // Mark as shown immediately to prevent race conditions
            localStorage.setItem(CHECKIN_KEY, 'true');
            setShowOverlay(true);
        });

        return () => subscription.unsubscribe();
    }, []);

    const dismiss = useCallback(() => {
        setShowOverlay(false);
    }, []);

    return { showOverlay, dismiss };
}
