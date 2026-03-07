'use client';

/**
 * Task Inbox — Right column (Modus A).
 * Draggable tasks, carry-over badges, add task, duration dropdown, delete.
 * Responsive: stacks below timeline on small screens.
 */

import { useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { motion, AnimatePresence } from 'framer-motion';
import { GripVertical, Plus, ChevronDown, RotateCcw, Flame, Trash2, X, BookOpen, PenLine } from 'lucide-react';
import { useCalendarStore, type CalendarTask } from '@/store/use-calendar-store';
import { PulseMissionPanel } from './pulse-mission-panel';

// ─── Duration Options ────────────────────────────────────────────

const DURATION_OPTIONS = [
    { label: '15m', value: 15 },
    { label: '30m', value: 30 },
    { label: '45m', value: 45 },
    { label: '1h', value: 60 },
    { label: '1.5h', value: 90 },
    { label: '2h', value: 120 },
    { label: '3h', value: 180 },
];

function formatDuration(minutes: number): string {
    if (minutes < 60) return `${minutes}m`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ─── Draggable Task Item ────────────────────────────────────────

function DraggableTaskItem({ task }: { task: CalendarTask }) {
    const { updateTask, removeTask } = useCalendarStore();
    const [showDuration, setShowDuration] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);

    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: task.id,
        data: { task },
    });

    const style = transform
        ? {
            transform: CSS.Translate.toString(transform),
            zIndex: 100,
            boxShadow: '0 12px 24px rgba(0,0,0,0.15)',
            rotate: '2deg',
        }
        : undefined;

    const isCarryOver = task.status === 'carry_over';
    const remaining = isCarryOver && task.progress_percent
        ? Math.round(task.estimated_minutes * (1 - task.progress_percent / 100))
        : null;

    const handleDurationChange = async (minutes: number) => {
        updateTask(task.id, { estimated_minutes: minutes });
        setShowDuration(false);
        await fetch('/api/tasks', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: task.id, estimated_minutes: minutes }),
        });
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
            ref={setNodeRef}
            style={style as any}
            initial={{ opacity: 0, y: 8 }}
            animate={{
                opacity: isDragging ? 0.8 : 1,
                y: 0,
                scale: isDragging ? 1.05 : 1,
                rotate: isDragging ? 2 : 0,
            }}
            exit={{ opacity: 0, x: -50, height: 0, marginBottom: 0, padding: 0, transition: { duration: 0.2 } }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className={`group p-3 rounded-lg border transition-all ${isDragging
                ? 'border-[#002e7a] bg-[#f0f4ff] shadow-xl'
                : 'border-[#E7E7E5] bg-white hover:border-[#002e7a]/30 hover:shadow-sm'
                }`}
        >
            <div className="flex items-center gap-2">
                {/* Drag handle */}
                <span
                    {...listeners}
                    {...attributes}
                    className="text-[#D1D5DB] hover:text-[#73726E] cursor-grab active:cursor-grabbing touch-none"
                >
                    <GripVertical className="w-4 h-4" />
                </span>

                {/* Task info */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        {isCarryOver && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded-full border border-amber-200 font-medium shrink-0">
                                Von gestern{task.progress_percent ? ` · ${task.progress_percent}%` : ''}
                            </span>
                        )}
                        <p className="text-sm text-[#37352F] truncate font-medium">{task.title}</p>
                    </div>
                    <p className="text-[10px] text-[#A8A29E] mt-0.5">
                        Schätzung: {task.estimated_minutes} min
                        {remaining !== null && ` · Noch ~${remaining} min offen`}
                    </p>
                </div>

                {/* Duration dropdown */}
                <div className="relative shrink-0">
                    <button
                        onClick={(e) => { e.stopPropagation(); setShowDuration(!showDuration); }}
                        className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-[#73726E] border border-[#E7E7E5] hover:border-[#002e7a]/30 transition-colors"
                    >
                        {formatDuration(task.estimated_minutes)}
                        <ChevronDown className="w-3 h-3" />
                    </button>
                    <AnimatePresence>
                        {showDuration && (
                            <>
                                {/* Backdrop to close dropdown */}
                                <div className="fixed inset-0 z-40" onClick={() => setShowDuration(false)} />
                                <motion.div
                                    initial={{ opacity: 0, y: -4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -4 }}
                                    className="absolute right-0 top-full mt-1 bg-white border border-[#E7E7E5] rounded-lg shadow-lg z-50 py-1 min-w-[80px]"
                                >
                                    {DURATION_OPTIONS.map((opt) => (
                                        <button
                                            key={opt.value}
                                            onClick={(e) => { e.stopPropagation(); handleDurationChange(opt.value); }}
                                            className={`block w-full px-3 py-1.5 text-xs text-left hover:bg-[#F7F7F5] transition-colors ${opt.value === task.estimated_minutes ? 'text-[#002e7a] font-semibold bg-[#f0f4ff]' : 'text-[#37352F]'
                                                }`}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </motion.div>
                            </>
                        )}
                    </AnimatePresence>
                </div>

                {/* Delete button */}
                {confirmDelete ? (
                    <div className="flex items-center gap-1 shrink-0">
                        <button
                            onClick={handleDelete}
                            className="px-2 py-1 rounded text-[10px] font-medium bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors"
                        >
                            Ja
                        </button>
                        <button
                            onClick={() => setConfirmDelete(false)}
                            className="p-1 text-[#A8A29E] hover:text-[#37352F]"
                        >
                            <X className="w-3 h-3" />
                        </button>
                    </div>
                ) : (
                    <button
                        onClick={() => setConfirmDelete(true)}
                        className="p-1 opacity-0 group-hover:opacity-100 text-[#D1D5DB] hover:text-red-500 transition-all shrink-0"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>

            {/* Carry-over progress bar */}
            {isCarryOver && task.progress_percent !== null && task.progress_percent > 0 && (
                <div className="mt-2 w-full h-1 bg-[#E7E7E5] rounded-full overflow-hidden">
                    <div
                        className="h-full bg-amber-500 rounded-full transition-all"
                        style={{ width: `${task.progress_percent}%` }}
                    />
                </div>
            )}
        </motion.div>
    );
}

// ─── Add Task Form ──────────────────────────────────────────────

function AddTaskForm() {
    const [title, setTitle] = useState('');
    const [isAdding, setIsAdding] = useState(false);
    const addTask = useCalendarStore((s) => s.addTask);

    const handleSubmit = async () => {
        if (!title.trim()) return;
        setIsAdding(true);

        try {
            const res = await fetch('/api/tasks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: title.trim(), estimated_minutes: 60 }),
            });
            const data = await res.json();
            if (data.success && data.task) {
                addTask(data.task);
                setTitle('');
            }
        } catch {
        } finally {
            setIsAdding(false);
        }
    };

    return (
        <div className="flex gap-2">
            <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                placeholder="Neuer Task..."
                className="flex-1 px-3 py-2 rounded-lg border border-[#E7E7E5] bg-[#FAFAF9] text-sm text-[#37352F] placeholder:text-[#A8A29E] focus:outline-none focus:border-[#002e7a] focus:ring-1 focus:ring-[#002e7a]/20 transition-all"
            />
            <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleSubmit}
                disabled={!title.trim() || isAdding}
                className="px-3 py-2 bg-[#002e7a] text-white rounded-lg text-sm disabled:opacity-50 transition-colors hover:bg-[#001d4f]"
            >
                <Plus className="w-4 h-4" />
            </motion.button>
        </div>
    );
}

// ─── Coaching Recommendation Panel ──────────────────────────────

function CoachingRecommendationPanel({ tasks }: { tasks: CalendarTask[] }) {
    const [isExpanded, setIsExpanded] = useState(true);

    return (
        <div className="mb-3">
            {/* Notion-style toggle header */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="
                    w-full flex items-center gap-2 py-1.5 px-1
                    text-sm text-[#37352F] hover:bg-[#F5F5F4]
                    rounded transition-colors text-left
                "
            >
                <span
                    className="text-[#A8A29E] transition-transform duration-150 text-[10px] flex-shrink-0"
                    style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
                >
                    &#9654;
                </span>
                <BookOpen className="w-3.5 h-3.5 text-[#2B5EA7]" />
                <span className="font-medium">
                    Pathlys Coaching Empfehlung
                </span>
                <span className="text-[10px] text-[#A8A29E] ml-auto">
                    {tasks.length}
                </span>
            </button>

            {/* Content */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="overflow-hidden"
                    >
                        <div className="pt-1.5 pl-5 space-y-2">
                            <AnimatePresence mode="popLayout">
                                {tasks.length === 0 ? (
                                    <p className="text-xs text-[#A8A29E] py-1">
                                        Speichere Themen aus deiner Coaching-Analyse hier.
                                    </p>
                                ) : (
                                    tasks.map((task) => (
                                        <DraggableTaskItem key={task.id} task={task} />
                                    ))
                                )}
                            </AnimatePresence>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// ─── Main Inbox Panel ───────────────────────────────────────────

export function TaskInbox() {
    const tasks = useCalendarStore((s) => s.tasks);
    const today = new Date().toISOString().split('T')[0];
    const [isCustomExpanded, setIsCustomExpanded] = useState(true);

    const inboxTasks = tasks.filter((t) => t.status === 'inbox' && t.source !== 'coaching');
    const coachingTasks = tasks.filter((t) => t.status === 'inbox' && t.source === 'coaching');
    const carryOverTasks = tasks.filter(
        (t) => t.status === 'carry_over' && t.carry_over_to === today
    );
    const completedCount = tasks.filter((t) => t.status === 'completed').length;
    const totalScheduled = tasks.filter((t) =>
        ['scheduled', 'focus', 'in_progress', 'completed'].includes(t.status)
    ).length;

    const customTaskCount = inboxTasks.length + carryOverTasks.length;

    return (
        <div className="bg-white border border-[#E7E7E5] rounded-xl shadow-sm overflow-hidden h-full flex flex-col">
            {/* Header */}
            <div className="px-4 py-3 border-b border-[#E7E7E5]">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-[#37352F]">Missionen - Drag &amp; Drop</h2>
                    <div className="flex items-center gap-2">
                        {totalScheduled > 0 && (
                            <span className="text-[10px] text-[#73726E] flex items-center gap-1">
                                <Flame className="w-3 h-3 text-orange-500" />
                                {completedCount} von {totalScheduled} erledigt
                            </span>
                        )}
                    </div>
                </div>
            </div>

            <div className="p-4 space-y-3 flex-1">
                <PulseMissionPanel />

                {/* Coaching Recommendations — always visible */}
                <CoachingRecommendationPanel tasks={coachingTasks} />

                {/* Custom Task Toggle — Notion-style, consistent with other toggles */}
                <div className="mb-3">
                    <button
                        onClick={() => setIsCustomExpanded(!isCustomExpanded)}
                        className="
                            w-full flex items-center gap-2 py-1.5 px-1
                            text-sm text-[#37352F] hover:bg-[#F5F5F4]
                            rounded transition-colors text-left
                        "
                    >
                        <span
                            className="text-[#A8A29E] transition-transform duration-150 text-[10px] flex-shrink-0"
                            style={{ transform: isCustomExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
                        >
                            &#9654;
                        </span>
                        <PenLine className="w-3.5 h-3.5 text-[#73726E]" />
                        <span className="font-medium">
                            Erstelle deine eigene Task
                        </span>
                        {customTaskCount > 0 && (
                            <span className="text-[10px] text-[#A8A29E] ml-auto">
                                {customTaskCount}
                            </span>
                        )}
                    </button>

                    <AnimatePresence>
                        {isCustomExpanded && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.15 }}
                                className="overflow-hidden"
                            >
                                <div className="pt-1.5 pl-5 space-y-2">
                                    {/* Add task */}
                                    <AddTaskForm />

                                    {/* Carry-over tasks */}
                                    <AnimatePresence mode="popLayout">
                                        {carryOverTasks.length > 0 && (
                                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
                                                <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wider flex items-center gap-1">
                                                    <RotateCcw className="w-3 h-3" /> Von gestern
                                                </p>
                                                {carryOverTasks.map((task) => (
                                                    <DraggableTaskItem key={task.id} task={task} />
                                                ))}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>

                                    {/* Inbox tasks */}
                                    <AnimatePresence mode="popLayout">
                                        {inboxTasks.length > 0 && (
                                            <div className="space-y-2">
                                                {inboxTasks.map((task) => (
                                                    <DraggableTaskItem key={task.id} task={task} />
                                                ))}
                                            </div>
                                        )}
                                    </AnimatePresence>

                                    {/* Empty state */}
                                    {inboxTasks.length === 0 && carryOverTasks.length === 0 && (
                                        <p className="text-xs text-[#A8A29E] py-1">
                                            Erstelle deinen ersten Task oben.
                                        </p>
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Scheduled section */}
                {tasks.filter(t => t.status === 'scheduled').length > 0 && (
                    <div className="border-t border-[#E7E7E5] pt-3 mt-3 space-y-1">
                        <p className="text-[10px] font-semibold text-[#73726E] uppercase tracking-wider">
                            Geplant
                        </p>
                        {tasks.filter(t => t.status === 'scheduled').map(task => (
                            <div key={task.id} className="flex items-center gap-2 px-2 py-1 text-xs text-[#73726E]">
                                <span>Done</span>
                                <span className="truncate flex-1">{task.title}</span>
                                <span className="font-mono text-[10px] shrink-0">
                                    {task.scheduled_start ? new Date(task.scheduled_start).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : ''}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
