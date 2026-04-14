'use client';

/**
 * useMoodCheckIn — Controls Mood Check-in Overlay + provides todayMood via Context.
 *
 * V2.2 — Trigger redesign:
 * - Overlay is shown based on the initial GET /api/mood/checkin response (mount).
 * - SIGNED_IN event was removed — it fired on page reloads and navigation,
 *   not just on explicit login, causing the overlay to appear on every load.
 * - Decision order:
 *   1. API returns showCheckin === false → never show (permanent disable)
 *   2. API returns todayMood !== null   → already checked in today → skip
 *   3. localStorage date key present    → already shown in this browser today → skip
 *   4. All clear → show overlay, set localStorage key
 * - Added handleNeverShow() — calls PATCH disable_forever → showCheckin = false
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

    // 1. On mount: fetch mood + visibility, then decide whether to show overlay.
    //    This replaces the SIGNED_IN trigger — overlay shows at most once per day
    //    regardless of how many times the user logs in or refreshes the page.
    useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                // Get the current user id for the localStorage key
                const supabase = createClient();
                const { data: { user } } = await supabase.auth.getUser();

                const res = await fetch('/api/mood/checkin');
                const data = await res.json();
                if (cancelled) return;

                // Update context
                if (data.todayMood != null) setTodayMood(data.todayMood);
                const checkinEnabled = data.showCheckin ?? true;
                if (!checkinEnabled) {
                    setShowCheckin(false);
                    return; // Permanently disabled → never show
                }

                if (data.todayMood != null) return; // Already checked in today (DB)

                // Check localStorage: only show once per day per browser
                if (user) {
                    const key = getCheckinKey(user.id);
                    if (localStorage.getItem(key)) return; // Already shown today
                    localStorage.setItem(key, 'true');
                }

                setShowOverlay(true);
            } catch {
                // Fail-open — don't block dashboard access
            }
        })();

        return () => { cancelled = true; };
    // Only run once on mount — setTodayMood is stable from context
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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

    // ─── Skip — progressive reduction (still kept for Jetzt nicht) ─
    const handleSkip = useCallback(async (): Promise<{ hidden: boolean }> => {
        setShowOverlay(false);
        try {
            const res = await fetch('/api/mood/checkin', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'skip' }),
            });
            const data = await res.json();
            if (data.hidden) setShowCheckin(false);
            return { hidden: data.hidden ?? false };
        } catch {
            return { hidden: false };
        }
    }, []);

    // ─── Never show again — permanent disable ─────────────────────
    const handleNeverShow = useCallback(async () => {
        setShowOverlay(false);
        setShowCheckin(false);
        try {
            await fetch('/api/mood/checkin', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'disable_forever' }),
            });
        } catch {
            // Silent fail — state already updated optimistically
        }
    }, []);

    // ─── Dismiss without action (backdrop click etc.) ─────────────
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
        handleNeverShow,
    };
}
