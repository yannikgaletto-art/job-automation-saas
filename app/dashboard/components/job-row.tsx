"use client";

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, FileText, Check, Sparkles, Mail, Eye, Info, PenTool, ClipboardCheck } from 'lucide-react';
import { ProgressWorkflow } from './progress-workflow';
import { Button } from '@/components/motion/button';
import { AnimatedMatchScore } from '@/components/motion/count-up';
import { cn } from '@/lib/utils';
import { Step4CoverLetter } from './workflow-steps/step-4-cover-letter';
import { LoadingSpinner } from "@/components/ui/loading-spinner";

export interface Job {
    id: string;
    company: string;
    jobTitle: string;
    location?: string | null;
    summary?: string | null;
    responsibilities?: string[] | null;
    qualifications?: string[] | null;
    benefits?: string[] | null;
    seniority?: string | null;
    matchScore: number;
    workflowStep: number; // 0-4
    status: 'NEW' | 'JOB_REVIEWED' | 'CV_CHECKED' | 'CV_OPTIMIZED' | 'CL_GENERATED' | 'READY';
}

interface JobRowProps {
    job: Job;
    expanded: boolean;
    onToggle: () => void;
    onOptimize?: (jobId: string) => void;
    isOptimizing?: boolean;
}

export function JobRow({ job, expanded, onToggle, onOptimize, isOptimizing }: JobRowProps) {
    // Falls kein Tab aktiv geklickt wurde, nehmen wir null (oder default den aktuellen Workflow Step)
    const [activeTab, setActiveTab] = useState<number | null>(null);

    // Determines which content to show in the expanded area
    const displayTab = activeTab !== null ? activeTab : (job.workflowStep === 4 ? 3 : 0);

    const handleStepClick = (index: number) => {
        setActiveTab(index);
        if (!expanded) {
            onToggle();
        }
    };

    // Status-based next action
    const getNextAction = () => {
        switch (job.status) {
            case 'NEW':
                return { icon: <FileText className="w-4 h-4" />, label: 'View Job', variant: 'outline' as const, action: onToggle };
            case 'JOB_REVIEWED':
                return { icon: <Check className="w-4 h-4" />, label: 'Check CV Match', variant: 'outline' as const, action: onToggle };
            case 'CV_CHECKED':
                return {
                    icon: <Sparkles className="w-4 h-4" />,
                    label: 'Optimize CV',
                    variant: 'primary' as const,
                    action: () => onOptimize?.(job.id)
                };
            case 'CV_OPTIMIZED':
                return { icon: <Mail className="w-4 h-4" />, label: 'Generate Cover Letter', variant: 'outline' as const, action: onToggle };
            case 'CL_GENERATED':
            case 'READY':
                return { icon: <Check className="w-4 h-4" />, label: 'Review & Apply', variant: 'primary' as const, action: onToggle };
            default:
                return { icon: <FileText className="w-4 h-4" />, label: 'View Job', variant: 'outline' as const, action: onToggle };
        }
    };

    const nextAction = getNextAction();

    return (
        <motion.div
            className="border-b border-[#d6d6d6] last:border-b-0"
        >
            {/* Compact View */}
            <div
                className="flex items-center gap-2 px-6 py-4 cursor-pointer hover:bg-[#d4e3fe] transition-colors"
                onClick={(e) => {
                    // Prevent toggle if clicking button or specific elements
                    if ((e.target as HTMLElement).closest('button')) return;
                    if (expanded && activeTab !== null) {
                        setActiveTab(null); // Reset when collapsing
                    }
                    onToggle();
                }}
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
                <div className="flex-1 min-w-[200px]" onClick={(e) => e.stopPropagation()}>
                    <ProgressWorkflow
                        current={job.workflowStep}
                        onStepClick={handleStepClick}
                        activeTab={expanded ? activeTab : null}
                    />
                </div>

                {/* Next Action */}
                <div className="w-48 md:w-56">
                    <Button
                        variant={nextAction.variant}
                        className="w-full text-sm"
                        disabled={isOptimizing}
                        onClick={(e) => {
                            e.stopPropagation();
                            nextAction.action?.();
                        }}
                    >
                        {isOptimizing ? (
                            <LoadingSpinner size="sm" className="mr-2" />
                        ) : (
                            nextAction.icon
                        )}
                        <span className="ml-2">{isOptimizing ? "Optimizing..." : nextAction.label}</span>
                    </Button>
                </div>
            </div>



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
                        {/* ---------------- TABS CONTENT RENDERER ---------------- */}
                        {displayTab === 0 && (
                            <div className="px-6 py-4 space-y-4">
                                {/* Header */}
                                <div className="flex gap-4 flex-wrap">
                                    <span className="text-sm text-gray-500">🏢 {job.company}</span>
                                    {job.location && (
                                        <span className="text-sm text-gray-500">📍 {job.location}</span>
                                    )}
                                    {job.seniority && job.seniority !== 'unknown' && (
                                        <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full capitalize">
                                            {job.seniority}
                                        </span>
                                    )}
                                </div>

                                {/* Summary */}
                                {job.summary && (
                                    <p className="text-sm text-gray-600 leading-relaxed">{job.summary}</p>
                                )}

                                {/* Aufgaben + Qualifikationen nebeneinander (2-col auf Desktop) */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {job.responsibilities && job.responsibilities.length > 0 && (
                                        <div>
                                            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                                                Aufgaben
                                            </h4>
                                            <ul className="space-y-1">
                                                {job.responsibilities.map((r, i) => (
                                                    <li key={i} className="text-sm text-gray-600 flex gap-2">
                                                        <span className="text-gray-300 mt-0.5">›</span>
                                                        <span>{r}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}

                                    {job.qualifications && job.qualifications.length > 0 && (
                                        <div>
                                            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                                                Qualifikationen
                                            </h4>
                                            <ul className="space-y-1">
                                                {job.qualifications.map((q, i) => (
                                                    <li key={i} className="text-sm text-gray-600 flex gap-2">
                                                        <span className="text-green-400 mt-0.5">✓</span>
                                                        <span>{q}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>

                                {/* Benefits (falls vorhanden) */}
                                {job.benefits && job.benefits.length > 0 && (
                                    <div className="flex flex-wrap gap-2 pt-2">
                                        {job.benefits.map((b, i) => (
                                            <span key={i} className="text-xs bg-gray-50 text-gray-500 border border-gray-200 px-2 py-0.5 rounded-full">
                                                {b}
                                            </span>
                                        ))}
                                    </div>
                                )}
                                {(!job.responsibilities || job.responsibilities.length === 0) && (!job.qualifications || job.qualifications.length === 0) && (
                                    <div className="text-center py-6 text-sm text-gray-500 bg-white/50 rounded-lg border border-dashed border-gray-300">
                                        <Info className="w-5 h-5 mx-auto mb-2 text-gray-400" />
                                        Keine tiefgehenden strukturierten Daten für diesen Job vorhanden.<br />
                                        <span className="text-xs text-gray-400">Extraktion erfolgt beim nächsten Resume Match Checker Lauf.</span>
                                    </div>
                                )}
                            </div>
                        )}

                        {displayTab === 1 && (
                            <PlaceholderStep
                                icon={<FileText className="w-8 h-8 text-[#0066FF]" />}
                                title="CV Match Checker"
                                description="Vergleiche deinen Lebenslauf mit den Anforderungen dieses Jobs. Die KI zeigt dir exakt auf, wo Stärken und Lücken liegen."
                                status="Coming in Phase 2"
                            />
                        )}

                        {displayTab === 2 && (
                            <PlaceholderStep
                                icon={<Sparkles className="w-8 h-8 text-[#00C853]" />}
                                title="CV Optimization Engine"
                                description="Lass deinen Lebenslauf maßgeschneidert auf diesen Job anpassen. Schlüsselwörter werden hinzugefügt und Bullet-Points neu priorisiert, ohne zu halluzinieren."
                                status="Coming in Phase 2"
                                action={
                                    <Button variant="primary" onClick={() => onOptimize?.(job.id)} disabled={isOptimizing}>
                                        {isOptimizing ? <><LoadingSpinner size="sm" className="mr-2" /> Optimizing...</> : <><Sparkles className="w-4 h-4 mr-2" /> Run Optimizer</>}
                                    </Button>
                                }
                            />
                        )}

                        {displayTab === 3 && (
                            <Step4CoverLetter
                                jobId={job.id}
                                companyName={job.company}
                                jobTitle={job.jobTitle}
                                onComplete={() => {
                                    console.log('✅ Cover letter flow complete')
                                }}
                            />
                        )}

                        {displayTab === 4 && (
                            <PlaceholderStep
                                icon={<ClipboardCheck className="w-8 h-8 text-[#002e7a]" />}
                                title="Final Review & Apply"
                                description="Dein Cover Letter und CV sind optimiert. Hier prüfst du noch einmal alles in der Übersicht, bevor der Extension-Agent das Formular für dich ausfüllt."
                                status="Coming in Phase 3"
                            />
                        )}

                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

// ----------------------------------------------------------------------
// Placeholder Component for Tabs 1, 2, 4
// ----------------------------------------------------------------------
function PlaceholderStep({ icon, title, description, status, action }: { icon: React.ReactNode, title: string, description: string, status: string, action?: React.ReactNode }) {
    return (
        <div className="px-6 py-12 flex flex-col items-center justify-center text-center bg-white/40">
            <div className="bg-white p-4 rounded-full shadow-sm mb-4 border border-[#d6d6d6]">
                {icon}
            </div>
            <h3 className="text-lg font-semibold text-[#37352F] mb-2">{title}</h3>
            <p className="text-[#73726E] text-sm max-w-md mb-6 leading-relaxed">
                {description}
            </p>
            <div className="flex flex-col items-center gap-4">
                {action}
                <span className="text-xs font-mono bg-[#E7E7E5] text-[#73726E] px-2 py-1 rounded">
                    {status}
                </span>
            </div>
        </div>
    );
}
