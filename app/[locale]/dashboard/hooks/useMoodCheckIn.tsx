'use client';

/**
 * useMoodCheckIn — Controls Mood Check-in Overlay + provides todayMood via Context.
 *
 * V2.3 — Server-Side Once-Per-Day Guard:
 *
 * ROOT CAUSE of bug: Previously, "dismissing" the overlay (backdrop click or
 * "Jetzt nicht") only updated localStorage. On new login, incognito, or a
 * different device, localStorage was empty → overlay appeared again.
 *
 * FIX: Every interaction now persists to the DB via last_checkin_interaction_at.
 * The GET endpoint returns this timestamp. The frontend compares it against
 * today's date in LOCAL timezone (toDateString) — immune to UTC/Europe drift.
 *
 * Decision order (priority):
 *   1. (Fast path)   localStorage key for today → skip (avoids API call on navigation)
 *   2. (Server path) lastInteractionAt is today (local TZ) → skip + set localStorage
 *   3. (Server path) showCheckin === false → permanent disable → skip
 *   4. (Server path) todayMood != null → already submitted today → skip
 *   5. All clear → show overlay, set localStorage, server timestamp will be set on dismiss
 */

import { useEffect, useState, useCallback, createContext, useContext, type ReactNode } from 'react';

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

// ─── Helper: user-independent daily localStorage key ──────────────
// Key is based ONLY on today's date so it works without waiting for user auth.
// This is browser-local only — fast-path guard for same-session navigation.
function getDailyCheckinKey(): string {
    return `pathly_checkin_shown_${new Date().toDateString()}`;
}

/**
 * Checks if a given ISO timestamp represents today in the browser's local timezone.
 * We use toDateString() which returns e.g. "Thu Apr 16 2026" — locale-independent
 * and correctly handles UTC timestamps stored in DB vs. European local time.
 */
function isToday(isoTimestamp: string | null): boolean {
    if (!isoTimestamp) return false;
    return new Date(isoTimestamp).toDateString() === new Date().toDateString();
}

// ─── Main Hook ───────────────────────────────────────────────────
export function useMoodCheckIn() {
    const [showOverlay, setShowOverlay] = useState(false);
    const [showCheckin, setShowCheckin] = useState(true);
    const { todayMood, setTodayMood } = useMoodCheckinContext();

    // 1. On mount: fetch mood + visibility + lastInteractionAt, then decide.
    useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                // ── Guard 1: localStorage (synchronous fast-path) ──────────────
                // Prevents API call on in-session page navigation.
                // NOT relied upon for cross-session/cross-device protection.
                const dailyKey = getDailyCheckinKey();
                if (typeof window !== 'undefined' && localStorage.getItem(dailyKey)) {
                    return;
                }

                // ── Guard 2+3+4: Server-side source of truth (DB) ─────────────
                const res = await fetch('/api/mood/checkin');
                const data = await res.json();
                if (cancelled) return;

                // Update context with DB mood value (used by other components)
                if (data.todayMood != null) setTodayMood(data.todayMood);

                // Guard 2: Server-backed once-per-day — the critical fix.
                // If the user interacted with the overlay at any point today
                // (on any device/session), lastInteractionAt will reflect that.
                if (isToday(data.lastInteractionAt)) {
                    // Also set localStorage so subsequent navigations are fast
                    if (typeof window !== 'undefined') {
                        localStorage.setItem(dailyKey, 'true');
                    }
                    return;
                }

                // Guard 3: Permanently disabled
                const checkinEnabled = data.showCheckin ?? true;
                if (!checkinEnabled) {
                    setShowCheckin(false);
                    return;
                }

                // Guard 4: Already submitted today (DB check via mood_checkins table)
                if (data.todayMood != null) return;

                // ── All guards passed → show overlay ──────────────────────────
                // Set localStorage for fast-path on same-session navigation.
                // The server timestamp will be set when the user interacts (dismiss/skip/submit).
                if (typeof window !== 'undefined') {
                    localStorage.setItem(dailyKey, 'true');
                }
                setShowOverlay(true);
            } catch {
                // Fail-open — don't block dashboard access on network error
            }
        })();

        return () => { cancelled = true; };
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
                // POST already sets last_checkin_interaction_at in DB (V2.3)
            }
        } catch {
            // Silent fail — user can retry
        }
    }, [setTodayMood]);

    // ─── Skip — "Jetzt nicht" button (increments skip streak) ─────
    const handleSkip = useCallback(async (): Promise<{ hidden: boolean }> => {
        setShowOverlay(false);
        try {
            const res = await fetch('/api/mood/checkin', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'skip' }),
                // PATCH 'skip' sets last_checkin_interaction_at in DB (V2.3)
            });
            const data = await res.json();
            if (data.hidden) setShowCheckin(false);
            return { hidden: data.hidden ?? false };
        } catch {
            return { hidden: false };
        }
    }, []);

    // ─── Dismiss — backdrop click or silent close (V2.3 CRITICAL FIX) ─
    // Previously: only called setShowOverlay(false) — no server update.
    // Now: fire-and-forget PATCH persists interaction to DB so ANY future
    // login or session today will not show the overlay again.
    // Does NOT increment skip_streak — user didn't explicitly refuse.
    const dismiss = useCallback(() => {
        setShowOverlay(false);
        // Fire-and-forget — do not await, do not block UI
        fetch('/api/mood/checkin', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'dismiss' }),
        }).catch(() => {
            // Silent fail — localStorage guard still prevents same-session re-show
            console.warn('[MoodCheckIn] dismiss: server update failed (non-critical)');
        });
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
