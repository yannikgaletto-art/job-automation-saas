"use client";

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, SkipForward, Coffee, Smartphone, Timer } from 'lucide-react';
import { Button } from '@/components/motion/button';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/motion/badge';

interface PomodoroCardProps {
    className?: string;
}

type TimerMode = 'focus' | 'break';
type FocusDuration = 25 | 50;

export function PomodoroCard({ className }: PomodoroCardProps) {
    // Settings
    const [focusDuration, setFocusDuration] = useState<FocusDuration>(25);

    // Timer State
    const [mode, setMode] = useState<TimerMode>('focus');
    const [timeRemaining, setTimeRemaining] = useState(25 * 60);
    const [isActive, setIsActive] = useState(false);
    const [sessions, setSessions] = useState(0);

    // Derived values
    const totalTime = mode === 'focus'
        ? focusDuration * 60
        : (focusDuration === 25 ? 5 * 60 : 10 * 60);

    const progress = ((totalTime - timeRemaining) / totalTime) * 100;

    // Timer Logic
    useEffect(() => {
        let interval: NodeJS.Timeout | null = null;

        if (isActive && timeRemaining > 0) {
            interval = setInterval(() => {
                setTimeRemaining((time) => time - 1);
            }, 1000);
        } else if (timeRemaining === 0 && isActive) {
            handleTimerComplete();
        }

        return () => {
            if (interval) clearInterval(interval);
        };
    }, [isActive, timeRemaining]);

    const handleTimerComplete = () => {
        // Play notification sound here if needed

        if (mode === 'focus') {
            // Focus finished -> Start Break
            setSessions(s => s + 1);
            setMode('break');
            setTimeRemaining(focusDuration === 25 ? 5 * 60 : 10 * 60);
            setIsActive(false); // Auto-pause or auto-start (user preference usually pause)
        } else {
            // Break finished -> Start Focus
            setMode('focus');
            setTimeRemaining(focusDuration * 60);
            setIsActive(false);
        }
    };

    const handleModeSelect = (duration: FocusDuration) => {
        setFocusDuration(duration);
        if (mode === 'focus') {
            setTimeRemaining(duration * 60);
            setIsActive(false);
        }
    };

    const handleSkip = () => {
        handleTimerComplete();
    };

    const handleToggle = () => {
        setIsActive(!isActive);
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <motion.div
            className={cn(
                "px-4 py-4 rounded-lg border transition-colors",
                mode === 'focus'
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
                    {mode === 'focus' ? (
                        <span className="text-xl">🍅</span>
                    ) : (
                        <span className="text-xl">{focusDuration === 25 ? '📱' : '☕️'}</span>
                    )}
                    <span className="text-sm font-medium text-[#002e7a]">
                        {mode === 'focus' ? 'Focus Time' : 'Break Time'}
                    </span>
                </div>
                <div className="flex items-center gap-1">
                    <span className="text-xs font-medium text-[#002e7a]/60 mr-1">Runs:</span>
                    <Badge variant="outline" className="bg-[#d4e3fe] text-[#002e7a] border-[#002e7a]/20">
                        {sessions}
                    </Badge>
                </div>
            </div>

            {/* Duration Selector (Only visible in Focus mode or when stopped) */}
            <AnimatePresence>
                {mode === 'focus' && !isActive && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="flex gap-2 mb-4 justify-center"
                    >
                        <button
                            onClick={() => handleModeSelect(25)}
                            className={cn(
                                "px-3 py-1 text-xs rounded-full border transition-all",
                                focusDuration === 25
                                    ? "bg-[#002e7a] text-white border-[#002e7a]"
                                    : "text-[#002e7a] border-[#d6d6d6] hover:bg-[#d4e3fe]"
                            )}
                        >
                            25min
                        </button>
                        <button
                            onClick={() => handleModeSelect(50)}
                            className={cn(
                                "px-3 py-1 text-xs rounded-full border transition-all",
                                focusDuration === 50
                                    ? "bg-[#002e7a] text-white border-[#002e7a]"
                                    : "text-[#002e7a] border-[#d6d6d6] hover:bg-[#d4e3fe]"
                            )}
                        >
                            50min
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Timer Display */}
            <div className="text-center mb-4">
                <motion.div
                    className={cn(
                        "text-4xl font-bold tabular-nums tracking-tight",
                        mode === 'break' ? "text-[#002e7a]" : "text-[#002e7a]"
                    )}
                    animate={{ scale: isActive ? [1, 1.02, 1] : 1 }}
                    transition={{ duration: 1, repeat: isActive ? Infinity : 0 }}
                >
                    {formatTime(timeRemaining)}
                </motion.div>

                <div className="text-xs text-[#002e7a]/60 mt-1 font-medium">
                    {mode === 'focus'
                        ? (focusDuration === 25 ? "+ 5min Break" : "+ 10min Break")
                        : "Recharge"}
                </div>

                {/* Progress Ring */}
                <div className="relative w-full h-1.5 bg-[#d6d6d6]/50 rounded-full mt-4 overflow-hidden">
                    <motion.div
                        className={cn(
                            "absolute left-0 top-0 h-full",
                            mode === 'focus'
                                ? "bg-gradient-to-r from-[#002e7a] to-[#3385FF]"
                                : "bg-gradient-to-r from-[#00C853] to-[#69F0AE]"
                        )}
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 0.3 }}
                    />
                </div>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-2">
                <Button
                    variant={isActive ? "secondary" : "primary"}
                    className="flex-1 text-sm h-9"
                    onClick={handleToggle}
                >
                    {isActive ? (
                        <>
                            <Pause className="w-3.5 h-3.5 mr-1.5" />
                            Pause
                        </>
                    ) : (
                        <>
                            <Play className="w-3.5 h-3.5 mr-1.5" />
                            {timeRemaining === totalTime ? 'Start' : 'Resume'}
                        </>
                    )}
                </Button>
                <Button
                    variant="ghost"
                    className="px-3 h-9 text-[#002e7a] hover:bg-[#d4e3fe]"
                    onClick={handleSkip}
                    title="Skip to next phase"
                >
                    <SkipForward className="w-4 h-4" />
                </Button>
            </div>
        </motion.div>
    );
}
