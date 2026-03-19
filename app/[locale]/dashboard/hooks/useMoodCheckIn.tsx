'use client';

/**
 * useMoodCheckIn — Controls Mood Check-in Overlay + provides todayMood via Context.
 *
 * Contract (SICHERHEITSARCHITEKTUR.md Section 5):
 * - Modal appears ONLY on explicit SIGNED_IN event from onAuthStateChange
 * - localStorage key `pathly_checkin_{userId}_{date}` prevents re-appearing
 * - Never fires on TOKEN_REFRESHED, getSession(), or page reload
 * - Falls back silently on any error — never blocks dashboard access
 *
 * V2 additions:
 * - todayMood: number | null — fetched via GET /api/mood/checkin
 * - showCheckin: boolean — from user_profiles.show_checkin
 * - handleSkip() — PATCH with action: 'skip', progressive reduction
 * - MoodCheckinContext — shared via layout.tsx, consumed by page.tsx
 *
 * BUG-B Fix (Batch 6): Replaced sessionStorage with localStorage and
 * switched from getSession() polling to onAuthStateChange event listener.
 *
 * QA Fix (V2.1): Auth useEffect uses refs for todayMood/showCheckin to
 * prevent subscription recreation (and memory leaks) on every state change.
 */

import { useEffect, useState, useCallback, useRef, createContext, useContext, type ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';

// ─── Context ──────────────────────────────────────────────────────
interface MoodCheckinContextValue {
    todayMood: number | null;
    setTodayMood: (mood: number | null) => void;
}

const MoodCheckinCtx = createContext<MoodCheckinContextValue>({
    todayMood: null,
    setTodayMood: () => {},
});

export function useMoodCheckinContext() {
    return useContext(MoodCheckinCtx);
}

// ─── Provider (rendered in layout.tsx) ────────────────────────────
export function MoodCheckinProvider({ children }: { children: ReactNode }) {
    const [todayMood, setTodayMood] = useState<number | null>(null);
    return (
        <MoodCheckinCtx.Provider value={{ todayMood, setTodayMood }}>
            {children}
        </MoodCheckinCtx.Provider>
    );
}

// ─── Helper: build today's localStorage key ──────────────────────
function getCheckinKey(userId: string): string {
    return `pathly_checkin_${userId}_${new Date().toDateString()}`;
}

// ─── Main Hook ───────────────────────────────────────────────────
export function useMoodCheckIn() {
    const [showOverlay, setShowOverlay] = useState(false);
    const [showCheckin, setShowCheckin] = useState(true);
    const { todayMood, setTodayMood } = useMoodCheckinContext();
    const [userId, setUserId] = useState<string | null>(null);

    // Refs to hold current values inside the stable auth subscription closure
    // (avoids re-creating the subscription whenever these states change)
    const todayMoodRef = useRef(todayMood);
    const showCheckinRef = useRef(showCheckin);

    useEffect(() => { todayMoodRef.current = todayMood; }, [todayMood]);
    useEffect(() => { showCheckinRef.current = showCheckin; }, [showCheckin]);

    // 1. Fetch today's mood + show_checkin status on mount (once)
    useEffect(() => {
        fetch('/api/mood/checkin')
            .then(r => r.json())
            .then(data => {
                if (data.todayMood != null) setTodayMood(data.todayMood);
                if (data.showCheckin != null) setShowCheckin(data.showCheckin);
            })
            .catch(() => {
                // Fail-open: defaults are fine (no mood, show overlay)
            });
    // Only run on mount — setTodayMood is stable from context
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // 2. Listen for SIGNED_IN — single stable subscription (no state deps)
    useEffect(() => {
        const supabase = createClient();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (event !== 'SIGNED_IN') return;
            if (!session?.user) return;

            const uid = session.user.id;
            setUserId(uid);

            // Read current values from refs — avoids stale closure without re-subscribing
            if (todayMoodRef.current !== null) return;
            if (!showCheckinRef.current) return;

            const CHECKIN_KEY = getCheckinKey(uid);
            const alreadyShown = localStorage.getItem(CHECKIN_KEY);
            if (alreadyShown) return;

            localStorage.setItem(CHECKIN_KEY, 'true');
            setShowOverlay(true);
        });

        // Cleanup: only unsubscribes this single subscription
        return () => subscription.unsubscribe();
    }, []); // Empty deps — intentional: single lifecycle subscription

    // ─── Submit mood ──────────────────────────────────────────────
    const handleSubmit = useCallback(async (score: number) => {
        try {
            const res = await fetch('/api/mood/checkin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mood: score, context: 'midday' }),
            });
            if (res.ok) {
                setTodayMood(score);
                setShowOverlay(false);
            }
        } catch {
            // Silent fail — user can retry
        }
    }, [setTodayMood]);

    // ─── Skip — progressive reduction ─────────────────────────────
    const handleSkip = useCallback(async (): Promise<{ hidden: boolean }> => {
        setShowOverlay(false);
        try {
            const res = await fetch('/api/mood/checkin', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'skip' }),
            });
            const data = await res.json();
            if (data.hidden) {
                setShowCheckin(false);
            }
            return { hidden: data.hidden ?? false };
        } catch {
            return { hidden: false };
        }
    }, []);

    // ─── Dismiss without skip (used by onDismiss fallback) ────────
    const dismiss = useCallback(() => {
        setShowOverlay(false);
    }, []);

    return {
        showOverlay,
        dismiss,
        todayMood,
        showCheckin,
        handleSubmit,
        handleSkip,
    };
}
