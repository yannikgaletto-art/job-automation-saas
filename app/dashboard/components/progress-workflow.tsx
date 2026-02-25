"use client";

/**
 * ProgressWorkflow -- Horizontal node-chain stepper.
 * 4 circular nodes connected by lines, matching the Pathly design language.
 * No emojis -- only Lucide icons and Framer Motion transitions.
 */

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
// canvas-confetti uses browser globals — must be imported dynamically in useEffect only

interface ProgressWorkflowProps {
    current: number; // 0-4 (current step index from job status)
    className?: string;
    onStepClick?: (stepIndex: number) => void;
    activeTab?: number | null;
}

const WORKFLOW_NODES = [
    { label: 'Steckbrief', pct: '10%', tabIndex: 0 },
    { label: 'CV Match', pct: '30%', tabIndex: 1 },
    { label: 'CV Opt.', pct: '75%', tabIndex: 2 },
    { label: 'Cover Letter', pct: '100%', tabIndex: 3 },
];

/**
 * Mapping from `current` (workflowStep 0-4) to which nodes turn green:
 *  workflowStep 0 (NEW)          -> none
 *  workflowStep 1 (JOB_REVIEWED / Steckbrief done) -> node 0
 *  workflowStep 2 (CV_CHECKED)   -> node 0, 1
 *  workflowStep 3 (CV_OPTIMIZED) -> node 0, 1, 2
 *  workflowStep 4 (CL_GENERATED / READY) -> all
 */
function nodeFilled(nodeIndex: number, workflowStep: number): boolean {
    return nodeIndex < workflowStep;
}

const NODE_SIZE = 36; // px

export function ProgressWorkflow({ current, className, onStepClick, activeTab }: ProgressWorkflowProps) {
    // Confetti when all 4 nodes are filled (workflowStep >= 4)
    // Dynamic import ensures canvas-confetti never runs on the server
    useEffect(() => {
        if (current >= 4) {
            import('canvas-confetti').then(({ default: confetti }) => {
                const duration = 2500;
                const end = Date.now() + duration;
                const frame = () => {
                    confetti({
                        particleCount: 4,
                        angle: 60,
                        spread: 55,
                        origin: { x: 0, y: 0.7 },
                        colors: ['#002e7a', '#3b82f6', '#22c55e', '#60a5fa'],
                    });
                    confetti({
                        particleCount: 4,
                        angle: 120,
                        spread: 55,
                        origin: { x: 1, y: 0.7 },
                        colors: ['#002e7a', '#3b82f6', '#22c55e', '#60a5fa'],
                    });
                    if (Date.now() < end) {
                        requestAnimationFrame(frame);
                    }
                };
                frame();
            });
        }
    }, [current]);

    return (
        <div className={cn("flex items-center h-14", className)}>
            {WORKFLOW_NODES.map((node, idx) => {
                const filled = nodeFilled(idx, current);
                const isActiveTab = activeTab === node.tabIndex;
                const isClickable = !!onStepClick;

                return (
                    <div key={idx} className="flex items-center">
                        {/* Node */}
                        <motion.button
                            onClick={(e) => {
                                if (onStepClick) {
                                    e.stopPropagation();
                                    onStepClick(node.tabIndex);
                                }
                            }}
                            className={cn(
                                "relative flex items-center justify-center rounded-full border-2 transition-colors",
                                isClickable && "cursor-pointer",
                                isActiveTab && "ring-2 ring-offset-1 ring-blue-600",
                                filled
                                    ? "bg-green-500 border-green-500 text-white"
                                    : "bg-white border-slate-300 text-slate-400"
                            )}
                            style={{ width: NODE_SIZE, height: NODE_SIZE }}
                            animate={filled ? { scale: [0.85, 1] } : {}}
                            transition={{ duration: 0.4, ease: "easeOut" }}
                            whileHover={isClickable ? { scale: 1.1, y: -1 } : {}}
                            whileTap={isClickable ? { scale: 0.95 } : {}}
                            title={node.label}
                            type="button"
                        >
                            {/* Percentage text */}
                            <span className={cn(
                                "text-[10px] font-bold leading-none select-none",
                                filled ? "text-white" : "text-slate-400"
                            )}>
                                {filled ? node.pct : ''}
                            </span>
                        </motion.button>

                        {/* Connector line */}
                        {idx < WORKFLOW_NODES.length - 1 && (
                            <motion.div
                                className={cn(
                                    "h-0.5 mx-1",
                                    nodeFilled(idx, current) && nodeFilled(idx + 1, current)
                                        ? "bg-green-500"
                                        : "bg-slate-200"
                                )}
                                style={{ width: 24 }}
                                animate={
                                    nodeFilled(idx, current) && nodeFilled(idx + 1, current)
                                        ? { scaleX: [0, 1], originX: 0 }
                                        : {}
                                }
                                transition={{ duration: 0.4, ease: "easeOut", delay: 0.1 }}
                            />
                        )}
                    </div>
                );
            })}
        </div>
    );
}
