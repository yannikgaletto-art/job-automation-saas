'use client';

/**
 * Pulse Mission Panel — Rule-based task suggestions.
 * Displays up to 5 mission cards generated from pipeline state.
 * User can accept (→ creates real task), dismiss (→ gone for today),
 * or DRAG directly onto the timeline (→ auto-accept + schedule).
 *
 * Design: CLAUDE.md Visual Standards — #FAFAF9, Borders #E7E7E5, lucide-react, framer-motion.
 */

import { useState, useCallback } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Target,
    Check,
    X,
    ClipboardCheck,
    FileSearch,
    FileText,
    Send,
    Search,
    FileUp,
    Clock,
    GripVertical,
} from 'lucide-react';
import { useCalendarStore, type PulseSuggestion } from '@/store/use-calendar-store';

// ─── Icon Mapping ─────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ElementType> = {
    'clipboard-check': ClipboardCheck,
    'file-search': FileSearch,
    'file-text': FileText,
    'send': Send,
    'search': Search,
    'file-up': FileUp,
};

// ─── Priority Styling ─────────────────────────────────────────────

const PRIORITY_CONFIG = {
    high: { dot: 'bg-red-500', label: 'Hoch', bg: 'bg-red-50', border: 'border-red-200' },
    medium: { dot: 'bg-yellow-500', label: 'Mittel', bg: 'bg-yellow-50', border: 'border-yellow-200' },
    low: { dot: 'bg-green-500', label: 'Niedrig', bg: 'bg-green-50', border: 'border-green-200' },
};

// ─── localStorage Key ─────────────────────────────────────────────

function getDismissKey(): string {
    const today = new Date().toISOString().split('T')[0];
    return `pathly_pulse_dismissed_${today}`;
}

function getDismissedIds(): string[] {
    try {
        const raw = localStorage.getItem(getDismissKey());
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function addDismissedId(id: string): void {
    const ids = getDismissedIds();
    if (!ids.includes(id)) {
        ids.push(id);
        localStorage.setItem(getDismissKey(), JSON.stringify(ids));
    }
}

// ─── Helper: Accept a suggestion via API ──────────────────────────

export async function acceptSuggestionViaAPI(suggestion: PulseSuggestion) {
    const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            title: suggestion.title,
            estimated_minutes: suggestion.estimated_minutes,
            source: 'pulse',
            job_queue_id: suggestion.job_queue_id,
        }),
    });
    const data = await res.json();
    if (!data.success || !data.task) {
        throw new Error('Task creation failed');
    }
    return data.task;
}

// ─── Mission Card (Draggable) ─────────────────────────────────────

