"use client";

/**
 * PomodoroCard — wired to the global Zustand store.
 * The useEffect tick drives the timer for the entire app session.
 * Since this card lives in the always-mounted sidebar, the timer
 * stays alive across ALL page navigations.
 */

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, SkipForward, Coffee } from 'lucide-react';
import { Button } from '@/components/motion/button';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/motion/badge';
import { useCalendarStore } from '@/store/use-calendar-store';

interface PomodoroCardProps {
    className?: string;
}

export function PomodoroCard({ className }: PomodoroCardProps) {
    const timerTimeRemaining = useCalendarStore((s) => s.timerTimeRemaining);
    const timerIsActive = useCalendarStore((s) => s.timerIsActive);
    const timerMode = useCalendarStore((s) => s.timerMode);
    const timerTotalTime = useCalendarStore((s) => s.timerTotalTime);
    const timerSessions = useCalendarStore((s) => s.timerSessions);
    const pomodoroDuration = useCalendarStore((s) => s.pomodoroDuration) as 25 | 50;

    const timerToggle = useCalendarStore((s) => s.timerToggle);
    const timerTick = useCalendarStore((s) => s.timerTick);
    const timerSkip = useCalendarStore((s) => s.timerSkip);
    const timerSetDuration = useCalendarStore((s) => s.timerSetDuration);

    // ── Heart of persistence: tick lives in the always-mounted sidebar ──
    useEffect(() => {
        if (!timerIsActive) return;
        const interval = setInterval(() => timerTick(), 1000);
        return () => clearInterval(interval);
    }, [timerIsActive, timerTick]);

    const progress = ((timerTotalTime - timerTimeRemaining) / timerTotalTime) * 100;

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <motion.div
            className={cn(
                "px-4 py-4 rounded-lg border transition-colors",
                timerMode === 'focus'
                    ? "bg-white border-[#d6d6d6]"
                    : "bg-[#d4e3fe] border-[#002e7a]/20",
                className
            )}
            whileHover={{ scale: 1.02, y: -2, boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.07)" }}
            transition={{ duration: 0.2 }}
        >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    {timerMode === 'focus' ? (
                        <span className="text-xl font-bold text-[#002e7a]">P</span>
                    ) : (
                        <Coffee className="w-5 h-5 text-[#002e7a]" />
                    )}
                    <span className="text-sm font-medium text-[#002e7a]">
                        {timerMode === 'focus' ? 'Focus Time' : 'Break Time'}
                    </span>
                </div>
                <div className="flex items-center gap-1">
                    <span className="text-xs font-medium text-[#002e7a]/60 mr-1">Runs:</span>
                    <Badge variant="outline" className="bg-[#d4e3fe] text-[#002e7a] border-[#002e7a]/20">
                        {timerSessions}
                    </Badge>
                </div>
            </div>

            {/* Duration Selector (only when paused in focus mode) */}
            <AnimatePresence>
                {timerMode === 'focus' && !timerIsActive && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="flex gap-2 mb-4 justify-center"
                    >
                        {([25, 50] as const).map((d) => (
                            <button
                                key={d}
                                onClick={() => timerSetDuration(d)}
                                className={cn(
                                    "px-3 py-1 text-xs rounded-full border transition-all",
                                    pomodoroDuration === d
                                        ? "bg-[#002e7a] text-white border-[#002e7a]"
                                        : "text-[#002e7a] border-[#d6d6d6] hover:bg-[#d4e3fe]"
                                )}
                            >
                                {d}min
                            </button>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Timer Display */}
            <div className="text-center mb-4">
                <motion.div
                    className="text-4xl font-bold tabular-nums tracking-tight text-[#002e7a]"
                    animate={{ scale: timerIsActive ? [1, 1.02, 1] : 1 }}
                    transition={{ duration: 1, repeat: timerIsActive ? Infinity : 0 }}
                >
                    {formatTime(timerTimeRemaining)}
                </motion.div>

                <div className="text-xs text-[#002e7a]/60 mt-1 font-medium">
                    {timerMode === 'focus'
                        ? (pomodoroDuration === 25 ? "+ 5min Break" : "+ 10min Break")
                        : "Recharge"}
                </div>

                {/* Progress bar */}
                <div className="relative w-full h-1.5 bg-[#d6d6d6]/50 rounded-full mt-4 overflow-hidden">
                    <motion.div
                        className={cn(
                            "absolute left-0 top-0 h-full",
                            timerMode === 'focus'
                                ? "bg-gradient-to-r from-[#002e7a] to-[#3385FF]"
                                : "bg-gradient-to-r from-[#00C853] to-[#69F0AE]"
                        )}
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 0.3 }}
                    />
                </div>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-2">
                <Button
                    variant={timerIsActive ? "secondary" : "primary"}
                    className="flex-1 text-sm h-9"
                    onClick={timerToggle}
                >
                    {timerIsActive ? (
                        <><Pause className="w-3.5 h-3.5 mr-1.5" />Pause</>
                    ) : (
                        <><Play className="w-3.5 h-3.5 mr-1.5" />{timerTimeRemaining === timerTotalTime ? 'Start' : 'Resume'}</>
                    )}
                </Button>
                <Button
                    variant="ghost"
                    className="px-3 h-9 text-[#002e7a] hover:bg-[#d4e3fe]"
                    onClick={timerSkip}
                    title="Skip to next phase"
                >
                    <SkipForward className="w-4 h-4" />
                </Button>
            </div>
        </motion.div>
    );
}
