"use client";

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, FileText, Check, Sparkles, Mail, Eye, Info, PenTool, ClipboardCheck, Trash2, ChevronDown } from 'lucide-react';
import { ProgressWorkflow } from './progress-workflow';
import { Button } from '@/components/motion/button';
import { AnimatedMatchScore } from '@/components/motion/count-up';
import { cn } from '@/lib/utils';
import { Step4CoverLetter } from './workflow-steps/step-4-cover-letter';
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { CustomDialog } from "@/components/ui/custom-dialog";
import { CVMatchTab } from './cv-match/cv-match-tab';

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
    buzzwords?: string[] | null;
    metadata?: any;
    matchScore: number;
    workflowStep: number; // 0-4
    status: 'NEW' | 'JOB_REVIEWED' | 'CV_CHECKED' | 'CV_OPTIMIZED' | 'CL_GENERATED' | 'READY';
}

interface JobRowProps {
    job: Job;
    expanded: boolean;
    onToggle: () => void;
    onOptimize?: (jobId: string) => void;
    onReanalyze?: (jobId: string) => void;
    onConfirm?: (jobId: string) => void;
    onDelete?: (jobId: string) => void;
    isOptimizing?: boolean;
}

// --- Helpers for Steckbrief UI Refactoring ---
const shouldShowLocation = (location?: string | null): boolean => {
    if (!location) return false;
    const lowerLoc = location.toLowerCase();
    const genericRegions = [
        'europa', 'europe', 'dach', 'deutschland', 'germany', 'remote',
        'home office', 'home-office', 'anywhere', 'weltweit', 'worldwide',
        'schweiz', 'switzerland', 'österreich', 'austria', 'emea'
    ];
    // Basic heuristic: check if it exactly matches or is very generic
    const isGeneric = genericRegions.some(region =>
        lowerLoc === region || lowerLoc === `remote - ${region}` || lowerLoc === `${region} - remote` || lowerLoc === `remote (${region})`
    );
    return !isGeneric;
};

const formatLevel = (level?: string | null): string | null => {
    if (!level || level.toLowerCase() === 'unknown') return null;
    return `Level: ${level.charAt(0).toUpperCase() + level.slice(1).toLowerCase()}`;
};

const categorizeChips = (benefits: string[]): Record<string, string[]> => {
    const categories: Record<string, string[]> = {
        'Arbeitsmodell': [],
        'Kultur': [],
        'Weiterbildung': [],
        'Ausstattung': [],
        'Sonstiges': []
    };

    benefits.forEach(b => {
        const lowerB = b.toLowerCase();
        if (lowerB.includes('remote') || lowerB.includes('hybrid') || lowerB.includes('home office') || lowerB.includes('home-office') || lowerB.includes('mobil') || lowerB.includes('büro') || lowerB.includes('workation') || lowerB.includes('flexibel')) {
            categories['Arbeitsmodell'].push(b);
        } else if (lowerB.includes('team') || lowerB.includes('kollegial') || lowerB.includes('miteinander') || lowerB.includes('mindset') || lowerB.includes('feedback') || lowerB.includes('kultur') || lowerB.includes('event') || lowerB.includes('feier')) {
            categories['Kultur'].push(b);
        } else if (lowerB.includes('academy') || lowerB.includes('weiterbildung') || lowerB.includes('learning') || lowerB.includes('training') || lowerB.includes('entwickl') || lowerB.includes('budget') || lowerB.includes('zertifikat')) {
            categories['Weiterbildung'].push(b);
        } else if (lowerB.includes('equipment') || lowerB.includes('mac') || lowerB.includes('hardware') || lowerB.includes('setup') || lowerB.includes('laptop') || lowerB.includes('iphone')) {
            categories['Ausstattung'].push(b);
        } else {
            categories['Sonstiges'].push(b);
        }
    });

    return categories;
};

