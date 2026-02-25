"use client";

/**
 * PomodoroMiniWidget — persistent circular timer shown in the top-right corner
 * of every dashboard page while the Pomodoro timer is active.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Pause, Play } from 'lucide-react';
import { useCalendarStore } from '@/store/use-calendar-store';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';

const SIZE = 52; // px — outer SVG size
const STROKE = 4;
const RADIUS = (SIZE - STROKE * 2) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function PomodoroMiniWidget() {
    const timerIsActive = useCalendarStore((s) => s.timerIsActive);
    const timerMode = useCalendarStore((s) => s.timerMode);
    const timerTimeRemaining = useCalendarStore((s) => s.timerTimeRemaining);
    const timerTotalTime = useCalendarStore((s) => s.timerTotalTime);
    const timerToggle = useCalendarStore((s) => s.timerToggle);

    const [hovered, setHovered] = useState(false);
    const router = useRouter();

    // Only show when timer has been started (not at full time AND mode is active, or actively running)
    const isStarted = timerIsActive || timerTimeRemaining < timerTotalTime;
    if (!isStarted) return null;

    const progress = (timerTotalTime - timerTimeRemaining) / timerTotalTime; // 0→1
    const strokeDashoffset = CIRCUMFERENCE * (1 - progress);

    const mins = Math.floor(timerTimeRemaining / 60);
    const secs = timerTimeRemaining % 60;
    const label = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

    const isFocus = timerMode === 'focus';
    const ringColor = isFocus ? '#002e7a' : '#00C853';
    const bgColor = isFocus ? '#EFF4FF' : '#F0FFF4';

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, scale: 0.7, y: -8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.7, y: -8 }}
                transition={{ type: 'spring', stiffness: 260, damping: 22 }}
                className="fixed top-4 right-4 z-50"
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                title={isFocus ? 'Focus Time' : 'Break Time'}
            >
                <div
                    className="relative cursor-pointer select-none"
                    style={{ width: SIZE, height: SIZE }}
                    onClick={() => {
                        if (hovered) {
                            timerToggle();
                        } else {
                            router.push('/dashboard');
                        }
                    }}
                >
                    {/* Background circle */}
                    <div
                        className="absolute inset-0 rounded-full shadow-md"
                        style={{ backgroundColor: bgColor }}
                    />

                    {/* SVG progress ring */}
                    <svg
                        width={SIZE}
                        height={SIZE}
                        className="absolute inset-0 -rotate-90"
                        style={{ transform: 'rotate(-90deg)' }}
                    >
                        {/* Track */}
                        <circle
                            cx={SIZE / 2}
                            cy={SIZE / 2}
                            r={RADIUS}
                            fill="none"
                            stroke={ringColor}
                            strokeOpacity={0.15}
                            strokeWidth={STROKE}
                        />
                        {/* Progress */}
                        <motion.circle
                            cx={SIZE / 2}
                            cy={SIZE / 2}
                            r={RADIUS}
                            fill="none"
                            stroke={ringColor}
                            strokeWidth={STROKE}
                            strokeLinecap="round"
                            strokeDasharray={CIRCUMFERENCE}
                            animate={{ strokeDashoffset }}
                            transition={{ duration: 0.4, ease: 'linear' }}
                        />
                    </svg>

                    {/* Center content: timer label or pause/play on hover */}
                    <div className="absolute inset-0 flex items-center justify-center">
                        <AnimatePresence mode="wait">
                            {hovered ? (
                                <motion.div
                                    key="icon"
                                    initial={{ opacity: 0, scale: 0.6 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.6 }}
                                    transition={{ duration: 0.15 }}
                                    onClick={(e) => { e.stopPropagation(); timerToggle(); }}
                                    className="cursor-pointer"
                                >
                                    {timerIsActive
                                        ? <Pause className="w-4 h-4" style={{ color: ringColor }} />
                                        : <Play className="w-4 h-4" style={{ color: ringColor }} />
                                    }
                                </motion.div>
                            ) : (
                                <motion.span
                                    key="time"
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.8 }}
                                    transition={{ duration: 0.15 }}
                                    className={cn(
                                        "text-[10px] font-bold tabular-nums leading-none",
                                        timerIsActive ? "opacity-100" : "opacity-60"
                                    )}
                                    style={{ color: ringColor }}
                                >
                                    {label}
                                </motion.span>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Pulsing ring when active */}
                    {timerIsActive && (
                        <motion.div
                            className="absolute inset-0 rounded-full"
                            style={{ border: `2px solid ${ringColor}` }}
                            animate={{ opacity: [0.4, 0, 0.4], scale: [1, 1.18, 1] }}
                            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                        />
                    )}
                </div>

                {/* Hover tooltip */}
                <AnimatePresence>
                    {hovered && (
                        <motion.div
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 4 }}
                            transition={{ duration: 0.15 }}
                            className="absolute top-full right-0 mt-1.5 whitespace-nowrap bg-[#37352F] text-white text-[10px] px-2 py-1 rounded-md shadow-lg pointer-events-none"
                        >
                            {timerIsActive ? 'Pause' : 'Fortsetzen'} · {isFocus ? 'Focus Time' : 'Break Time'}
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        </AnimatePresence>
    );
}
