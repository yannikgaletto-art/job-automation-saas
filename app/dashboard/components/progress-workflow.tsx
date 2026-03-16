"use client";

/**
 * ProgressWorkflow -- Slim horizontal progress bar.
 * Replaces the 4-circle stepper with a clean, minimal bar.
 * Matches Pathly design language (colors from CLAUDE.md §3).
 *
 * Contract 9 (SICHERHEITSARCHITEKTUR.md) canonical mapping preserved:
 *   pending           → 0%
 *   processing        → 10%
 *   steckbrief_conf.  → 30%
 *   cv_match_done     → 30%
 *   cv_optimized      → 60%
 *   cover_letter_done → 100%
 *   ready_for_review  → 100%
 */

import { cn } from '@/lib/utils';

interface ProgressWorkflowProps {
    current: number; // workflowStep percentage (0 | 10 | 30 | 60 | 100)
    className?: string;
    onStepClick?: (stepIndex: number) => void;
    activeTab?: number | null;
    jobId: string;
}

/**
 * Maps workflowStep to the next logical tab index for click handling.
 */
function getTabForStep(workflowStep: number): number {
    if (workflowStep < 10) return 0;  // Steckbrief
    if (workflowStep < 30) return 1;  // CV Match
    if (workflowStep < 60) return 2;  // CV Opt.
    if (workflowStep < 100) return 3; // Cover Letter
    return 3;                          // Done — stay on Cover Letter
}

export function ProgressWorkflow({ current, className, onStepClick, activeTab: _activeTab, jobId: _jobId }: ProgressWorkflowProps) {
    const isClickable = !!onStepClick;
    const fillPercent = Math.min(Math.max(current, 0), 100);
    const isComplete = fillPercent >= 100;

    return (
        <div
            className={cn(
                "flex items-center gap-3 h-14",
                isClickable && "cursor-pointer",
                className
            )}
            onClick={(e) => {
                if (onStepClick) {
                    e.stopPropagation();
                    onStepClick(getTabForStep(current));
                }
            }}
            role={isClickable ? "button" : undefined}
            tabIndex={isClickable ? 0 : undefined}
            onKeyDown={(e) => {
                if (isClickable && e.key === 'Enter' && onStepClick) {
                    onStepClick(getTabForStep(current));
                }
            }}
        >
            {/* Progress Bar */}
            <div className="flex-1 h-1 rounded-full bg-[#E7E7E5] overflow-hidden">
                <div
                    className={cn(
                        "h-full rounded-full transition-all duration-500 ease-out",
                        isComplete ? "bg-green-500" : "bg-gradient-to-r from-[#002e7a] to-[#3B82F6]"
                    )}
                    style={{ width: `${fillPercent}%` }}
                />
            </div>

            {/* Percentage Label */}
            <span className={cn(
                "text-xs font-medium tabular-nums shrink-0 w-8 text-right",
                isComplete ? "text-green-600" : "text-[#73726E]"
            )}>
                {fillPercent}%
            </span>
        </div>
    );
}
