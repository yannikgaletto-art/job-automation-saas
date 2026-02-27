"use client";

/**
 * ProgressWorkflow -- Horizontal node-chain stepper.
 * 4 circular nodes connected by lines, matching the Pathly design language.
 * No emojis -- only Lucide icons and Framer Motion transitions.
 *
 * Batch 8 Fix (Contract 9, SICHERHEITSARCHITEKTUR.md):
 * nodeFilled uses threshold comparison (workflowStep >= node.threshold)
 * instead of the broken index comparison (nodeIndex < workflowStep).
 * This ensures only completed phases are green.
 */

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface ProgressWorkflowProps {
    current: number; // workflowStep percentage (0 | 10 | 30 | 60 | 100)
    className?: string;
    onStepClick?: (stepIndex: number) => void;
    activeTab?: number | null;
    jobId: string;
}

/**
 * threshold = the workflowStep percentage at which this node turns green.
 * Contract 9 (SICHERHEITSARCHITEKTUR.md) canonical mapping:
 *   pending           → 0   → all nodes gray
 *   processing        → 10  → node 0 green (threshold 10)
 *   steckbrief_conf.  → 30  → nodes 0+1 green (threshold 10, 30)
 *   cv_match_done     → 30  → nodes 0+1 green
 *   cv_optimized      → 60  → nodes 0+1+2 green (threshold 10, 30, 60)
 *   cover_letter_done → 100 → all nodes green
 *   ready_for_review  → 100 → all nodes green
 */
const WORKFLOW_NODES = [
    { label: 'Steckbrief', pct: '10%', tabIndex: 0, threshold: 10 },
    { label: 'CV Match', pct: '30%', tabIndex: 1, threshold: 30 },
    { label: 'CV Opt.', pct: '75%', tabIndex: 2, threshold: 60 },
    { label: 'Cover Letter', pct: '100%', tabIndex: 3, threshold: 100 },
] as const;

/** Node is green when the current workflowStep has reached this node's threshold. */
function nodeFilled(threshold: number, workflowStep: number): boolean {
    return workflowStep >= threshold;
}

/**
 * Node is "current" (blue active ring) when:
 *   - the previous node's threshold has been reached, but
 *   - this node's threshold has NOT yet been reached.
 * Node 0 is current when workflowStep < 10 (i.e. pending state).
 */
function nodeIsCurrent(nodeIndex: number, workflowStep: number): boolean {
    const node = WORKFLOW_NODES[nodeIndex];
    const prevThreshold = nodeIndex === 0 ? 0 : WORKFLOW_NODES[nodeIndex - 1].threshold;
    return workflowStep >= prevThreshold && workflowStep < node.threshold;
}

const NODE_SIZE = 36;

export function ProgressWorkflow({ current, className, onStepClick, activeTab, jobId: _jobId }: ProgressWorkflowProps) {

    return (
        <div className={cn("flex items-center h-14", className)}>
            {WORKFLOW_NODES.map((node, idx) => {
                const filled = nodeFilled(node.threshold, current);
                const isCurrent = nodeIsCurrent(idx, current);
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
                                    : isCurrent
                                        ? "bg-blue-50 border-blue-500 text-blue-600"
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
                            {/* Percentage text or label */}
                            <span className={cn(
                                "text-[10px] font-bold leading-none select-none",
                                filled ? "text-white" : isCurrent ? "text-blue-600" : "text-slate-400"
                            )}>
                                {filled ? node.pct : isCurrent ? node.pct : ''}
                            </span>
                        </motion.button>

                        {/* Connector line — green only when both adjacent nodes are filled */}
                        {idx < WORKFLOW_NODES.length - 1 && (
                            <motion.div
                                className={cn(
                                    "h-0.5 mx-1",
                                    nodeFilled(node.threshold, current) && nodeFilled(WORKFLOW_NODES[idx + 1].threshold, current)
                                        ? "bg-green-500"
                                        : "bg-slate-200"
                                )}
                                style={{ width: 24 }}
                                animate={
                                    nodeFilled(node.threshold, current) && nodeFilled(WORKFLOW_NODES[idx + 1].threshold, current)
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
