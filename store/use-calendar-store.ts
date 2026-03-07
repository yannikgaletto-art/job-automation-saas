/**
 * Zustand store for Calendar/Task state management.
 * Follows existing store pattern (store/use-onboarding-store.ts).
 * Optimistic UI: updates local state immediately, syncs to DB in background.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ─── Types ────────────────────────────────────────────────────────

export type TaskStatus = 'inbox' | 'scheduled' | 'focus' | 'in_progress' | 'completed' | 'carry_over';

export interface PulseSuggestion {
    id: string;
    title: string;
    estimated_minutes: number;
    priority: 'high' | 'medium' | 'low';
    category: 'review' | 'action' | 'setup';
    job_queue_id: string | null;
    deep_link: string;
    icon: string;
}

export interface CalendarTask {
    id: string;
    user_id: string;
    job_queue_id: string | null;
    title: string;
    estimated_minutes: number;
    status: TaskStatus;
    scheduled_start: string | null; // ISO string (UTC in DB, local in UI)
    scheduled_end: string | null;
    pomodoros_completed: number;
    notes: string | null;
    completed_at: string | null;
    progress_percent: number | null;
    progress_note: string | null;
    carry_over_to: string | null;
    carry_over_count: number;
    source?: 'manual' | 'pulse' | 'coaching';
    created_at: string;
    updated_at: string;
}

interface CalendarState {
    // State
    tasks: CalendarTask[];
    focusedTaskId: string | null;
    showFocusConfirmation: boolean;
    pendingFocusTaskId: string | null;
    isLoading: boolean;
    contextMode: 'inbox' | 'focus'; // Right column mode
    pomodoroDuration: number; // 25 or 50 minutes
    autoStartTimer: boolean; // Auto-start timer on focus confirm

    // Pulse Board state
    pulseSuggestions: PulseSuggestion[];
    pulseLoading: boolean;

    // ── Persistent Pomodoro Timer State ──────────────────────────
    timerTimeRemaining: number;    // seconds left
    timerIsActive: boolean;
    timerMode: 'focus' | 'break';
    timerTotalTime: number;        // total seconds for current phase
    timerSessions: number;         // completed focus sessions

    // Actions
    setTasks: (tasks: CalendarTask[]) => void;
    addTask: (task: CalendarTask) => void;
    updateTask: (id: string, updates: Partial<CalendarTask>) => void;
    removeTask: (id: string) => void;

    // Scheduling
    scheduleTask: (id: string, start: string, end: string) => void;
    unscheduleTask: (id: string) => void;

    // Focus mode
    requestFocus: (taskId: string) => void;
    confirmFocus: () => void;
    cancelFocus: () => void;
    exitFocus: () => void;
    setPomodoroDuration: (minutes: number) => void;

    // Timer actions
    timerToggle: () => void;
    timerTick: () => void;
    timerSkip: () => void;
    timerSetDuration: (minutes: 25 | 50) => void;

    // Progress
    updateProgress: (id: string, percent: number | null, note: string | null) => void;
    completeTask: (id: string) => void;
    carryOverTask: (id: string, progressPercent?: number | null, progressNote?: string | null) => void;

    // Pulse Board
    setPulseSuggestions: (suggestions: PulseSuggestion[]) => void;
    setPulseLoading: (loading: boolean) => void;
    dismissSuggestion: (id: string) => void;
    acceptSuggestion: (suggestion: PulseSuggestion, task: CalendarTask) => void;

    // Helpers
    setLoading: (loading: boolean) => void;
    getInboxTasks: () => CalendarTask[];
    getScheduledTasks: () => CalendarTask[];
    getTodayTasks: () => CalendarTask[];
}

// ─── Store ────────────────────────────────────────────────────────

export const useCalendarStore = create<CalendarState>()(
    persist(
        (set, get) => ({
            // Initial state
            tasks: [],
            focusedTaskId: null,
            showFocusConfirmation: false,
            pendingFocusTaskId: null,
            isLoading: false,
            contextMode: 'inbox',
            pomodoroDuration: 25,
            autoStartTimer: false,
            pulseSuggestions: [],
            pulseLoading: false,

            // Timer initial state (25-min focus)
            timerTimeRemaining: 25 * 60,
            timerIsActive: false,
            timerMode: 'focus',
            timerTotalTime: 25 * 60,
            timerSessions: 0,

            // Basic CRUD
            setTasks: (tasks) => set({ tasks }),
            addTask: (task) => set((state) => ({ tasks: [...state.tasks, task] })),
            updateTask: (id, updates) =>
                set((state) => ({
                    tasks: state.tasks.map((t) =>
                        t.id === id ? { ...t, ...updates, updated_at: new Date().toISOString() } : t
                    ),
                })),
            removeTask: (id) =>
                set((state) => ({ tasks: state.tasks.filter((t) => t.id !== id) })),

            // Scheduling (optimistic)
            scheduleTask: (id, start, end) =>
                set((state) => ({
                    tasks: state.tasks.map((t) =>
                        t.id === id
                            ? { ...t, status: 'scheduled' as TaskStatus, scheduled_start: start, scheduled_end: end, updated_at: new Date().toISOString() }
                            : t
                    ),
                })),
            unscheduleTask: (id) =>
                set((state) => ({
                    tasks: state.tasks.map((t) =>
                        t.id === id
                            ? { ...t, status: 'inbox' as TaskStatus, scheduled_start: null, scheduled_end: null, updated_at: new Date().toISOString() }
                            : t
                    ),
                })),

            // Focus mode
            requestFocus: (taskId) =>
                set({ showFocusConfirmation: true, pendingFocusTaskId: taskId }),
            confirmFocus: () =>
                set((state) => ({
                    focusedTaskId: state.pendingFocusTaskId,
                    showFocusConfirmation: false,
                    pendingFocusTaskId: null,
                    contextMode: 'focus',
                    autoStartTimer: true,
                    tasks: state.tasks.map((t) =>
                        t.id === state.pendingFocusTaskId
                            ? { ...t, status: 'focus' as TaskStatus, updated_at: new Date().toISOString() }
                            : t
                    ),
                })),
            cancelFocus: () =>
                set({ showFocusConfirmation: false, pendingFocusTaskId: null }),
            exitFocus: () =>
                set({ focusedTaskId: null, contextMode: 'inbox', autoStartTimer: false }),
            setPomodoroDuration: (minutes) => set({ pomodoroDuration: minutes }),

            // Timer actions
            timerToggle: () => set((s) => ({ timerIsActive: !s.timerIsActive })),
            timerTick: () => {
                const s = get();
                if (!s.timerIsActive) return;
                if (s.timerTimeRemaining > 1) {
                    set({ timerTimeRemaining: s.timerTimeRemaining - 1 });
                } else {
                    // Phase transition
                    if (s.timerMode === 'focus') {
                        const breakDuration = s.pomodoroDuration === 25 ? 5 * 60 : 10 * 60;
                        set({
                            timerMode: 'break',
                            timerTimeRemaining: breakDuration,
                            timerTotalTime: breakDuration,
                            timerIsActive: false,
                            timerSessions: s.timerSessions + 1,
                        });
                    } else {
                        const focusDuration = s.pomodoroDuration * 60;
                        set({
                            timerMode: 'focus',
                            timerTimeRemaining: focusDuration,
                            timerTotalTime: focusDuration,
                            timerIsActive: false,
                        });
                    }
                }
            },
            timerSkip: () => {
                const s = get();
                if (s.timerMode === 'focus') {
                    const breakDuration = s.pomodoroDuration === 25 ? 5 * 60 : 10 * 60;
                    set({ timerMode: 'break', timerTimeRemaining: breakDuration, timerTotalTime: breakDuration, timerIsActive: false, timerSessions: s.timerSessions + 1 });
                } else {
                    const focusDuration = s.pomodoroDuration * 60;
                    set({ timerMode: 'focus', timerTimeRemaining: focusDuration, timerTotalTime: focusDuration, timerIsActive: false });
                }
            },
            timerSetDuration: (minutes) => {
                set({ pomodoroDuration: minutes, timerTimeRemaining: minutes * 60, timerTotalTime: minutes * 60, timerIsActive: false, timerMode: 'focus' });
            },

            // Progress
            updateProgress: (id, percent, note) =>
                set((state) => ({
                    tasks: state.tasks.map((t) =>
                        t.id === id
                            ? { ...t, progress_percent: percent, progress_note: note, updated_at: new Date().toISOString() }
                            : t
                    ),
                })),
            completeTask: (id) =>
                set((state) => ({
                    focusedTaskId: state.focusedTaskId === id ? null : state.focusedTaskId,
                    contextMode: state.focusedTaskId === id ? 'inbox' : state.contextMode,
                    tasks: state.tasks.map((t) =>
                        t.id === id
                            ? { ...t, status: 'completed' as TaskStatus, progress_percent: 100, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }
                            : t
                    ),
                })),
            carryOverTask: (id, progressPercent, progressNote) => {
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                const tomorrowStr = tomorrow.toISOString().split('T')[0];

                set((state) => ({
                    focusedTaskId: state.focusedTaskId === id ? null : state.focusedTaskId,
                    contextMode: state.focusedTaskId === id ? 'inbox' : state.contextMode,
                    tasks: state.tasks.map((t) =>
                        t.id === id
                            ? {
                                ...t,
                                status: 'carry_over' as TaskStatus,
                                carry_over_to: tomorrowStr,
                                carry_over_count: t.carry_over_count + 1,
                                progress_percent: progressPercent ?? t.progress_percent,
                                progress_note: progressNote ?? t.progress_note,
                                updated_at: new Date().toISOString(),
                            }
                            : t
                    ),
                }));
            },

            // Pulse Board
            setPulseSuggestions: (suggestions) => set({ pulseSuggestions: suggestions }),
            setPulseLoading: (loading) => set({ pulseLoading: loading }),
            dismissSuggestion: (id) =>
                set((state) => ({ pulseSuggestions: state.pulseSuggestions.filter((s) => s.id !== id) })),
            acceptSuggestion: (suggestion, task) =>
                set((state) => ({
                    pulseSuggestions: state.pulseSuggestions.filter((s) => s.id !== suggestion.id),
                    tasks: [...state.tasks, task],
                })),

            // Helpers
            setLoading: (loading) => set({ isLoading: loading }),
            getInboxTasks: () => get().tasks.filter((t) => t.status === 'inbox'),
            getScheduledTasks: () =>
                get().tasks.filter((t) => ['scheduled', 'focus', 'in_progress'].includes(t.status)),
            getTodayTasks: () => {
                const today = new Date().toISOString().split('T')[0];
                return get().tasks.filter((t) => {
                    if (t.status === 'inbox') return true;
                    if (t.status === 'carry_over' && t.carry_over_to === today) return true;
                    if (t.scheduled_start && t.scheduled_start.startsWith(today)) return true;
                    return false;
                });
            },
        }),
        {
            name: 'pathly-calendar-v1',
            // Only persist essential state — loading/pulse is re-fetched on mount
            partialize: (state) => ({
                tasks: state.tasks,
                focusedTaskId: state.focusedTaskId,
                contextMode: state.contextMode,
                pomodoroDuration: state.pomodoroDuration,
                timerTimeRemaining: state.timerTimeRemaining,
                timerIsActive: state.timerIsActive,
                timerMode: state.timerMode,
                timerTotalTime: state.timerTotalTime,
                timerSessions: state.timerSessions,
            }),
        }
    )
);

