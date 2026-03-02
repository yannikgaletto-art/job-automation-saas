"use client";

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, FileText, Check, Sparkles, Mail, Info, Trash2, ChevronDown, GraduationCap } from 'lucide-react';
import { ProgressWorkflow } from './progress-workflow';
import { Button } from '@/components/motion/button';

import { cn } from '@/lib/utils';
import { Step4CoverLetter } from './workflow-steps/step-4-cover-letter';
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { CustomDialog } from "@/components/ui/custom-dialog";
import { CVMatchTab } from './cv-match/cv-match-tab';
import { OptimizerWizard } from '@/components/cv-optimizer/OptimizerWizard';
import { CertificateKanbanBoard } from '@/components/certificates/certificate-kanban-board';

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
    dbStatus: string; // Raw DB status (e.g. 'steckbrief_confirmed') — used by getNextAction
    status: 'NEW' | 'JOB_REVIEWED' | 'CV_CHECKED' | 'CV_OPTIMIZED' | 'CL_GENERATED' | 'READY';
    company_research?: any[];
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

// --- Helpers ---

const formatLevel = (level?: string | null): string | null => {
    if (!level || level.toLowerCase() === 'unknown') return null;
    return level.charAt(0).toUpperCase() + level.slice(1).toLowerCase();
};

/**
 * Maps raw DB status to the next user-facing CTA.
 * Receives raw DB strings (e.g. 'steckbrief_confirmed') — NOT the mapped UI status.
 * §9: status strings match SICHERHEITSARCHITEKTUR.md canonical mapping.
 */
function getNextAction(
    dbStatus: string,
    onToggle: () => void,
    setActiveTab: (tab: number) => void,
): {
    label: string;
    targetTab: number;
    icon: React.ReactNode;
    variant: 'outline' | 'primary';
    action: () => void;
} {
    const open = (tab: number) => () => { setActiveTab(tab); onToggle(); };

    switch (dbStatus?.toLowerCase()) {
        case 'pending':
            return { label: 'Steckbrief prüfen', targetTab: 0, icon: <FileText className="w-4 h-4" />, variant: 'outline', action: open(0) };
        case 'processing':
        case 'steckbrief_confirmed':
            return { label: 'CV Match starten', targetTab: 1, icon: <Check className="w-4 h-4" />, variant: 'outline', action: open(1) };
        case 'cv_match_done':
        case 'cv_matched':
            return { label: 'CV optimieren', targetTab: 2, icon: <Sparkles className="w-4 h-4" />, variant: 'primary', action: open(2) };
        case 'cv_optimized':
            return { label: 'Cover Letter generieren', targetTab: 3, icon: <Mail className="w-4 h-4" />, variant: 'outline', action: open(3) };
        case 'cover_letter_done':
        case 'ready_for_review':
        case 'ready_to_apply':
            return { label: 'Weiterbildung ansehen', targetTab: 4, icon: <GraduationCap className="w-4 h-4" />, variant: 'primary', action: open(4) };
        default:
            return { label: 'Öffnen', targetTab: 0, icon: <FileText className="w-4 h-4" />, variant: 'outline', action: open(0) };
    }
}

/**
 * Bold the first noun/verb phrase of a bullet point.
 * Heuristic: bold everything before the first comma, colon, or dash.
 */
function boldFirstPhrase(text: string): React.ReactNode {
    const match = text.match(/^([^,:\-–]+)[,:\-–]\s*(.*)/);
    if (match) {
        return <><strong className="font-semibold text-[#37352F]">{match[1]}</strong>{', '}{match[2]}</>;
    }
    return text;
}

/** Inline collapsible list — shows `limit` items, rest behind toggle */
function CollapsibleList({ items, limit = 3 }: { items: string[]; limit?: number }) {
    const [expanded, setExpanded] = useState(false);
    const shown = expanded ? items : items.slice(0, limit);
    const rest = items.length - limit;
    return (
        <>
            <ul className="space-y-1.5">
                {shown.map((item, i) => (
                    <li key={i} className="text-xs text-[#37352F] flex gap-2 items-start leading-snug">
                        <span className="text-slate-400 mt-px shrink-0 text-[10px]">--</span>
                        <span>{boldFirstPhrase(item)}</span>
                    </li>
                ))}
            </ul>
            {rest > 0 && !expanded && (
                <button
                    onClick={(e) => { e.stopPropagation(); setExpanded(true); }}
                    className="mt-1.5 text-[10px] text-blue-600 hover:underline flex items-center gap-0.5"
                >
                    <ChevronDown className="w-3 h-3" /> +{rest} mehr
                </button>
            )}
        </>
    );
}

