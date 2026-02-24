'use client';

/**
 * Focus Panel — Right column (Modus B).
 * Pomodoro timer, session notes, progress mini-panel, completion ritual.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, SkipForward, Coffee, ArrowLeft, CheckCircle2, RotateCcw, Clock } from 'lucide-react';
import { useCalendarStore } from '@/store/use-calendar-store';
import { toast } from 'sonner';
import confetti from 'canvas-confetti';

const DEFAULT_BREAK_DURATION = 5 * 60; // 5 minutes (for 25-min pomodoro)
const DEEP_BREAK_DURATION = 10 * 60; // 10 minutes (for 50-min pomodoro)

// Pomodoro count based on estimated minutes
function getPomodoroCount(minutes: number): number {
    if (minutes <= 30) return 1;
    if (minutes <= 60) return 2;
    if (minutes <= 90) return 3;
    return 4;
}

function formatTimer(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// ─── Progress Mini-Panel ────────────────────────────────────────

function ProgressPanel({
    taskId,
    taskTitle,
    onClose,
}: {
    taskId: string;
    taskTitle: string;
    onClose: () => void;
}) {
    const { updateProgress, completeTask, carryOverTask } = useCalendarStore();
    const [percent, setPercent] = useState(50);
    const [note, setNote] = useState('');

    const handleContinue = async () => {
        updateProgress(taskId, percent, note || null);
        await syncProgress(taskId, percent, note || null);
        onClose();
    };

    const handleCarryOver = async () => {
        carryOverTask(taskId, percent, note || null);
        await fetch('/api/tasks', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: taskId,
                status: 'carry_over',
                carry_over_to: getNextDay(),
                progress_percent: percent,
                progress_note: note || null,
            }),
        });
        toast.success(`„${taskTitle}" auf morgen verschoben.`);
        onClose();
    };

    const handleComplete = async () => {
        completeTask(taskId);
        await fetch('/api/tasks', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: taskId,
                status: 'completed',
                progress_percent: 100,
                completed_at: new Date().toISOString(),
            }),
        });
        fireConfetti();
        toast.success('🎉 Task erledigt!');
        onClose();
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="bg-[#F7F7F5] rounded-xl p-4 space-y-4 border border-[#E7E7E5]"
        >
            <div>
                <p className="text-sm font-semibold text-[#37352F]">⏸ Wo stehst du gerade?</p>
                <p className="text-xs text-[#73726E] mt-0.5">„{taskTitle}"</p>
            </div>

            {/* Progress slider */}
            <div>
                <label className="text-[10px] text-[#73726E] mb-1 block">Fortschritt (optional):</label>
                <div className="flex items-center gap-3">
                    <input
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        value={percent}
                        onChange={(e) => setPercent(Number(e.target.value))}
                        className="flex-1 accent-[#002e7a]"
                    />
                    <span className="text-sm font-mono font-semibold text-[#37352F] w-12 text-right">{percent}%</span>
                </div>
            </div>

            {/* Note */}
            <div>
                <label className="text-[10px] text-[#73726E] mb-1 block">Kurze Notiz (optional):</label>
                <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="z.B. Intro fertig, Body fehlt noch..."
                    className="w-full px-3 py-2 rounded-lg border border-[#E7E7E5] bg-white text-xs text-[#37352F] placeholder:text-[#A8A29E] resize-none focus:outline-none focus:border-[#002e7a] focus:ring-1 focus:ring-[#002e7a]/20"
                    rows={2}
                />
            </div>

            {/* Action buttons */}
            <div className="flex gap-2">
                <button
                    onClick={handleContinue}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#002e7a] text-white text-xs font-medium hover:bg-[#001d4f] transition-colors"
                >
                    <Play className="w-3 h-3" /> Weiter
                </button>
                <button
                    onClick={handleCarryOver}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-[#E7E7E5] text-xs font-medium text-[#73726E] hover:border-[#002e7a] hover:text-[#002e7a] transition-colors"
                >
                    <RotateCcw className="w-3 h-3" /> Morgen
                </button>
                <button
                    onClick={handleComplete}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-green-50 text-green-700 text-xs font-medium border border-green-200 hover:bg-green-100 transition-colors"
                >
                    <CheckCircle2 className="w-3 h-3" /> Fertig
                </button>
            </div>
        </motion.div>
    );
}

