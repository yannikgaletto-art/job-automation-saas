'use client';

/**
 * Timeline Grid — Left column of the calendar.
 * Renders 0:00–23:30 (48 half-hour slots) in a scrollable container.
 * Automatically scrolls to current time on mount.
 * Red "now" line like Google Calendar.
 * Scheduled tasks appear as blocks with progress bars.
 * Double-click on empty slot to create task inline.
 * Resize handle at bottom of blocks to change duration.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { motion } from 'framer-motion';
import { CheckCircle2, GripHorizontal, Calendar, Trash2, Timer } from 'lucide-react';
import { useCalendarStore, type CalendarTask } from '@/store/use-calendar-store';

const HOURS = Array.from({ length: 24 }, (_, i) => i); // 0:00 to 23:00
const SLOT_HEIGHT = 48; // px per 30min slot → 96px per hour

// ─── Drop Zone (per half-hour slot) ──────────────────────────────

function TimeSlot({
    hour,
    half,
    onDoubleClick,
}: {
    hour: number;
    half: 0 | 30;
    onDoubleClick: (hour: number, minute: number) => void;
}) {
    const slotId = `slot-${hour}:${half === 0 ? '00' : '30'}`;
    const { setNodeRef, isOver } = useDroppable({ id: slotId });

    return (
        <div
            ref={setNodeRef}
            onDoubleClick={() => onDoubleClick(hour, half)}
            className={`h-[${SLOT_HEIGHT}px] border-b border-dashed border-[#E7E7E5]/40 transition-colors cursor-pointer hover:bg-[#002e7a]/[0.02] ${isOver ? 'bg-[#002e7a]/8 border-[#002e7a]/40' : ''
                }`}
            style={{ height: `${SLOT_HEIGHT}px` }}
        />
    );
}

// ─── Inline Task Creator (on double-click) ──────────────────────

function InlineTaskCreator({
    hour,
    minute,
    top,
    onSubmit,
    onCancel,
}: {
    hour: number;
    minute: number;
    top: number;
    onSubmit: (title: string) => void;
    onCancel: () => void;
}) {
    const [title, setTitle] = useState('');

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="absolute left-16 right-4 z-30 bg-white border-2 border-[#002e7a] rounded-lg shadow-lg p-3"
            style={{ top: `${top}px` }}
        >
            <p className="text-[10px] text-[#73726E] mb-1">
                Neuer Task um {hour}:{minute === 0 ? '00' : '30'}
            </p>
            <input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' && title.trim()) onSubmit(title.trim());
                    if (e.key === 'Escape') onCancel();
                }}
                onBlur={() => {
                    if (title.trim()) onSubmit(title.trim());
                    else onCancel();
                }}
                placeholder="Task-Titel eingeben..."
                className="w-full px-2 py-1.5 rounded border border-[#E7E7E5] text-sm text-[#37352F] placeholder:text-[#A8A29E] focus:outline-none focus:border-[#002e7a]"
            />
        </motion.div>
    );
}

// ─── Task Block with Resize Handle ──────────────────────────────

function TaskBlock({ task }: { task: CalendarTask }) {
    const { requestFocus, updateTask, removeTask } = useCalendarStore();
    const [isResizing, setIsResizing] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const resizeStartRef = useRef<{ y: number; height: number } | null>(null);

    if (!task.scheduled_start) return null;

    const start = new Date(task.scheduled_start);
    const end = task.scheduled_end
        ? new Date(task.scheduled_end)
        : new Date(start.getTime() + task.estimated_minutes * 60000);

    const startMinutes = start.getHours() * 60 + start.getMinutes();
    const durationMinutes = (end.getTime() - start.getTime()) / 60000;

    const pxPerMinute = (SLOT_HEIGHT * 2) / 60; // 96px per 60 min
    const top = startMinutes * pxPerMinute;
    const height = Math.max(durationMinutes * pxPerMinute, 32);

    const isCompleted = task.status === 'completed';
    const isFocus = task.status === 'focus';
    const hasProgress = task.progress_percent !== null && task.progress_percent > 0;

    // Darker, more visible colors
    const bgColor = isCompleted
        ? 'bg-green-100 border-green-400'
        : isFocus
            ? 'bg-[#002e7a]/20 border-[#002e7a]'
            : 'bg-[#d6e4ff] border-[#4a78d4]';

    const formatTime = (d: Date) =>
        d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

    // Resize via drag on bottom handle
    const handleResizeStart = (e: React.MouseEvent | React.TouchEvent) => {
        e.stopPropagation();
        e.preventDefault();
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        resizeStartRef.current = { y: clientY, height };
        setIsResizing(true);

        const handleMove = (ev: MouseEvent | TouchEvent) => {
            if (!resizeStartRef.current) return;
            const y = 'touches' in ev ? ev.touches[0].clientY : ev.clientY;
            const delta = y - resizeStartRef.current.y;
            const newHeight = Math.max(32, resizeStartRef.current.height + delta);
            const newMinutes = Math.round((newHeight / pxPerMinute) / 15) * 15;
            const clampedMinutes = Math.max(15, Math.min(180, newMinutes));

            updateTask(task.id, {
                estimated_minutes: clampedMinutes,
                scheduled_end: new Date(start.getTime() + clampedMinutes * 60000).toISOString(),
            });
        };

        const handleUp = () => {
            setIsResizing(false);
            resizeStartRef.current = null;
            document.removeEventListener('mousemove', handleMove);
            document.removeEventListener('mouseup', handleUp);
            document.removeEventListener('touchmove', handleMove);
            document.removeEventListener('touchend', handleUp);

            // Sync to DB
            fetch('/api/tasks', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: task.id,
                    estimated_minutes: task.estimated_minutes,
                    scheduled_end: task.scheduled_end,
                }),
            });
        };

        document.addEventListener('mousemove', handleMove);
        document.addEventListener('mouseup', handleUp);
        document.addEventListener('touchmove', handleMove);
        document.addEventListener('touchend', handleUp);
    };

    const handleDelete = async () => {
        removeTask(task.id);
        try {
            await fetch(`/api/tasks?id=${task.id}`, { method: 'DELETE' });
        } catch {
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            whileHover={{ scale: 1.005, zIndex: 10 }}
            onClick={() => !isCompleted && !isResizing && !confirmDelete && requestFocus(task.id)}
            className={`absolute left-16 right-4 rounded-lg border-2 px-3 py-2 cursor-pointer shadow-md transition-all group ${bgColor} ${isResizing ? 'ring-2 ring-[#002e7a]/30' : ''
                }`}
            style={{ top: `${top}px`, height: `${height}px`, minHeight: '32px' }}
        >
            <div className="flex items-start justify-between h-full">
                <div className="flex-1 min-w-0">
                    <p className={`text-xs font-semibold truncate ${isCompleted ? 'text-green-700' : 'text-[#1a2f6e]'}`}>
                        {isCompleted && <CheckCircle2 className="w-3 h-3 inline mr-1" />}
                        {task.title}
                    </p>
                    {height > 40 && (
                        <p className="text-[10px] text-[#4a6096] mt-0.5">
                            {formatTime(start)} – {formatTime(end)} · {task.estimated_minutes}min
                        </p>
                    )}
                    {/* Pomodoro CTA — visible when tall enough */}
                    {height > 56 && !isCompleted && (
                        <button
                            onClick={(e) => { e.stopPropagation(); requestFocus(task.id); }}
                            className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-[#002e7a] bg-white/70 hover:bg-white px-1.5 py-0.5 rounded-md transition-colors border border-[#002e7a]/20"
                        >
                            <Timer className="w-3 h-3" />
                            Pomodoro starten
                        </button>
                    )}
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                    {isFocus && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-[#002e7a] text-white rounded-full animate-pulse">
                            FOCUS
                        </span>
                    )}
                    {/* Delete button */}
                    {!isCompleted && (
                        confirmDelete ? (
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={handleDelete}
                                    className="text-[10px] px-1.5 py-0.5 bg-red-500 text-white rounded font-medium hover:bg-red-600"
                                >
                                    Ja
                                </button>
                                <button
                                    onClick={() => setConfirmDelete(false)}
                                    className="text-[10px] px-1.5 py-0.5 text-[#73726E] hover:text-[#37352F]"
                                >
                                    Nein
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={() => setConfirmDelete(true)}
                                className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-[#A8A29E] hover:text-red-500"
                            >
                                <Trash2 className="w-3 h-3" />
                            </button>
                        )
                    )}
                </div>
            </div>

            {/* Progress bar at bottom */}
            {(hasProgress || isCompleted) && (
                <div className="absolute bottom-2 left-3 right-3 h-1.5 bg-black/5 rounded-full overflow-hidden">
                    <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${task.progress_percent ?? 100}%` }}
                        className={`h-full ${isCompleted ? 'bg-green-500' : 'bg-amber-500'}`}
                    />
                </div>
            )}

            {/* Resize handle at bottom edge */}
            {!isCompleted && (
                <div
                    onMouseDown={handleResizeStart}
                    onTouchStart={handleResizeStart}
                    className="absolute bottom-0 left-0 right-0 h-3 cursor-s-resize flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                    <GripHorizontal className="w-4 h-2.5 text-[#A8A29E]" />
                </div>
            )}
        </motion.div>
    );
}

// ─── Main Timeline Grid ─────────────────────────────────────────

export function TimelineGrid() {
    const { tasks, addTask, scheduleTask } = useCalendarStore();
    const [inlineCreate, setInlineCreate] = useState<{ hour: number; minute: number } | null>(null);
    const timelineRef = useRef<HTMLDivElement>(null);

    const scheduledTasks = tasks.filter((t) =>
        ['scheduled', 'focus', 'in_progress', 'completed'].includes(t.status) && t.scheduled_start
    );

    const now = new Date();
    const minutesSinceMidnight = now.getHours() * 60 + now.getMinutes();
    const pxPerMinute = (SLOT_HEIGHT * 2) / 60;
    const currentLineTop = minutesSinceMidnight * pxPerMinute;

    // Calculate free time (based on waking hours 8-20)
    const scheduledMinutes = scheduledTasks
        .filter(t => t.status !== 'completed')
        .reduce((sum, t) => sum + t.estimated_minutes, 0);
    const totalMinutes = 12 * 60;
    const freeMinutes = totalMinutes - scheduledMinutes;
    const freeHours = Math.floor(freeMinutes / 60);
    const freeMin = freeMinutes % 60;

    // Scroll to current time − 1h on mount
    useEffect(() => {
        const scrollTarget = (minutesSinceMidnight - 60) * pxPerMinute;
        timelineRef.current?.scrollTo({ top: Math.max(0, scrollTarget), behavior: 'smooth' });
    }, []);

    // Double-click handler
    const handleDoubleClick = useCallback((hour: number, minute: number) => {
        setInlineCreate({ hour, minute });
    }, []);

    // Create task from double-click
    const handleInlineSubmit = useCallback(async (title: string) => {
        if (!inlineCreate) return;

        try {
            const res = await fetch('/api/tasks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, estimated_minutes: 60 }),
            });
            const data = await res.json();
            if (data.success && data.task) {
                const today = new Date();
                const startLocal = new Date(
                    today.getFullYear(), today.getMonth(), today.getDate(),
                    inlineCreate.hour, inlineCreate.minute
                );
                const endLocal = new Date(startLocal.getTime() + 60 * 60000);

                addTask(data.task);
                scheduleTask(data.task.id, startLocal.toISOString(), endLocal.toISOString());

                await fetch('/api/tasks', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id: data.task.id,
                        status: 'scheduled',
                        scheduled_start: startLocal.toISOString(),
                        scheduled_end: endLocal.toISOString(),
                    }),
                });

            }
        } catch {
        }

        setInlineCreate(null);
    }, [inlineCreate, addTask, scheduleTask]);

    const totalGridHeight = 24 * SLOT_HEIGHT * 2; // 24 hours × 2 slots × 48px

    return (
        <div className="bg-white border border-[#E7E7E5] rounded-xl shadow-sm overflow-hidden">
            {/* Header */}
            <div className="px-5 py-3 border-b border-[#E7E7E5] flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[#37352F] flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    {now.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'short' })}
                </h2>
                <span className="text-[10px] text-[#73726E]">
                    {freeHours}h {freeMin > 0 ? `${freeMin}m ` : ''}frei heute
                </span>
            </div>

            {/* Scrollable Grid */}
            <div
                ref={timelineRef}
                className="relative px-2 overflow-y-auto"
                style={{ height: '520px' }}
            >
                <div className="relative" style={{ height: `${totalGridHeight}px` }}>
                    {/* Hour labels + drop zones */}
                    {HOURS.map((hour) => (
                        <div
                            key={hour}
                            className="absolute left-0 right-0"
                            style={{ top: `${hour * SLOT_HEIGHT * 2}px`, height: `${SLOT_HEIGHT * 2}px` }}
                        >
                            <div className="flex items-start h-full">
                                <span className="w-14 text-xs font-mono text-[#A8A29E] pr-3 pt-px shrink-0 text-right select-none">
                                    {hour}:00
                                </span>
                                <div className="flex-1 border-t border-[#E7E7E5]/70 h-full">
                                    <TimeSlot hour={hour} half={0} onDoubleClick={handleDoubleClick} />
                                    <TimeSlot hour={hour} half={30} onDoubleClick={handleDoubleClick} />
                                </div>
                            </div>
                        </div>
                    ))}

                    {/* Current time line (red) */}
                    <div
                        className="absolute left-14 right-0 h-[2px] bg-red-500 z-20 pointer-events-none"
                        style={{ top: `${currentLineTop}px` }}
                    >
                        <div className="absolute -left-1.5 -top-1 w-3 h-3 bg-red-500 rounded-full" />
                    </div>

                    {/* Scheduled task blocks */}
                    {scheduledTasks.map((task) => (
                        <TaskBlock key={task.id} task={task} />
                    ))}

                    {/* Inline create overlay */}
                    {inlineCreate && (
                        <InlineTaskCreator
                            hour={inlineCreate.hour}
                            minute={inlineCreate.minute}
                            top={(inlineCreate.hour * 60 + inlineCreate.minute) * pxPerMinute}
                            onSubmit={handleInlineSubmit}
                            onCancel={() => setInlineCreate(null)}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
