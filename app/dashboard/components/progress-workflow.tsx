"use client";

/**
 * ProgressWorkflow — Horizontal node-chain stepper.
 * 4 circular nodes connected by lines, matching the Pathly design language.
 * No emojis — only Lucide icons and Framer Motion transitions.
 */

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface ProgressWorkflowProps {
    current: number; // 0-4 (current step index from job status)
    className?: string;
    onStepClick?: (stepIndex: number) => void;
    activeTab?: number | null;
}

const WORKFLOW_NODES = [
    { label: 'CV Match', pct: '10%', tabIndex: 1 },
    { label: 'CV Opt.', pct: '30%', tabIndex: 2 },
    { label: 'Cover Letter', pct: '75%', tabIndex: 3 },
    { label: '', pct: '100%', tabIndex: 4 },
];

/**
 * Mapping from `current` (workflowStep 0-4) to which nodes turn green:
 *  workflowStep 0 (NEW)          → none
 *  workflowStep 1 (JOB_REVIEWED / CV Match ready) → node 0
 *  workflowStep 2 (CV_CHECKED)   → node 0, 1
 *  workflowStep 3 (CV_OPTIMIZED) → node 0, 1, 2
 *  workflowStep 4 (CL_GENERATED / READY) → all
 */
function nodeFilled(nodeIndex: number, workflowStep: number): boolean {
    // Offset: workflowStep 1 fills node 0, etc.
    return nodeIndex < workflowStep;
}

const NODE_SIZE = 36; // px

export function ProgressWorkflow({ current, className, onStepClick, activeTab }: ProgressWorkflowProps) {
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
                            title={node.label || 'Fertig'}
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