/** Inline collapsible list — shows `limit` items, rest behind toggle */
function CollapsibleList({ items, limit = 3, icon }: { items: string[]; limit?: number; icon?: React.ReactNode }) {
    const [expanded, setExpanded] = useState(false);
    const shown = expanded ? items : items.slice(0, limit);
    const rest = items.length - limit;
    return (
        <>
            <ul className="space-y-1">
                {shown.map((item, i) => (
                    <li key={i} className="text-xs text-[#37352F] flex gap-2 items-start leading-snug">
                        <span className="text-[#aeb1b5] mt-px shrink-0">{icon ?? '›'}</span>
                        <span>{item}</span>
                    </li>
                ))}
            </ul>
            {rest > 0 && !expanded && (
                <button
                    onClick={(e) => { e.stopPropagation(); setExpanded(true); }}
                    className="mt-1.5 text-[10px] text-[#002e7a] hover:underline flex items-center gap-0.5"
                >
                    <ChevronDown className="w-3 h-3" /> +{rest} mehr
                </button>
            )}
        </>
    );
}

function SummaryBlock({ summary }: { summary: string }) {
    const [expanded, setExpanded] = useState(false);
    const showToggle = summary.split('\n').length > 2 || summary.length > 200; // Heuristic for long summary

    return (
        <div className="bg-white/60 border border-[#e7e7e5] rounded-md px-3 py-2">
            <p className={cn(
                "text-xs text-[#37352F] leading-relaxed max-w-4xl",
                !expanded && "line-clamp-2"
            )}>
                {summary}
            </p>
            {showToggle && (
                <button
                    onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
                    className="mt-1 text-[10px] text-[#002e7a] hover:underline flex items-center gap-0.5"
                >
                    {expanded ? 'Weniger anzeigen' : 'Mehr anzeigen'}
                    {expanded ? <ChevronDown className="w-3 h-3 rotate-180" /> : <ChevronDown className="w-3 h-3" />}
                </button>
            )}
        </div>
    );
}
// ----------------------------------------------

