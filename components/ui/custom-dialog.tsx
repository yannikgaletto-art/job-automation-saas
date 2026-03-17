'use client';

import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';

interface CustomDialogProps {
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    children: React.ReactNode;
    className?: string;
    maxWidth?: string;
}

export function CustomDialog({
    isOpen,
    onClose,
    title,
    children,
    className,
    maxWidth = "max-w-md"
}: CustomDialogProps) {
    // Track if we're mounted client-side (needed for portal)
    const [mounted, setMounted] = useState(false);
    useEffect(() => { setMounted(true); }, []);

    // Close on escape key
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        if (isOpen) window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [isOpen, onClose]);

    if (!mounted) return null;

    const dialog = (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/40 z-[9998] backdrop-blur-sm"
                    />

                    {/* Centering wrapper — uses flexbox, NOT transform, so Framer Motion can't break it */}
                    <div
                        className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none p-4"
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ duration: 0.2, ease: 'easeOut' }}
                            className={cn(
                                "w-full bg-white rounded-xl shadow-2xl flex flex-col border border-[#d6d6d6] pointer-events-auto min-h-0 overflow-hidden",
                                maxWidth,
                                className
                            )}
                            style={{ maxHeight: 'min(85vh, 680px)' }}
                        >
                            {/* Header */}
                            <div className="flex items-center justify-between px-6 py-4 border-b border-[#d6d6d6] bg-[#FAFAF9] shrink-0 rounded-t-xl">
                                <h2 className="text-lg font-semibold text-[#37352F]">{title || ' '}</h2>
                                <button onClick={onClose} className="text-[#a1a1aa] hover:text-[#37352F] transition-colors ml-auto">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Body — scrollable so buttons are always reachable */}
                            <div className="overflow-y-auto flex-1 overscroll-contain">
                                {children}
                            </div>
                        </motion.div>
                    </div>
                </>
            )}
        </AnimatePresence>
    );

    // Portal renders directly into body — bypasses any ancestor transform context
    return createPortal(dialog, document.body);
}