function SummaryBlock({ summary }: { summary: string }) {
    const [expanded, setExpanded] = useState(false);
    const showToggle = summary.split('\n').length > 2 || summary.length > 200;

    /** Bold critical nouns/verbs by keyword density heuristic */
    const boldKeywords = (text: string): React.ReactNode => {
        const keywords = [
            'Kaltakquise', 'Pipeline', 'Datenanalyse', 'Vertrieb', 'Akquise',
            'Strategie', 'Umsatz', 'Revenue', 'Wachstum', 'Growth', 'KPIs',
            'Führung', 'Leadership', 'Stakeholder', 'Digitalisierung', 'Transformation',
            'Agile', 'Scrum', 'Planung', 'Budget', 'Verantwortung', 'Team',
            'Projektmanagement', 'Marketing', 'Sales', 'Product', 'Engineering',
            'Consulting', 'Innovation', 'Optimierung', 'Analyse', 'CRM'
        ];
        const regex = new RegExp(`(${keywords.join('|')})`, 'gi');
        const parts = text.split(regex);
        return parts.map((part, idx) =>
            keywords.some(kw => kw.toLowerCase() === part.toLowerCase())
                ? <strong key={idx} className="font-semibold">{part}</strong>
                : part
        );
    };

    return (
        <div className="bg-white/60 border border-slate-200 rounded-md px-3 py-2">
            <p className={cn(
                "text-xs text-[#37352F] leading-relaxed max-w-4xl",
                !expanded && "line-clamp-2"
            )}>
                {boldKeywords(summary)}
            </p>
            {showToggle && (
                <button
                    onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
                    className="mt-1 text-[10px] text-blue-600 hover:underline flex items-center gap-0.5"
                >
                    {expanded ? 'Weniger anzeigen' : 'Mehr anzeigen'}
                    {expanded ? <ChevronDown className="w-3 h-3 rotate-180" /> : <ChevronDown className="w-3 h-3" />}
                </button>
            )}
        </div>
    );
}

/** ATS Keywords — simple pill grid, no circle badge */
function ATSKeywords({ buzzwords }: { buzzwords: string[] }) {
    const LOW_SIGNAL = ['und', 'oder', 'bzw', 'etc', 'diverse', 'sonstige', 'allgemein', 'gut', 'gute'];
    const filtered = buzzwords
        .filter(bw => !LOW_SIGNAL.includes(bw.toLowerCase()))
        .slice(0, 10);

    if (filtered.length === 0) return null;

    return (
        <div className="flex flex-wrap gap-2 mt-2">
            {filtered.map((kw, i) => (
                <span
                    key={i}
                    className="px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200"
                >
                    {kw}
                </span>
            ))}
        </div>
    );
}

/** Benefits compact grid */
function BenefitsGrid({ benefits }: { benefits: string[] }) {
    const [showAll, setShowAll] = useState(false);
    const visible = showAll ? benefits : benefits.slice(0, 4);
    const rest = benefits.length - 4;

    return (
        <div className="grid grid-cols-2 gap-1.5">
            {visible.map((b, i) => (
                <span key={i} className="text-[10px] bg-slate-50 text-slate-600 border border-slate-200 px-2 py-1 rounded truncate">
                    {b}
                </span>
            ))}
            {rest > 0 && !showAll && (
                <button
                    onClick={(e) => { e.stopPropagation(); setShowAll(true); }}
                    className="text-[10px] text-blue-600 hover:underline col-span-2"
                >
                    +{rest} mehr
                </button>
            )}
        </div>
    );
}

// ---------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------