export function JobRow({ job, expanded, onToggle, onOptimize, onReanalyze, onConfirm, onDelete, isOptimizing }: JobRowProps) {
    // Falls kein Tab aktiv geklickt wurde, nehmen wir null (oder default den aktuellen Workflow Step)
    const [activeTab, setActiveTab] = useState<number | null>(null);
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);

    // NEW: always default to tab 0 (Steckbrief), never auto-jump
    const displayTab = activeTab ?? 0;

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

                {/* Next Action & Delete */}
                <div className="w-56 md:w-64 flex items-center justify-end gap-2 pr-2">
                    <Button
                        variant={nextAction.variant}
                        className="flex-1 text-sm"
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
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setShowDeleteDialog(true);
                        }}
                        className="p-2 text-[#73726E] hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                        title="Delete Job"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
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
                        {/* Visible tab bar — place at top of expanded section */}
                        <div className="flex items-center gap-1 px-6 pt-4 pb-0 border-b border-[#d6d6d6]">
                            {[
                                { index: 0, label: 'Steckbrief', icon: <FileText className="w-3.5 h-3.5" /> },
                                { index: 1, label: 'CV Match', icon: <Check className="w-3.5 h-3.5" /> },
                                { index: 2, label: 'CV Opt.', icon: <Sparkles className="w-3.5 h-3.5" /> },
                                { index: 3, label: 'Cover Letter', icon: <Mail className="w-3.5 h-3.5" /> },
                                { index: 4, label: 'Review', icon: <Eye className="w-3.5 h-3.5" /> },
                            ].map((tab) => (
                                <button
                                    key={tab.index}
                                    onClick={() => setActiveTab(tab.index)}
                                    className={cn(
                                        "flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-md transition-colors",
                                        displayTab === tab.index
                                            ? "bg-white text-[#002e7a] border-t border-x border-[#d6d6d6] -mb-px"
                                            : "text-[#73726E] hover:text-[#37352F] hover:bg-white/50"
                                    )}
                                >
                                    {tab.icon}
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        {displayTab === 0 && (
                            <div className="px-5 py-3 space-y-3">
                                {/* Header Block — single compact line */}
                                <div className="flex items-center gap-2 flex-wrap text-xs text-[#73726E]">
                                    {shouldShowLocation(job.location) && (
                                        <span className="flex items-center gap-1">
                                            <span>📍</span> {job.location}
                                        </span>
                                    )}
                                    {formatLevel(job.seniority) && (
                                        <span className="bg-[#f1f1ef] text-[#37352F] px-1.5 py-0.5 rounded border border-[#e7e7e5] font-medium">
                                            {formatLevel(job.seniority)}
                                        </span>
                                    )}
                                </div>

                                {/* Summary (2-line truncated, toggle for full) */}
                                {job.summary && (
                                    <SummaryBlock summary={job.summary} />
                                )}

                                {/* Content Grid (2 columns on md) */}
                                {(job.responsibilities?.length || job.qualifications?.length) ? (
                                    <div className="grid grid-cols-2 gap-4">
                                        {job.responsibilities && job.responsibilities.length > 0 && (
                                            <div>
                                                <h4 className="text-[10px] font-semibold text-[#73726E] uppercase tracking-wider mb-1.5">Aufgaben</h4>
                                                <CollapsibleList items={job.responsibilities} limit={3} />
                                            </div>
                                        )}
                                        {job.qualifications && job.qualifications.length > 0 && (
                                            <div>
                                                <h4 className="text-[10px] font-semibold text-[#73726E] uppercase tracking-wider mb-1.5">Qualifikationen</h4>
                                                <CollapsibleList items={job.qualifications} limit={3} icon="✓" />
                                            </div>
                                        )}
                                    </div>
                                ) : null}

                                {/* Benefits — compact single row of chips grouped inline */}
                                {job.benefits && job.benefits.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5">
                                        {job.benefits.map((b, i) => (
                                            <span key={i} className="text-[10px] bg-[#f1f1ef] text-[#37352F] border border-[#e7e7e5] px-2 py-0.5 rounded">{b}</span>
                                        ))}
                                    </div>
                                )}

                                {/* Buzzwords inline */}
                                {job.buzzwords && job.buzzwords.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5">
                                        <span className="text-[10px] font-semibold text-[#73726E] uppercase tracking-wider self-center mr-1">ATS:</span>
                                        {job.buzzwords.map((bw, i) => (
                                            <span key={i} className="text-[10px] font-medium bg-[#f0f4ff] text-[#002e7a] px-2 py-0.5 rounded border border-[#d6e0ff]">{bw}</span>
                                        ))}
                                    </div>
                                )}

                                {/* Confirm or Analyse */}
                                {job.responsibilities && job.responsibilities.length > 0 && (
                                    <div className="flex justify-end">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onConfirm?.(job.id); }}
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#002e7a] text-white text-xs font-medium rounded-md hover:bg-[#002e7a]/90 transition-colors"
                                        >
                                            <Check className="w-3.5 h-3.5" />
                                            Steckbrief bestätigen →
                                        </button>
                                    </div>
                                )}
                                {(!job.responsibilities || job.responsibilities.length === 0) &&
                                    (!job.qualifications || job.qualifications.length === 0) && (
                                        <div className="text-center py-6 space-y-3 bg-white/50 rounded-lg border border-dashed border-[#d6d6d6]">
                                            <Info className="w-5 h-5 mx-auto text-[#73726E]" />
                                            <p className="text-sm text-[#73726E]">Keine strukturierten Daten vorhanden.</p>
                                            {job.summary && <p className="text-sm text-[#37352F] max-w-lg mx-auto">{job.summary}</p>}
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onReanalyze?.(job.id); }}
                                                className="text-xs text-[#002e7a] underline hover:no-underline"
                                            >
                                                Jetzt analysieren
                                            </button>
                                        </div>
                                    )}
                            </div>
                        )}

                        {displayTab === 1 && (
                            <CVMatchTab
                                jobId={job.id}
                                cachedMatch={job.metadata?.cv_match}
                                onMatchStart={() => console.log('CV Match started')}
                                onMatchComplete={() => {
                                    // Optionally trigger a refresh of the job state or just let the component handle its own display
                                }}
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

            <CustomDialog
                isOpen={showDeleteDialog}
                onClose={() => setShowDeleteDialog(false)}
                title="Bewerbung löschen"
            >
                <div className="p-6">
                    <p className="text-[#73726E] mb-6">
                        Bist du sicher, dass du die Bewerbung bei <strong>{job.company}</strong> für die Position <strong>{job.jobTitle}</strong> endgültig löschen möchtest?
                    </p>
                    <div className="flex justify-end gap-3 mt-6">
                        <Button variant="outline" onClick={(e) => { e.stopPropagation(); setShowDeleteDialog(false); }}>
                            Abbrechen
                        </Button>
                        <Button
                            variant="primary"
                            className="bg-red-600 hover:bg-red-700 text-white border-transparent shadow-sm"
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowDeleteDialog(false);
                                onDelete?.(job.id);
                            }}
                        >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Löschen
                        </Button>
                    </div>
                </div>
            </CustomDialog>
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