function MissionCard({ suggestion }: { suggestion: PulseSuggestion }) {
    const { dismissSuggestion, acceptSuggestion } = useCalendarStore();
    const [isAccepting, setIsAccepting] = useState(false);

    // Make this card draggable — ID prefixed with "pulse-" so orchestrator can detect it
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: suggestion.id,
        data: { suggestion, type: 'pulse' },
    });

    const style = transform
        ? {
            transform: CSS.Translate.toString(transform),
            zIndex: 100,
        }
        : undefined;

    const IconComponent = ICON_MAP[suggestion.icon] || Target;
    const priority = PRIORITY_CONFIG[suggestion.priority];

    const handleAccept = useCallback(async () => {
        if (isAccepting) return;
        setIsAccepting(true);
        try {
            const task = await acceptSuggestionViaAPI(suggestion);
            acceptSuggestion(suggestion, task);
        } catch {
            setIsAccepting(false);
        }
    }, [suggestion, acceptSuggestion, isAccepting]);

    const handleDismiss = useCallback(() => {
        addDismissedId(suggestion.id);
        dismissSuggestion(suggestion.id);
    }, [suggestion.id, dismissSuggestion]);

    return (
        <motion.div
            ref={setNodeRef}
            style={style as React.CSSProperties}
            layout
            initial={{ opacity: 0, y: -8 }}
            animate={{
                opacity: isDragging ? 0.7 : 1,
                y: 0,
                scale: isDragging ? 1.03 : 1,
            }}
            exit={{ opacity: 0, x: -20, height: 0, marginBottom: 0 }}
            transition={{ duration: 0.2 }}
            className={`
                flex items-center gap-3 p-3 rounded-lg border
                bg-white transition-shadow
                ${isDragging ? 'shadow-xl border-[#002e7a]' : 'hover:shadow-sm'}
                ${priority.border}
            `}
        >
            {/* Drag Handle */}
            <span
                {...listeners}
                {...attributes}
                className="text-[#D1D5DB] hover:text-[#73726E] cursor-grab active:cursor-grabbing touch-none flex-shrink-0"
            >
                <GripVertical className="w-4 h-4" />
            </span>

            {/* Icon */}
            <div className={`
                flex-shrink-0 w-8 h-8 rounded-md flex items-center justify-center
                ${priority.bg}
            `}>
                <IconComponent className="w-4 h-4 text-[#37352F]" />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#37352F] truncate">
                    {suggestion.title}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${priority.dot}`} />
                    <span className="text-xs text-[#73726E]">
                        {priority.label}
                    </span>
                    <span className="text-xs text-[#73726E] flex items-center gap-0.5">
                        <Clock className="w-3 h-3" />
                        {suggestion.estimated_minutes}m
                    </span>
                </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 flex-shrink-0">
                <button
                    onClick={handleAccept}
                    disabled={isAccepting}
                    className="
                        w-7 h-7 rounded-md flex items-center justify-center
                        bg-emerald-50 hover:bg-emerald-100 text-emerald-600
                        transition-colors disabled:opacity-50
                    "
                    title="Mission annehmen"
                >
                    <Check className="w-3.5 h-3.5" />
                </button>
                <button
                    onClick={handleDismiss}
                    className="
                        w-7 h-7 rounded-md flex items-center justify-center
                        bg-gray-50 hover:bg-gray-100 text-gray-400
                        transition-colors
                    "
                    title="Mission ablehnen"
                >
                    <X className="w-3.5 h-3.5" />
                </button>
            </div>
        </motion.div>
    );
}

// ─── Skeleton Loader ──────────────────────────────────────────────

function PulseSkeleton() {
    return (
        <div className="space-y-2">
            {[1, 2, 3].map((i) => (
                <div
                    key={i}
                    className="flex items-center gap-3 p-3 rounded-lg border border-[#E7E7E5]"
                >
                    <div className="w-8 h-8 rounded-md bg-gray-100 animate-pulse" />
                    <div className="flex-1 space-y-1.5">
                        <div className="h-3.5 bg-gray-100 rounded animate-pulse w-3/4" />
                        <div className="h-2.5 bg-gray-50 rounded animate-pulse w-1/3" />
                    </div>
                    <div className="flex gap-1">
                        <div className="w-7 h-7 rounded-md bg-gray-50 animate-pulse" />
                        <div className="w-7 h-7 rounded-md bg-gray-50 animate-pulse" />
                    </div>
                </div>
            ))}
        </div>
    );
}

// ─── Main Panel ───────────────────────────────────────────────────

export function PulseMissionPanel() {
    const { pulseSuggestions, pulseLoading } = useCalendarStore();
    const [isExpanded, setIsExpanded] = useState(true);

    const visibleSuggestions = pulseSuggestions.filter(
        (s) => !getDismissedIds().includes(s.id)
    );

    // Show header + empty state even when no suggestions (never fully hidden)
    const isEmpty = !pulseLoading && visibleSuggestions.length === 0;

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
                <span className="font-medium">
                    Pathlys Job Empfehlung
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
                            {pulseLoading ? (
                                <PulseSkeleton />
                            ) : isEmpty ? (
                                <p className="text-xs text-[#A8A29E] py-1">
                                    Keine Job-Empfehlungen vorhanden.
                                </p>
                            ) : (
                                <AnimatePresence mode="popLayout">
                                    {visibleSuggestions.map((suggestion) => (
                                        <MissionCard
                                            key={suggestion.id}
                                            suggestion={suggestion}
                                        />
                                    ))}
                                </AnimatePresence>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

