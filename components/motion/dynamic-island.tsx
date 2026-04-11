"use client";

import React, { useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { useNotificationStore } from '@/store/notification-store';

// ============================================================================
// DYNAMIC ISLAND — Apple-inspired notification system in the Pathly logo
// Animation: Idle → Expand → Content → Collapse → Idle (~3.5s per cycle)
//
// Bug fix v2: Replaced fallbackRef + hardReset() pattern with a stale-id
// guard. The old code had a race: cycleRef fired shift() at 3500ms, then
// fallbackRef fired hardReset() at 5000ms on the same `current` — wiping
// the NEXT notification that shift() had just promoted. The stale-id check
// below ensures the timeout only advances state if the same notification
// is still active when the timer fires.
// ============================================================================

const CYCLE_DURATION = 3500; // Total animation cycle in ms

export function DynamicIsland() {
    const current = useNotificationStore((s) => s.current);
    const shift = useNotificationStore((s) => s.shift);
    const cycleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearCycle = useCallback(() => {
        if (cycleRef.current) clearTimeout(cycleRef.current);
    }, []);

    useEffect(() => {
        clearCycle();

        if (!current) return;

        // Capture the ID at effect-time so the callback can verify
        // the notification is still the one we started the timer for.
        // This prevents a stale timer from advancing the queue when
        // a rapid push has already changed `current`.
        const capturedId = current.id;

        cycleRef.current = setTimeout(() => {
            const stillCurrent = useNotificationStore.getState().current;
            if (stillCurrent?.id === capturedId) {
                shift();
            }
        }, CYCLE_DURATION);

        return clearCycle;
    }, [current, shift, clearCycle]);

    const isAnimating = !!current;

    return (
        <div className="flex items-center gap-2 px-2 relative">
            {/* The morphing island container */}
            <motion.div
                className="rounded-lg bg-gradient-to-br from-[#012e7a] to-[#1a4a9a] flex items-center justify-center overflow-hidden cursor-default"
                animate={{
                    width: isAnimating ? 220 : 32,
                    height: 32,
                }}
                transition={{
                    duration: 0.3,
                    ease: [0.4, 0, 0.2, 1], // Apple-style ease
                }}
                style={{ minWidth: 32 }}
            >
                <AnimatePresence mode="wait">
                    {isAnimating ? (
                        <motion.span
                            key={current.id}
                            className="text-white text-sm font-medium whitespace-nowrap px-4"
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            transition={{ duration: 0.2 }}
                        >
                            {current.text}
                        </motion.span>
                    ) : (
                        <motion.span
                            key="p-icon"
                            className="text-white font-bold text-lg"
                            initial={{ opacity: 0, scale: 0.5 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.5 }}
                            transition={{ duration: 0.2 }}
                        >
                            P
                        </motion.span>
                    )}
                </AnimatePresence>
            </motion.div>

            {/* "Pathly" text — fades out when animating */}
            <AnimatePresence>
                {!isAnimating && (
                    <motion.span
                        className="text-lg font-semibold text-[#37352F]"
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -8 }}
                        transition={{ duration: 0.25 }}
                    >
                        Pathly
                    </motion.span>
                )}
            </AnimatePresence>
        </div>
    );
}
