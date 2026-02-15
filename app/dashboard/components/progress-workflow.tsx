"use client";

import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WorkflowStep {
    label: string;
    icon: string;
    completed: boolean;
}

interface ProgressWorkflowProps {
    current: number; // 0-4 (current step index)
    className?: string;
}

const WORKFLOW_STEPS: WorkflowStep[] = [
    { label: 'Job', icon: '📋', completed: false },
    { label: 'CV', icon: '📄', completed: false },
    { label: 'Opt', icon: '✨', completed: false },
    { label: 'CL', icon: '📝', completed: false },
    { label: 'Review', icon: '✅', completed: false },
];

export function ProgressWorkflow({ current, className }: ProgressWorkflowProps) {
    const steps = WORKFLOW_STEPS.map((step, index) => ({
        ...step,
        completed: index < current,
        active: index === current,
    }));

    return (
        <div className={cn("flex items-center gap-1", className)}>
            {steps.map((step, index) => (
                <div key={index} className="flex items-center">
                    {/* Step Badge */}
                    <motion.div
                        className={cn(
                            "flex items-center justify-center w-8 h-8 rounded-md text-sm font-medium",
                            step.completed && "bg-[#00C853] text-white",
                            step.active && "bg-[#0066FF] text-white",
                            !step.completed && !step.active && "bg-[#E7E7E5] text-[#73726E]"
                        )}
                        whileHover={{ scale: 1.05, y: -1 }}
                        transition={{ duration: 0.2 }}
                        title={step.label}
                    >
                        {step.completed ? (
                            <Check className="w-4 h-4" />
                        ) : (
                            <span>{step.icon}</span>
                        )}
                    </motion.div>

                    {/* Connector Line */}
                    {index < steps.length - 1 && (
                        <div
                            className={cn(
                                "w-8 h-0.5 mx-0.5",
                                index < current ? "bg-[#00C853]" : "bg-[#E7E7E5]"
                            )}
                        />
                    )}
                </div>
            ))}
        </div>
    );
}
