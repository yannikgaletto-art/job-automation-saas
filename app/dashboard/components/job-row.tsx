"use client";

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronRight, FileText, Check, Sparkles, Mail, Eye, Trash2 } from 'lucide-react';
import { ProgressWorkflow } from './progress-workflow';
import { Button } from '@/components/motion/button';
import { Badge } from '@/components/motion/badge';
import { AnimatedMatchScore } from '@/components/motion/count-up';
import { cn } from '@/lib/utils';

export interface Job {
    id: string;
    company: string;
    jobTitle: string;
    matchScore: number;
    workflowStep: number; // 0-4
    status: 'NEW' | 'JOB_REVIEWED' | 'CV_CHECKED' | 'CV_OPTIMIZED' | 'CL_GENERATED' | 'READY';
}

interface JobRowProps {
    job: Job;
    expanded: boolean;
    onToggle: () => void;
}

export function JobRow({ job, expanded, onToggle }: JobRowProps) {
    const [hovering, setHovering] = useState(false);

    // Status-based next action
    const getNextAction = () => {
        switch (job.status) {
            case 'NEW':
                return { icon: <FileText className="w-4 h-4" />, label: 'View Job', variant: 'outline' as const };
            case 'JOB_REVIEWED':
                return { icon: <Check className="w-4 h-4" />, label: 'Check CV Match', variant: 'outline' as const };
            case 'CV_CHECKED':
                return { icon: <Sparkles className="w-4 h-4" />, label: 'Optimize CV', variant: 'outline' as const };
            case 'CV_OPTIMIZED':
                return { icon: <Mail className="w-4 h-4" />, label: 'Generate Cover Letter', variant: 'outline' as const };
            case 'CL_GENERATED':
            case 'READY':
                return { icon: <Check className="w-4 h-4" />, label: 'Review & Apply', variant: 'primary' as const };
            default:
                return { icon: <FileText className="w-4 h-4" />, label: 'View Job', variant: 'outline' as const };
        }
    };

    const nextAction = getNextAction();

    return (
        <motion.div
            className="border-b border-[#d6d6d6] last:border-b-0"
            onHoverStart={() => setHovering(true)}
            onHoverEnd={() => setHovering(false)}
        >
            {/* Compact View */}
            <div
                className="flex items-center gap-2 px-6 py-4 cursor-pointer hover:bg-[#d4e3fe] transition-colors"
                onClick={onToggle}
            >
                {/* Expand Icon */}
                <motion.div
                    animate={{ rotate: expanded ? 90 : 0 }}
                    transition={{ duration: 0.2 }}
                >
                    <ChevronRight className="w-4 h-4 text-[#002e7a]" />
                </motion.div>

                {/* Status Dot */}
                <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    className={cn(
                        "w-2 h-2 rounded-full",
                        job.status === 'READY' ? "bg-[#00C853]" :
                            job.status === 'CL_GENERATED' ? "bg-[#cce8b5]" :
                                "bg-[#d6d6d6]"
                    )}
                />

                {/* Company */}
                <div className="w-28 md:w-32 font-medium text-[#002e7a] truncate" title={job.company}>{job.company}</div>

                {/* Job Title */}
                <div className="w-40 md:w-48 text-[#002e7a] font-medium truncate" title={job.jobTitle}>{job.jobTitle}</div>

                {/* Match Score */}
                <div className="w-20 text-center flex justify-center">
                    <AnimatedMatchScore score={job.matchScore} showIcon={false} className="scale-90" />
                </div>

                {/* Progress */}
                <div className="flex-1 min-w-[200px]">
                    <ProgressWorkflow current={job.workflowStep} />
                </div>

                {/* Next Action */}
                <div className="w-48 md:w-56">
                    <Button variant={nextAction.variant} className="w-full text-sm">
                        {nextAction.icon}
                        <span className="ml-2">{nextAction.label}</span>
                    </Button>
                </div>
            </div>

            {/* Hover Quick Actions */}
            <AnimatePresence>
                {hovering && !expanded && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="px-6 pb-4 flex items-center gap-2 ml-28"
                    >
                        <Button variant="ghost" className="text-xs px-3 py-1">
                            <FileText className="w-3 h-3 mr-1" /> Job
                        </Button>
                        <Button variant="ghost" className="text-xs px-3 py-1">
                            <Check className="w-3 h-3 mr-1" /> CV
                        </Button>
                        <Button variant="ghost" className="text-xs px-3 py-1">
                            <Sparkles className="w-3 h-3 mr-1" /> Opt.
                        </Button>
                        <Button variant="ghost" className="text-xs px-3 py-1">
                            <Mail className="w-3 h-3 mr-1" /> CL
                        </Button>
                        <Button variant="ghost" className="text-xs px-3 py-1">
                            <Eye className="w-3 h-3 mr-1" /> Review
                        </Button>
                        <Button variant="ghost" className="text-xs px-3 py-1">
                            <Trash2 className="w-3 h-3 mr-1" />
                        </Button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Expanded Details */}
            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="overflow-hidden bg-[#d4e3fe] border-t border-[#d6d6d6]"
                    >
                        <div className="px-6 py-6 space-y-4">
                            <div className="text-sm text-[#002e7a] opacity-80">
                                Workflow Details coming soon... (Step 1: About Job, Step 2: CV Match, etc.)
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}
