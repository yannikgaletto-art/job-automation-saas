"use client";

/**
 * ProgressWorkflow — Tile-based progress indicator.
 * Shows a rectangular tile for each completed workflow step.
 * Tiles only appear when the phase is DONE — otherwise invisible.
 * Clicking a tile opens the corresponding tab.
 *
 * Contract 9 (SICHERHEITSARCHITEKTUR.md) canonical mapping preserved.
 */

import { cn } from '@/lib/utils';

interface ProgressWorkflowProps {
    current: number; // workflowStep percentage (0 | 10 | 30 | 60 | 100)
    className?: string;
    onStepClick?: (stepIndex: number) => void;
    activeTab?: number | null;
    jobId: string;
}

const WORKFLOW_TILES = [
    { label: 'Steckbrief',    doneAt: 10,  tabIndex: 0 },
    { label: 'CV Match',      doneAt: 30,  tabIndex: 1 },
    { label: 'CV Optimizer',  doneAt: 60,  tabIndex: 2 },
    { label: 'Cover Letter',  doneAt: 100, tabIndex: 3 },
    { label: 'Video Letter',  doneAt: 110, tabIndex: 4 }, // currently never reached — future-proof
];

export function ProgressWorkflow({ current, className, onStepClick, activeTab: _activeTab, jobId: _jobId }: ProgressWorkflowProps) {
    const fillPercent = Math.min(Math.max(current, 0), 110);
    const doneTiles = WORKFLOW_TILES.filter(t => fillPercent >= t.doneAt);

    if (doneTiles.length === 0) return null;

    return (
        <div className={cn("flex items-center gap-2 h-14", className)}>
            {doneTiles.map((tile) => (
                <button
                    key={tile.tabIndex}
                    onClick={(e) => {
                        e.stopPropagation();
                        onStepClick?.(tile.tabIndex);
                    }}
                    className={cn(
                        "w-28 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all text-center",
                        "bg-white border-[#D0CFC8] text-[#37352F]",
                        "hover:border-[#002e7a] hover:text-[#002e7a] hover:shadow-sm",
                        "cursor-pointer select-none shrink-0"
                    )}
                >
                    {tile.label}
                </button>
            ))}
        </div>
    );
}
