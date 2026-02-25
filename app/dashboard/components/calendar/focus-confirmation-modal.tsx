'use client';

/**
 * Focus Confirmation Modal — Shown before entering Focus Mode.
 * Includes phone focus nudge (iOS/Android) per spec.
 * Pomodoro duration selector (25 or 50 min).
 * Clicking "Ich bin bereit" auto-starts the timer.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Target, Smartphone, X, Timer } from 'lucide-react';
import { useCalendarStore } from '@/store/use-calendar-store';

export function FocusConfirmationModal() {
    const { showFocusConfirmation, pendingFocusTaskId, tasks, confirmFocus, cancelFocus, setPomodoroDuration } = useCalendarStore();
    const [skipNext, setSkipNext] = useState(false);
    const [selectedDuration, setSelectedDuration] = useState(25);

    const task = tasks.find((t) => t.id === pendingFocusTaskId);
    if (!showFocusConfirmation || !task) return null;

    const formatTimeRange = () => {
        if (!task.scheduled_start) return '';
        const start = new Date(task.scheduled_start);
        const end = task.scheduled_end ? new Date(task.scheduled_end) : new Date(start.getTime() + task.estimated_minutes * 60000);
        const fmt = (d: Date) => d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
        return `${fmt(start)} – ${fmt(end)} Uhr`;
    };

    const pomodoroCount = task.estimated_minutes <= 30 ? 1 : task.estimated_minutes <= 60 ? 2 : task.estimated_minutes <= 90 ? 3 : 4;

    const handleConfirm = async () => {
        // Set the chosen pomodoro duration in the store
        setPomodoroDuration(selectedDuration);

        if (skipNext) {
            // Save preference (best-effort)
            fetch('/api/tasks', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: '__skip_focus_pref__' }),
            }).catch(() => { });
        }

        // Confirm focus — this triggers the timer auto-start via the store
        confirmFocus();
    };

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                onClick={cancelFocus}
            >
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden"
                >
                    {/* Header */}
                    <div className="px-6 pt-6 pb-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="w-10 h-10 rounded-xl bg-[#f0f4ff] flex items-center justify-center">
                                    <Target className="w-5 h-5 text-[#002e7a]" />
                                </div>
                                <h3 className="text-lg font-bold text-[#37352F]">Bereit für Deep Work?</h3>
                            </div>
                            <button onClick={cancelFocus} className="text-[#A8A29E] hover:text-[#37352F] transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="px-6 pb-4 space-y-4">
                        {/* Task info */}
                        <div className="bg-[#F7F7F5] rounded-lg p-4">
                            <p className="text-sm font-semibold text-[#37352F]">„{task.title}"</p>
                            <p className="text-xs text-[#73726E] mt-1">
                                Geplante Zeit: {formatTimeRange()} ({task.estimated_minutes} min · {pomodoroCount} Pomodoro{pomodoroCount > 1 ? 's' : ''})
                            </p>
                        </div>

                        {/* Pomodoro Duration Selector */}
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <Timer className="w-4 h-4 text-[#73726E]" />
                                <p className="text-xs font-medium text-[#37352F]">Pomodoro-Dauer wählen:</p>
                            </div>
                            <div className="flex gap-2">
                                {[25, 50].map((dur) => (
                                    <motion.button
                                        key={dur}
                                        whileHover={{ scale: 1.03 }}
                                        whileTap={{ scale: 0.97 }}
                                        onClick={() => setSelectedDuration(dur)}
                                        className={`flex-1 py-2.5 rounded-lg text-sm font-medium border-2 transition-all ${selectedDuration === dur
                                            ? 'border-[#002e7a] bg-[#f0f4ff] text-[#002e7a]'
                                            : 'border-[#E7E7E5] bg-white text-[#73726E] hover:border-[#002e7a]/30'
                                            }`}
                                    >
                                        {dur} min
                                    </motion.button>
                                ))}
                            </div>
                            <p className="text-[10px] text-[#A8A29E] mt-1.5">
                                {selectedDuration === 25
                                    ? 'Klassisch: 25 Min. Fokus + 5 Min. Pause'
                                    : 'Deep Work: 50 Min. Fokus + 10 Min. Pause'}
                            </p>
                        </div>

                        {/* Phone nudge */}
                        <div className="border-t border-[#E7E7E5] pt-4">
                            <div className="flex items-start gap-3">
                                <Smartphone className="w-5 h-5 text-[#73726E] shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-xs text-[#37352F] font-medium">📵 Empfehlung:</p>
                                    <p className="text-xs text-[#73726E] mt-1 leading-relaxed">
                                        Lege dein Handy in den Fokus-Modus, damit Benachrichtigungen dich nicht aus dem Flow reißen.
                                    </p>
                                    <div className="mt-2 grid grid-cols-2 gap-2">
                                        <span className="text-[10px] text-[#A8A29E] bg-[#F7F7F5] rounded-md px-2 py-1">
                                            🍎 iOS: Einstellungen → Fokus → Nicht stören
                                        </span>
                                        <span className="text-[10px] text-[#A8A29E] bg-[#F7F7F5] rounded-md px-2 py-1">
                                            🤖 Android: Schnelleinstellungen → DND
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Skip checkbox */}
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={skipNext}
                                onChange={(e) => setSkipNext(e.target.checked)}
                                className="rounded border-[#D1D5DB] text-[#002e7a] focus:ring-[#002e7a]/20"
                            />
                            <span className="text-[10px] text-[#A8A29E]">Nicht mehr fragen</span>
                        </label>
                    </div>

                    {/* Actions */}
                    <div className="px-6 pb-6 flex gap-3">
                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={handleConfirm}
                            className="flex-1 px-4 py-2.5 rounded-lg bg-[#002e7a] text-white text-sm font-medium hover:bg-[#001d4f] transition-colors"
                        >
                            Ich bin bereit – Focus starten
                        </motion.button>
                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={cancelFocus}
                            className="px-4 py-2.5 rounded-lg border border-[#E7E7E5] text-sm text-[#73726E] hover:border-[#002e7a] hover:text-[#002e7a] transition-colors"
                        >
                            Später
                        </motion.button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
