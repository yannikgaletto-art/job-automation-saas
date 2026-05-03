'use client';

import { motion } from 'framer-motion';
import { CheckCircle2 } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { cn } from '@/lib/utils';

interface ProgressLoadingPanelProps {
    title: string;
    duration?: string;
    steps: string[];
    activeStep: number;
    className?: string;
}

export function ProgressLoadingPanel({
    title,
    duration,
    steps,
    activeStep,
    className,
}: ProgressLoadingPanelProps) {
    return (
        <div className={cn('w-full px-6 py-8 bg-[#FAFAF9] rounded-xl border border-slate-200', className)}>
            <div className="flex items-center gap-2.5 mb-1">
                <LoadingSpinner className="w-5 h-5 text-[#002e7a] shrink-0" />
                <span className="text-sm font-semibold text-[#37352F]">
                    {title}
                </span>
            </div>
            {duration && (
                <p className="text-xs text-[#73726E] mb-5 pl-[29px]">
                    {duration}
                </p>
            )}

            <div className="space-y-2">
                {steps.map((label, i) => {
                    const isDone = i < activeStep;
                    const isActive = i === activeStep;

                    return (
                        <motion.div
                            key={label}
                            initial={{ opacity: 0, x: -6 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.07, duration: 0.25 }}
                            className={cn(
                                'flex items-center gap-3 px-4 py-2.5 rounded-lg border transition-all duration-300',
                                isDone
                                    ? 'bg-[#EEF2FF] border-[#C7D6F7]'
                                    : isActive
                                        ? 'bg-white border-[#002e7a] shadow-sm'
                                        : 'bg-white border-[#E7E7E5]'
                            )}
                        >
                            <div className={cn(
                                'w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 transition-all duration-300',
                                isDone
                                    ? 'bg-[#002e7a] text-white'
                                    : isActive
                                        ? 'border-2 border-[#002e7a] bg-white text-[#002e7a]'
                                        : 'border border-[#D0CFC8] bg-white text-[#A8A29E]'
                            )}>
                                {isDone ? <CheckCircle2 size={13} /> : <span>{i + 1}</span>}
                            </div>

                            <span className={cn(
                                'text-xs flex-1 transition-all duration-300',
                                isDone
                                    ? 'line-through text-[#002e7a] opacity-60'
                                    : isActive
                                        ? 'font-semibold text-[#37352F]'
                                        : 'font-normal text-[#A8A29E]'
                            )}>
                                {label}
                            </span>

                            {isActive && (
                                <div className="w-3.5 h-3.5 rounded-full bg-[#9CA3AF] shrink-0" />
                            )}
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
}
