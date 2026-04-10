'use client';

/**
 * ToggleSection — Collapsible section wrapper for analytics dashboard.
 * Uses Framer Motion AnimatePresence for smooth open/close.
 * Persists open/close state in localStorage per section-id.
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

interface ToggleSectionProps {
    id: string;
    title: string;
    badge?: string | number;
    defaultOpen?: boolean;
    children: React.ReactNode;
}

export function ToggleSection({ id, title, badge, defaultOpen = true, children }: ToggleSectionProps) {
    const storageKey = `pathly_analytics_${id}`;
    const [isOpen, setIsOpen] = useState(defaultOpen);
    const [hasMounted, setHasMounted] = useState(false);

    // Read from localStorage after mount (SSR-safe)
    useEffect(() => {
        setHasMounted(true);
        try {
            const stored = localStorage.getItem(storageKey);
            if (stored !== null) setIsOpen(stored === 'true');
        } catch {
            // localStorage unavailable (e.g. incognito quota exceeded)
        }
    }, [storageKey]);

    // Persist to localStorage on toggle (skip initial mount)
    useEffect(() => {
        if (!hasMounted) return;
        try {
            localStorage.setItem(storageKey, String(isOpen));
        } catch {
            // Graceful fallback
        }
    }, [isOpen, hasMounted, storageKey]);

    return (
        <div className="space-y-3">
            <button
                onClick={() => setIsOpen(prev => !prev)}
                className="w-full flex items-center gap-3 group cursor-pointer"
            >
                <motion.div
                    animate={{ rotate: isOpen ? 0 : -90 }}
                    transition={{ duration: 0.2 }}
                >
                    <ChevronDown className="w-4 h-4 text-[#73726E] group-hover:text-[#002e7a] transition-colors" />
                </motion.div>
                <h2 className="text-sm font-semibold text-[#002e7a] uppercase tracking-wider">
                    {title}
                </h2>
                {badge !== undefined && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#E8EFF8] text-[#002e7a]">
                        {badge}
                    </span>
                )}
            </button>

            <AnimatePresence initial={false}>
                {isOpen && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: 'easeInOut' }}
                        className="overflow-hidden"
                    >
                        <div className="space-y-6">
                            {children}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