// ─── Main Focus Panel ───────────────────────────────────────────

export function FocusPanel() {
    const { focusedTaskId, tasks, exitFocus, completeTask, updateTask, pomodoroDuration, autoStartTimer } = useCalendarStore();
    const task = tasks.find((t) => t.id === focusedTaskId);

    const pomoDurationSecs = pomodoroDuration * 60;
    const breakDurationSecs = pomodoroDuration === 50 ? DEEP_BREAK_DURATION : DEFAULT_BREAK_DURATION;

    const [secondsLeft, setSecondsLeft] = useState(pomoDurationSecs);
    const [isRunning, setIsRunning] = useState(false);
    const [isBreak, setIsBreak] = useState(false);
    const [showProgress, setShowProgress] = useState(false);
    const [sessionNotes, setSessionNotes] = useState('');
    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const autoStartedRef = useRef(false);

    const totalPomodoros = task ? getPomodoroCount(task.estimated_minutes) : 2;
    const completedPomodoros = task?.pomodoros_completed ?? 0;

    // Timer logic
    useEffect(() => {
        if (!isRunning) {
            if (intervalRef.current) clearInterval(intervalRef.current);
            return;
        }

        intervalRef.current = setInterval(() => {
            setSecondsLeft((prev) => {
                if (prev <= 1) {
                    if (!isBreak) {
                        // Pomodoro completed
                        if (task) {
                            const newCount = completedPomodoros + 1;
                            updateTask(task.id, { pomodoros_completed: newCount });
                            fetch('/api/tasks', {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ id: task.id, pomodoros_completed: newCount }),
                            });
                        }
                        setIsBreak(true);
                        return breakDurationSecs;
                    } else {
                        setIsBreak(false);
                        return pomoDurationSecs;
                    }
                }
                return prev - 1;
            });
        }, 1000);

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [isRunning, isBreak]);

    // Reset when task changes
    useEffect(() => {
        setSecondsLeft(pomoDurationSecs);
        setIsRunning(false);
        setIsBreak(false);
        setShowProgress(false);
        setSessionNotes(task?.notes || '');
        autoStartedRef.current = false;
    }, [focusedTaskId, pomoDurationSecs]);

    // Auto-start timer when entering focus mode
    useEffect(() => {
        if (autoStartTimer && focusedTaskId && !autoStartedRef.current) {
            autoStartedRef.current = true;
            setSecondsLeft(pomoDurationSecs);
            setIsRunning(true);
        }
    }, [autoStartTimer, focusedTaskId, pomoDurationSecs]);

    // Auto-save session notes
    const saveNotes = useCallback(async () => {
        if (task && sessionNotes !== task.notes) {
            updateTask(task.id, { notes: sessionNotes });
            await fetch('/api/tasks', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: task.id, notes: sessionNotes }),
            });
        }
    }, [task, sessionNotes]);

    const handleComplete = async () => {
        if (!task) return;
        completeTask(task.id);
        await fetch('/api/tasks', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: task.id,
                status: 'completed',
                progress_percent: 100,
                completed_at: new Date().toISOString(),
            }),
        });
        fireConfetti();
        toast.success('🎉 Task erledigt!');
    };

    if (!task) return null;

    const formatTimeRange = () => {
        if (!task.scheduled_start) return '';
        const start = new Date(task.scheduled_start);
        const end = task.scheduled_end ? new Date(task.scheduled_end) : new Date(start.getTime() + task.estimated_minutes * 60000);
        const fmt = (d: Date) => d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
        return `${fmt(start)} – ${fmt(end)}`;
    };

    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="bg-white border border-[#E7E7E5] rounded-xl shadow-sm overflow-hidden"
        >
            {/* Header */}
            <div className="px-4 py-3 border-b border-[#E7E7E5]">
                <h3 className="text-sm font-bold text-[#37352F]">{task.title}</h3>
                <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-[#73726E]">{formatTimeRange()}</span>
                    <span className="text-[10px]">·</span>
                    <span className="text-[10px]">
                        {Array.from({ length: totalPomodoros }).map((_, i) => (
                            <span key={i}>{i < completedPomodoros ? '🍅' : '○'} </span>
                        ))}
                    </span>
                </div>
            </div>

            <div className="p-4 space-y-4">
                {/* Timer */}
                <div className="text-center py-4">
                    <div className={`inline-flex flex-col items-center p-6 rounded-2xl ${isBreak ? 'bg-green-50' : 'bg-[#F7F7F5]'}`}>
                        <span className="text-[10px] text-[#73726E] mb-1">
                            {isBreak ? '☕ Pause' : `Pomodoro ${Math.min(completedPomodoros + 1, totalPomodoros)} von ${totalPomodoros}`}
                        </span>
                        <span className="text-4xl font-mono font-bold text-[#37352F] tabular-nums">
                            {formatTimer(secondsLeft)}
                        </span>
                        <div className="flex items-center gap-2 mt-3">
                            <motion.button
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                                onClick={() => setIsRunning(!isRunning)}
                                className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${isRunning
                                    ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                                    : 'bg-[#002e7a] text-white hover:bg-[#001d4f]'
                                    }`}
                            >
                                {isRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                            </motion.button>
                            <motion.button
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                                onClick={() => {
                                    setIsBreak(!isBreak);
                                    setSecondsLeft(isBreak ? pomoDurationSecs : breakDurationSecs);
                                }}
                                className="w-10 h-10 rounded-full bg-[#F7F7F5] text-[#73726E] flex items-center justify-center hover:bg-[#E7E7E5] transition-colors"
                            >
                                {isBreak ? <Clock className="w-4 h-4" /> : <Coffee className="w-4 h-4" />}
                            </motion.button>
                        </div>
                    </div>
                </div>

                {/* Session notes */}
                <div>
                    <label className="text-[10px] text-[#73726E] mb-1 block">Notizen zu dieser Session:</label>
                    <textarea
                        value={sessionNotes}
                        onChange={(e) => setSessionNotes(e.target.value)}
                        onBlur={saveNotes}
                        placeholder="z.B. Patagonia B-Corp Referenz einbauen..."
                        className="w-full px-3 py-2 rounded-lg border border-[#E7E7E5] bg-[#FAFAF9] text-xs text-[#37352F] placeholder:text-[#A8A29E] resize-none focus:outline-none focus:border-[#002e7a] focus:ring-1 focus:ring-[#002e7a]/20"
                        rows={3}
                    />
                </div>

                {/* Progress panel toggle */}
                <AnimatePresence>
                    {showProgress && (
                        <ProgressPanel
                            taskId={task.id}
                            taskTitle={task.title}
                            onClose={() => setShowProgress(false)}
                        />
                    )}
                </AnimatePresence>

                {/* Action buttons */}
                <div className="flex gap-2 pt-2 border-t border-[#E7E7E5]">
                    <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={handleComplete}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg bg-green-50 text-green-700 text-xs font-medium border border-green-200 hover:bg-green-100 transition-colors"
                    >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Goal erledigt
                    </motion.button>
                    <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setShowProgress(!showProgress)}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border border-[#E7E7E5] text-xs font-medium text-[#73726E] hover:border-[#002e7a] hover:text-[#002e7a] transition-colors"
                    >
                        <Pause className="w-3.5 h-3.5" /> Pause / Fortschritt
                    </motion.button>
                    <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => {
                            saveNotes();
                            exitFocus();
                        }}
                        className="px-3 py-2.5 rounded-lg border border-[#E7E7E5] text-xs text-[#73726E] hover:border-[#002e7a] hover:text-[#002e7a] transition-colors"
                    >
                        <ArrowLeft className="w-3.5 h-3.5" />
                    </motion.button>
                </div>
            </div>
        </motion.div>
    );
}

// ─── Helpers ────────────────────────────────────────────────────

async function syncProgress(taskId: string, percent: number, note: string | null) {
    await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: taskId, progress_percent: percent, progress_note: note }),
    });
}

function getNextDay(): string {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
}

function fireConfetti() {
    confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#002e7a', '#16a34a', '#f59e0b'],
    });
}