export function JobRow({ job, expanded, onToggle, onOptimize, onReanalyze, onConfirm, onDelete, isOptimizing }: JobRowProps) {
    const [activeTab, setActiveTab] = useState<number | null>(null);
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [liveMatchResult, setLiveMatchResult] = useState<any | null>(null);
    const [optimisticStep, setOptimisticStep] = useState<number | null>(null);

    const displayTab = activeTab ?? 0;

    const handleStepClick = (index: number) => {
        setActiveTab(index);
        if (!expanded) {
            onToggle();
        }
    };

    const nextAction = getNextAction(job.dbStatus, onToggle, setActiveTab);

    return (
        <motion.div className="border-b border-[#d6d6d6] last:border-b-0">
            {/* Compact Row */}
            <div
                className="flex items-center gap-2 px-6 py-4 cursor-pointer hover:bg-[#d4e3fe] transition-colors"
                onClick={(e) => {
                    if ((e.target as HTMLElement).closest('button')) return;
                    if (expanded && activeTab !== null) setActiveTab(null);
                    onToggle();
                }}
            >
                <motion.div animate={{ rotate: expanded ? 90 : 0 }} transition={{ duration: 0.2 }}>
                    <ChevronRight className="w-4 h-4 text-[#002e7a]" />
                </motion.div>

                <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    className={cn(
                        "w-2 h-2 rounded-full",
                        job.status === 'READY' ? "bg-green-500" :
                            job.status === 'CL_GENERATED' ? "bg-green-300" :
                                "bg-slate-300"
                    )}
                />

                <div className="w-28 md:w-32 font-medium text-[#002e7a] truncate" title={job.company}>{job.company}</div>
                <div className="w-40 md:w-48 text-[#002e7a] font-medium truncate" title={job.jobTitle}>{job.jobTitle}</div>

                <div className="flex-1 min-w-[200px]" onClick={(e) => e.stopPropagation()}>
                    <ProgressWorkflow
                        current={optimisticStep ?? job.workflowStep}
                        onStepClick={handleStepClick}
                        activeTab={expanded ? activeTab : null}
                        jobId={job.id}
                    />
                </div>

                <div className="w-56 md:w-64 flex items-center justify-end gap-2 pr-2">
                    <Button
                        variant={nextAction.variant}
                        className="flex-1 text-sm"
                        disabled={isOptimizing}
                        onClick={(e) => { e.stopPropagation(); nextAction.action?.(); }}
                    >
                        {isOptimizing ? <LoadingSpinner size="sm" className="mr-2" /> : nextAction.icon}
                        <span className="ml-2">{isOptimizing ? "Optimizing..." : nextAction.label}</span>
                    </Button>
                    <button
                        onClick={(e) => { e.stopPropagation(); setShowDeleteDialog(true); }}
                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
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
                        className="overflow-hidden bg-white border-t border-slate-200"
                    >
                        {/* Tab bar — no Review tab, no emojis */}
                        <div className="flex items-center gap-1 px-6 pt-4 pb-0 border-b border-[#d6d6d6]">
                            {[
                                { index: 0, label: 'Steckbrief', icon: <FileText className="w-3.5 h-3.5" /> },
                                { index: 1, label: 'CV Match', icon: <Check className="w-3.5 h-3.5" /> },
                                { index: 2, label: 'CV Opt.', icon: <Sparkles className="w-3.5 h-3.5" /> },
                                { index: 3, label: 'Cover Letter', icon: <Mail className="w-3.5 h-3.5" /> },
                                { index: 4, label: 'Weiterbildung', icon: <GraduationCap className="w-3.5 h-3.5" /> },
                            ].map((tab) => (
                                <button
                                    key={tab.index}
                                    onClick={() => setActiveTab(tab.index)}
                                    className={cn(
                                        "flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-md transition-colors",
                                        displayTab === tab.index
                                            ? "bg-white text-[#002e7a] border-t border-x border-[#d6d6d6] -mb-px"
                                            : "text-slate-500 hover:text-[#37352F] hover:bg-white/50"
                                    )}
                                >
                                    {tab.icon}
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        {/* ===== TAB 0: STECKBRIEF (2-column layout) ===== */}
                        {displayTab === 0 && (
                            <div className="px-5 py-3 space-y-3">
                                {/* Seniority chip only — title is already in the row header */}
                                {formatLevel(job.seniority) && (
                                    <span className="inline-block bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200 text-[10px] font-medium">
                                        {formatLevel(job.seniority)}
                                    </span>
                                )}

                                {/* 2-Column Split */}
                                <div className="grid grid-cols-[3fr_2fr] gap-4">
                                    {/* LEFT COLUMN (60%) */}
                                    <div className="space-y-3">
                                        {/* Summary */}
                                        {job.summary && <SummaryBlock summary={job.summary} />}

                                        {/* Aufgaben */}
                                        {job.responsibilities && job.responsibilities.length > 0 && (
                                            <div className="rounded-lg border border-slate-200 p-4">
                                                <h4 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3">Aufgaben</h4>
                                                <CollapsibleList items={job.responsibilities} limit={3} />
                                            </div>
                                        )}

                                        {/* Qualifikationen */}
                                        {job.qualifications && job.qualifications.length > 0 && (
                                            <div className="rounded-lg border border-slate-200 p-4">
                                                <h4 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3">Qualifikationen</h4>
                                                <CollapsibleList items={job.qualifications} limit={3} />
                                            </div>
                                        )}
                                    </div>

                                    {/* RIGHT COLUMN (40%) */}
                                    <div className="space-y-3">
                                        {/* ATS Keywords */}
                                        {job.buzzwords && job.buzzwords.length > 0 && (
                                            <div>
                                                <h4 className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">ATS Keywords</h4>
                                                <ATSKeywords buzzwords={job.buzzwords} />
                                            </div>
                                        )}

                                        {/* Benefits Grid */}
                                        {job.benefits && job.benefits.length > 0 && (
                                            <div>
                                                <h4 className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5">Benefits</h4>
                                                <BenefitsGrid benefits={job.benefits} />
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Confirm / Navigate */}
                                {job.responsibilities && job.responsibilities.length > 0 && (
                                    <div className="flex justify-end gap-3 mt-4 border-t border-slate-200 pt-4">
                                        {job.workflowStep < 1 ? (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onConfirm?.(job.id); }}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#002e7a] text-white text-xs font-medium rounded-md hover:bg-[#002e7a]/90 transition-colors"
                                            >
                                                <Check className="w-3.5 h-3.5" />
                                                Steckbrief bestaetigen
                                            </button>
                                        ) : (
                                            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 text-xs font-medium rounded-md border border-green-100">
                                                <Check className="w-3.5 h-3.5" />
                                                Steckbrief bestaetigt
                                            </div>
                                        )}
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (job.workflowStep >= 1) setActiveTab(1);
                                            }}
                                            disabled={job.workflowStep < 1}
                                            className={cn(
                                                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                                                job.workflowStep >= 1
                                                    ? "bg-[#002e7a] text-white hover:bg-[#002e7a]/90"
                                                    : "bg-slate-100 text-slate-400 cursor-not-allowed"
                                            )}
                                        >
                                            <Sparkles className="w-3.5 h-3.5" />
                                            Zur CV Match Analyse
                                        </button>
                                    </div>
                                )}

                                {(!job.responsibilities || job.responsibilities.length === 0) &&
                                    (!job.qualifications || job.qualifications.length === 0) && (
                                        <div className="text-center py-6 space-y-3 bg-white/50 rounded-lg border border-dashed border-slate-300">
                                            <Info className="w-5 h-5 mx-auto text-slate-400" />
                                            <p className="text-sm text-slate-500">Keine strukturierten Daten vorhanden.</p>
                                            {job.summary && <p className="text-sm text-[#37352F] max-w-lg mx-auto">{job.summary}</p>}
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onReanalyze?.(job.id); }}
                                                className="text-xs text-blue-600 underline hover:no-underline"
                                            >
                                                Jetzt analysieren
                                            </button>
                                        </div>
                                    )}
                            </div>
                        )}

                        {/* ===== TAB 1: CV MATCH ===== */}
                        {displayTab === 1 && (
                            <CVMatchTab
                                jobId={job.id}
                                cachedMatch={liveMatchResult ?? job.metadata?.cv_match}
                                onMatchStart={() => console.log('CV Match started')}
                                onMatchComplete={(result) => {
                                    setLiveMatchResult(result);
                                    setOptimisticStep(prev => Math.max(prev ?? job.workflowStep, 2));
                                }}
                                onNextStep={() => setActiveTab(2)}
                            />
                        )}

                        {/* ===== TAB 2: CV OPTIMIZER ===== */}
                        {displayTab === 2 && (
                            <div className="bg-white border-t border-[#d6d6d6]">
                                <OptimizerWizard
                                    jobId={job.id}
                                    liveMatchResult={liveMatchResult ?? job.metadata?.cv_match ?? null}
                                />
                            </div>
                        )}

                        {/* ===== TAB 3: COVER LETTER ===== */}
                        {displayTab === 3 && (
                            <Step4CoverLetter
                                jobId={job.id}
                                companyName={job.company}
                                jobTitle={job.jobTitle}
                                onComplete={() => {
                                    console.log('Cover letter flow complete');
                                    setOptimisticStep(4);
                                }}
                            />
                        )}

                        {/* ===== TAB 4: WEITERBILDUNG & ZERTIFIZIERUNG ===== */}
                        {displayTab === 4 && (
                            <CertificateKanbanBoard
                                jobId={job.id}
                                jobStatus={(() => {
                                    // Map UI status back to DB status for blocking checks
                                    switch (job.status) {
                                        case 'NEW': return 'pending';
                                        case 'JOB_REVIEWED': return 'steckbrief_confirmed';
                                        case 'CV_CHECKED': return 'cv_match_done';
                                        case 'CV_OPTIMIZED': return 'cv_optimized';
                                        case 'CL_GENERATED': return 'cover_letter_done';
                                        case 'READY': return 'ready_to_apply';
                                        default: return 'pending';
                                    }
                                })()}
                            />
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Delete Confirmation Dialog */}
            <CustomDialog
                isOpen={showDeleteDialog}
                onClose={() => setShowDeleteDialog(false)}
                title="Bewerbung loeschen"
            >
                <div className="p-6">
                    <p className="text-slate-500 mb-6">
                        Bist du sicher, dass du die Bewerbung bei <strong>{job.company}</strong> fuer die Position <strong>{job.jobTitle}</strong> endgueltig loeschen moechtest?
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
                            Loeschen
                        </Button>
                    </div>
                </div>
            </CustomDialog>
        </motion.div>
    );
}
