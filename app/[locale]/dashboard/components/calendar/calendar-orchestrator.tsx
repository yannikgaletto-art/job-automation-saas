'use client';

/**
 * Calendar Orchestrator — Combines Timeline + Inbox/Focus + DnD context.
 * Wraps everything with @dnd-kit DndContext and handles drop logic.
 * Supports both regular task drops AND pulse mission drops.
 * Responsive: 2-col on desktop, stacked on mobile.
 * Includes TouchSensor for mobile drag-and-drop.
 */

import { useEffect, useCallback } from 'react';
import {
    DndContext,
    DragEndEvent,
    PointerSensor,
    TouchSensor,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import { AnimatePresence } from 'framer-motion';
import { useCalendarStore, type PulseSuggestion } from '@/store/use-calendar-store';
import { TimelineGrid } from './timeline-grid';
import { TaskInbox } from './task-inbox';
import { FocusPanel } from './focus-panel';
import { FocusConfirmationModal } from './focus-confirmation-modal';
import { acceptSuggestionViaAPI } from './pulse-mission-panel';

export function CalendarOrchestrator() {
    const {
        setTasks,
        setLoading,
        scheduleTask,
        setPulseSuggestions,
        setPulseLoading,
        acceptSuggestion,
        exitFocus,
        tasks,
        pulseSuggestions,
        contextMode,
        focusedTaskId,
        showFocusConfirmation,
    } = useCalendarStore();

    // Safety: if localStorage restored a focus-mode state for a task that no longer
    // exists (e.g. deleted, or now filtered by 8-day cutoff), reset to inbox.
    // Without this, FocusPanel returns null and the right column is permanently blank.
    const focusedTaskExists = tasks.length > 0 && tasks.some((t) => t.id === focusedTaskId);
    const resolvedContextMode = contextMode === 'focus' && focusedTaskExists ? 'focus' : 'inbox';

    useEffect(() => {
        if (contextMode === 'focus' && tasks.length > 0 && !focusedTaskExists) {
            console.warn('[CalendarOrchestrator] Focused task not found in loaded tasks — resetting to inbox mode.');
            exitFocus();
        }
    }, [tasks, contextMode, focusedTaskExists]);

    // Configure DnD sensors — pointer for desktop, touch for mobile
    const pointerSensor = useSensor(PointerSensor, {
        activationConstraint: { distance: 5 },
    });
    const touchSensor = useSensor(TouchSensor, {
        activationConstraint: { delay: 200, tolerance: 5 },
    });
    const sensors = useSensors(pointerSensor, touchSensor);

    // Fetch tasks + pulse suggestions on mount
    useEffect(() => {
        async function fetchTasks() {
            setLoading(true);
            try {
                const res = await fetch('/api/tasks');
                const data = await res.json();
                if (data.success && data.tasks) {
                    setTasks(data.tasks);
                }
            } catch (err) {
                console.error('Failed to fetch tasks:', err);
            } finally {
                setLoading(false);
            }
        }

        async function fetchPulseSuggestions() {
            setPulseLoading(true);
            try {
                const res = await fetch('/api/pulse/generate');
                const data = await res.json();
                if (data.success && data.suggestions) {
                    setPulseSuggestions(data.suggestions);
                }
            } catch (err) {
                console.error('Failed to fetch pulse suggestions:', err);
            } finally {
                setPulseLoading(false);
            }
        }

        fetchTasks();
        fetchPulseSuggestions();
    }, []);

    // ─── Drop Handler ──────────────────────────────────────────────
    // Handles both regular task drops AND pulse mission drops.
    // Pulse missions: auto-accept → create task → schedule at drop position.

    const handleDragEnd = useCallback(
        async (event: DragEndEvent) => {
            const { active, over } = event;
            if (!over) return;

            // Parse drop zone: "slot-HH:MM"
            const slotMatch = (over.id as string).match(/^slot-(\d{1,2}):(\d{2})$/);
            if (!slotMatch) return;

            const hour = parseInt(slotMatch[1]);
            const minute = parseInt(slotMatch[2]);

            // ─── Check if this is a Pulse Mission drag ─────────────
            const dragData = active.data?.current;
            const isPulseDrag = dragData?.type === 'pulse';

            let taskId: string;
            let estimatedMinutes: number;

            if (isPulseDrag) {
                // Pulse Mission: accept first, then schedule
                const suggestion = dragData.suggestion as PulseSuggestion;
                try {
                    const task = await acceptSuggestionViaAPI(suggestion);
                    acceptSuggestion(suggestion, task);
                    taskId = task.id;
                    estimatedMinutes = task.estimated_minutes;
                } catch {
                    return;
                }
            } else {
                // Regular task drag
                taskId = active.id as string;
                const task = tasks.find((t) => t.id === taskId);
                if (!task) return;
                estimatedMinutes = task.estimated_minutes;
            }

            // Build local time for today
            const today = new Date();
            const startLocal = new Date(today.getFullYear(), today.getMonth(), today.getDate(), hour, minute);
            const endLocal = new Date(startLocal.getTime() + estimatedMinutes * 60000);

            // Check for collisions
            const scheduledTasks = tasks.filter(
                (t) => t.id !== taskId && ['scheduled', 'focus', 'in_progress'].includes(t.status) && t.scheduled_start
            );

            const hasCollision = scheduledTasks.some((t) => {
                const tStart = new Date(t.scheduled_start!);
                const tEnd = t.scheduled_end ? new Date(t.scheduled_end) : new Date(tStart.getTime() + t.estimated_minutes * 60000);
                return startLocal < tEnd && endLocal > tStart;
            });

            if (hasCollision) {
                // Try push-down: find next free slot
                let pushed = new Date(startLocal);
                let foundFree = false;

                for (let attempt = 0; attempt < 24; attempt++) {
                    pushed = new Date(pushed.getTime() + 30 * 60000); // +30 min
                    const pushedEnd = new Date(pushed.getTime() + estimatedMinutes * 60000);

                    if (pushed.getHours() >= 20) break; // Out of range

                    const stillCollides = scheduledTasks.some((t) => {
                        const tStart = new Date(t.scheduled_start!);
                        const tEnd = t.scheduled_end ? new Date(t.scheduled_end) : new Date(tStart.getTime() + t.estimated_minutes * 60000);
                        return pushed < tEnd && pushedEnd > tStart;
                    });

                    if (!stillCollides) {
                        const hh = pushed.getHours().toString().padStart(2, '0');
                        const mm = pushed.getMinutes().toString().padStart(2, '0');
                        startLocal.setTime(pushed.getTime());
                        endLocal.setTime(pushed.getTime() + estimatedMinutes * 60000);
                        foundFree = true;
                        break;
                    }
                }

                if (!foundFree) {
                    return;
                }
            }

            // Convert local → ISO (browser handles timezone offset automatically)
            const startISO = startLocal.toISOString();
            const endISO = endLocal.toISOString();

            // Optimistic update
            scheduleTask(taskId, startISO, endISO);

            // Sync to DB
            try {
                await fetch('/api/tasks', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id: taskId,
                        status: 'scheduled',
                        scheduled_start: startISO,
                        scheduled_end: endISO,
                    }),
                });
            } catch {
                // Rollback handled by store if needed
            }
        },
        [tasks, scheduleTask, acceptSuggestion, pulseSuggestions]
    );

    return (
        <>
            <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
                {/* CRITICAL LAYOUT — ratio-based flex via inline styles.
                    Inline styles bypass Tailwind compilation entirely.
                    Both panels always share available space proportionally. */}
                <div className="flex gap-6 items-start">
                    {/* Calendar — 55 parts of available space */}
                    <div className="min-w-0" style={{ flex: '55 1 0%' }}>
                        <TimelineGrid />
                    </div>

                    {/* Tasks — 45 parts */}
                    <div className="min-w-0" style={{ flex: '45 1 0%' }}>
                        <AnimatePresence mode="wait">
                            {resolvedContextMode === 'focus' && focusedTaskId ? (
                                <FocusPanel key="focus" />
                            ) : (
                                <TaskInbox key="inbox" />
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </DndContext>

            {/* Focus Confirmation Modal (portal) */}
            {showFocusConfirmation && <FocusConfirmationModal />}
        </>
    );
}

