"use client";

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, FileText, Check, Sparkles, Mail, Video, Info, Trash2, ChevronDown, BriefcaseBusiness, Loader2 } from 'lucide-react';
import { ProgressWorkflow } from './progress-workflow';
import { Button } from '@/components/motion/button';

import { cn } from '@/lib/utils';
import { Step4CoverLetter } from './workflow-steps/step-4-cover-letter';
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { CustomDialog } from "@/components/ui/custom-dialog";
import { CVMatchTab } from './cv-match/cv-match-tab';
import { OptimizerWizard } from '@/components/cv-optimizer/OptimizerWizard';
import { Step5Video } from './workflow-steps/step-5-video';

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
    source_url?: string | null;
    source?: string | null;
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
    onReanalyze?: (jobId: string) => void;
    onConfirm?: (jobId: string) => void;
    onDelete?: (jobId: string) => void;
    onMarkApplied?: (jobId: string) => void;
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
    t: ReturnType<typeof useTranslations>,
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
            return { label: t('cta_review_profile'), targetTab: 0, icon: <FileText className="w-4 h-4" />, variant: 'outline', action: open(0) };
        case 'processing':
        case 'steckbrief_confirmed':
            return { label: t('cta_start_cv_match'), targetTab: 1, icon: <Check className="w-4 h-4" />, variant: 'outline', action: open(1) };
        case 'cv_match_done':
        case 'cv_matched':
            return { label: t('cta_optimize_cv'), targetTab: 2, icon: <Sparkles className="w-4 h-4" />, variant: 'primary', action: open(2) };
        case 'cv_optimized':
            return { label: t('cta_generate_cover_letter'), targetTab: 3, icon: <Mail className="w-4 h-4" />, variant: 'outline', action: open(3) };
        case 'cover_letter_done':
        case 'ready_for_review':
        case 'ready_to_apply':
            return { label: t('cta_finalize_application'), targetTab: 3, icon: <Mail className="w-4 h-4" />, variant: 'primary', action: open(3) };
        default:
            return { label: t('cta_open'), targetTab: 0, icon: <FileText className="w-4 h-4" />, variant: 'outline', action: open(0) };
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
    const t = useTranslations('job_queue');
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
                    <ChevronDown className="w-3 h-3" /> {t('toggle_more_items', { n: rest })}
                </button>
            )}
        </>
    );
}

function SummaryBlock({ summary }: { summary: string }) {
    const t = useTranslations('job_queue');
    const [expanded, setExpanded] = useState(false);
    const showToggle = summary.split('\n').length > 2 || summary.length > 200;

    /** Bold critical nouns/verbs by keyword density heuristic */
    const boldKeywords = (text: string): React.ReactNode => {
        const keywords = [
            // DE
            'Kaltakquise', 'Pipeline', 'Datenanalyse', 'Vertrieb', 'Akquise',
            'Strategie', 'Umsatz', 'Wachstum', 'KPIs',
            'Führung', 'Stakeholder', 'Digitalisierung', 'Transformation',
            'Agile', 'Scrum', 'Planung', 'Budget', 'Verantwortung', 'Team',
            'Projektmanagement', 'Optimierung', 'Analyse',
            // EN
            'Strategy', 'Revenue', 'Growth', 'Leadership', 'Management',
            'Marketing', 'Sales', 'Product', 'Engineering', 'Innovation',
            'Consulting', 'CRM', 'Digital', 'Analytics', 'Governance',
            'Operations', 'Development', 'Architecture', 'Compliance',
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
                    {expanded ? t('toggle_show_less') : t('toggle_show_more')}
                    {expanded ? <ChevronDown className="w-3 h-3 rotate-180" /> : <ChevronDown className="w-3 h-3" />}
                </button>
            )}
        </div>
    );
}

/** ATS Keywords — simple pill grid, no circle badge */
function ATSKeywords({ buzzwords }: { buzzwords: string[] }) {
    const LOW_SIGNAL = [
        // DE
        'und', 'oder', 'bzw', 'etc', 'diverse', 'sonstige', 'allgemein', 'gut', 'gute',
        // EN
        'and', 'or', 'various', 'general', 'good', 'other', 'misc', 'etc.',
        // ES
        'y', 'o', 'varios', 'general', 'bueno', 'otros',
    ];
    const filtered = buzzwords
        .filter(bw => !LOW_SIGNAL.includes(bw.toLowerCase()));

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

/** Benefits compact grid — all items, font matches ATS Keywords pills */
function BenefitsGrid({ benefits }: { benefits: string[] }) {
    return (
        <div className="flex flex-wrap gap-2 mt-2">
            {benefits.map((b, i) => (
                <span key={i} className="px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                    {b}
                </span>
            ))}
        </div>
    );
}

// ---------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------

export function JobRow({ job, expanded, onToggle, onReanalyze, onConfirm, onDelete, onMarkApplied }: JobRowProps) {
    const t = useTranslations('job_queue');
    const tCvMatch = useTranslations('cv_match');
    const [activeTab, setActiveTab] = useState<number | null>(null);
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [liveMatchResult, setLiveMatchResult] = useState<any | null>(null);
    const [optimisticStep, setOptimisticStep] = useState<number | null>(null);
    const [videoUnlocked, setVideoUnlocked] = useState(false);
    const [isPendingApply, setIsPendingApply] = useState(false);

    // Gate-Check: Video Letter Tab only unlocked when QR-Token exists
    // Re-runs on tab change so that generating a QR in CV Opt. immediately unlocks the tab
    // without requiring a page refresh. Short-circuits on first unlock (no redundant fetches).
    useEffect(() => {
        if (!expanded) return;
        if (videoUnlocked) return; // Already unlocked — no re-fetch needed
        const checkVideoStatus = async () => {
            try {
                const res = await fetch(`/api/video/status?jobId=${job.id}`);
                if (!res.ok) return;
                const data = await res.json();
                // Unlocked if a video_approaches row exists for this job (any status)
                // OR the user has already started scripting (video_scripts row exists)
                const isUnlocked = data.status !== null && data.status !== undefined;
                const hasStarted = data.hasScript === true;
                if (isUnlocked || hasStarted) {
                    setVideoUnlocked(true);
                }
            } catch { /* silent fail — tab stays locked */ }
        };
        checkVideoStatus();
    }, [expanded, job.id, activeTab, videoUnlocked]); // activeTab: re-check after QR generated in CV Opt.


    const displayTab = activeTab ?? 0;

    const handleStepClick = (index: number) => {
        setActiveTab(index);
        if (!expanded) {
            onToggle();
        }
    };

    const nextAction = getNextAction(job.dbStatus, onToggle, setActiveTab, t);

    return (
        <motion.div className="border-b border-[#d6d6d6] last:border-b-0" data-tour="job-row-container">
            {/* Compact Row */}
            <div
                data-tour="job-compact-row"
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

                <div className="w-28 md:w-32 text-sm font-medium text-[#37352F] truncate" title={job.company}>{job.company}</div>
                <div className="w-40 md:w-48 text-sm text-[#37352F] truncate" title={job.jobTitle}>{job.jobTitle}</div>

                <div className="flex-1 mx-4" onClick={(e) => e.stopPropagation()}>
                    <ProgressWorkflow
                        current={optimisticStep ?? job.workflowStep}
                        onStepClick={handleStepClick}
                        activeTab={expanded ? activeTab : null}
                        jobId={job.id}
                    />
                </div>

                <div className="flex-1" />

                {onMarkApplied && (
                    <button
                        onClick={async (e) => {
                            e.stopPropagation();
                            if (isPendingApply) return;
                            setIsPendingApply(true);
                            try {
                                await onMarkApplied(job.id);
                            } finally {
                                setIsPendingApply(false);
                            }
                        }}
                        disabled={isPendingApply}
                        aria-label={t('btn_mark_applied_row')}
                        title={t('btn_mark_applied_row')}
                        className="p-2 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-md transition-colors shrink-0 disabled:opacity-50 disabled:cursor-wait"
                    >
                        {isPendingApply
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <BriefcaseBusiness className="w-4 h-4" />
                        }
                    </button>
                )}

                <button
                    onClick={(e) => { e.stopPropagation(); setShowDeleteDialog(true); }}
                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors shrink-0 mr-2"
                    title="Delete Job"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
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
                                { index: 0, label: t('tab_profile'), icon: <FileText className="w-3.5 h-3.5" />, tourId: 'tab-steckbrief' },
                                { index: 1, label: t('tab_cv_match'), icon: <Check className="w-3.5 h-3.5" />, tourId: 'tab-cv-match' },
                                { index: 2, label: t('tab_cv_opt'), icon: <Sparkles className="w-3.5 h-3.5" />, tourId: 'tab-cv-opt' },
                                { index: 3, label: t('tab_cover_letter'), icon: <Mail className="w-3.5 h-3.5" />, tourId: 'tab-cover-letter' },
                                { index: 4, label: t('tab_video_letter'), icon: <Video className="w-3.5 h-3.5" />, locked: !videoUnlocked, tourId: 'tab-video-letter' },

                            ].map((tab) => {
                                const isLocked = 'locked' in tab && tab.locked;
                                return (
                                <button
                                    key={tab.index}
                                    onClick={() => !isLocked && setActiveTab(tab.index)}
                                    disabled={isLocked}
                                    title={isLocked ? t('tab_video_locked') : undefined}
                                    data-tour={'tourId' in tab ? tab.tourId : undefined}
                                    className={cn(
                                        "flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-md transition-colors",
                                        isLocked
                                            ? "text-slate-300 cursor-not-allowed"
                                            : displayTab === tab.index
                                                ? "bg-white text-[#002e7a] border-t border-x border-[#d6d6d6] -mb-px"
                                                : "text-slate-500 hover:text-[#37352F] hover:bg-white/50"
                                    )}
                                >
                                    {tab.icon}
                                    {tab.label}
                                    {isLocked && (
                                        <svg className="w-3 h-3 ml-0.5 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                                    )}
                                </button>
                                );
                            })}
                        </div>

                        {/* ===== TAB 0: STECKBRIEF (2-column layout) ===== */}
                        {displayTab === 0 && (
                            <div data-tour="content-steckbrief" className="px-5 py-3 space-y-3">
                                {/* Seniority + Source URL — inline with spacing */}
                                <div className="flex items-center gap-3">
                                    {formatLevel(job.seniority) && (
                                        <span className="inline-block bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200 text-[10px] font-medium">
                                            {formatLevel(job.seniority)}
                                        </span>
                                    )}

                                    {/* CV Match Fit Label — shows when analysis exists */}
                                    {(() => {
                                        const cvScore = (job.metadata as any)?.cv_match?.overallScore;
                                        if (typeof cvScore !== 'number') return null;
                                        const fitKey = cvScore >= 70 ? 'fit_strong' : cvScore >= 50 ? 'fit_partial' : 'fit_weak';
                                        const fitColor = cvScore >= 70
                                            ? 'bg-green-50 text-green-700 border-green-200'
                                            : cvScore >= 50
                                                ? 'bg-yellow-50 text-yellow-700 border-yellow-200'
                                                : 'bg-red-50 text-red-700 border-red-200';
                                        return (
                                            <span className={`inline-block px-1.5 py-0.5 rounded border text-[10px] font-medium ${fitColor}`}>
                                                {tCvMatch(fitKey)}
                                            </span>
                                        );
                                    })()}

                                    {/* Link to job posting (scraped) or company website (manual) */}
                                    {(() => {
                                        const isManual = job.source === 'manual_entry';
                                        const href = isManual
                                            ? (job.metadata?.company_url || job.source_url || null)
                                            : job.source_url;
                                        if (!href) return null;
                                        return (
                                            <a
                                                href={href}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                onClick={(e) => e.stopPropagation()}
                                                className="inline-flex items-center gap-1.5 text-xs text-[#002e7a] hover:text-[#003d99] hover:underline transition-colors"
                                            >
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                                </svg>
                                                {isManual ? t('link_company_website') : t('link_job_posting')}
                                            </a>
                                        );
                                    })()}
                                </div>

                                {/* Summary — full width above the grid */}
                                {job.summary && <SummaryBlock summary={job.summary} />}

                                {/* Row-aligned 2-column grid: left sections ↔ right sections */}
                                <div className="grid grid-cols-[3fr_2fr] gap-4">
                                    {/* Row 1: Aufgaben (left) + ATS Keywords (right) — same start height */}
                                    {job.responsibilities && job.responsibilities.length > 0 && (
                                        <div className="rounded-lg border border-slate-200 p-4">
                                            <h4 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3">{t('section_responsibilities')}</h4>
                                            <CollapsibleList items={job.responsibilities} limit={3} />
                                        </div>
                                    )}
                                    {job.buzzwords && job.buzzwords.length > 0 && (
                                        <div className="rounded-lg border border-slate-200 p-4">
                                            <h4 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3">ATS Keywords</h4>
                                            <ATSKeywords buzzwords={job.buzzwords} />
                                        </div>
                                    )}

                                    {/* Row 2: Qualifikationen (left) + Benefits (right) — same start height */}
                                    {job.qualifications && job.qualifications.length > 0 && (
                                        <div className="rounded-lg border border-slate-200 p-4">
                                            <h4 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3">{t('section_qualifications')}</h4>
                                            <CollapsibleList items={job.qualifications} limit={3} />
                                        </div>
                                    )}
                                    {job.benefits && job.benefits.length > 0 && (
                                        <div className="rounded-lg border border-slate-200 p-4">
                                            <h4 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3">{t('section_benefits')}</h4>
                                            <BenefitsGrid benefits={job.benefits} />
                                        </div>
                                    )}
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
                                                {t('btn_confirm_profile')}
                                            </button>
                                        ) : (
                                            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 text-xs font-medium rounded-md border border-green-100">
                                                <Check className="w-3.5 h-3.5" />
                                                {t('badge_profile_confirmed')}
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
                                            {t('btn_go_cv_match')}
                                        </button>
                                    </div>
                                )}

                                {(!job.responsibilities || job.responsibilities.length === 0) &&
                                    (!job.qualifications || job.qualifications.length === 0) && (
                                        <div className="text-center py-6 space-y-3 bg-white/50 rounded-lg border border-dashed border-slate-300">
                                            <Info className="w-5 h-5 mx-auto text-slate-400" />
                                            <p className="text-sm text-slate-500">{t('empty_no_data')}</p>
                                            {job.summary && <p className="text-sm text-[#37352F] max-w-lg mx-auto">{job.summary}</p>}
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onReanalyze?.(job.id); }}
                                                className="px-4 py-2 bg-[#002e7a] text-white text-xs font-medium rounded-lg hover:bg-[#003d99] transition-colors shadow-sm"
                                            >
                                                {t('btn_analyze_now')}
                                            </button>
                                        </div>
                                    )}
                            </div>
                        )}

                        {/* ===== TAB 1: CV MATCH ===== */}
                        {displayTab === 1 && (
                            <div data-tour="content-cv-match">
                            <CVMatchTab
                                jobId={job.id}
                                cachedMatch={liveMatchResult ?? job.metadata?.cv_match}
                                onMatchStart={() => console.log('CV Match started')}
                                onMatchComplete={(result) => {
                                    setLiveMatchResult(result);
                                    setOptimisticStep(prev => Math.max(prev ?? job.workflowStep, 60));
                                }}
                                onNextStep={() => setActiveTab(2)}
                            />
                            </div>
                        )}

                        {/* ===== TAB 2: CV OPTIMIZER ===== */}
                        {displayTab === 2 && (
                            <div data-tour="content-cv-opt" className="bg-white border-t border-[#d6d6d6]">
                                <OptimizerWizard
                                    jobId={job.id}
                                    liveMatchResult={liveMatchResult ?? job.metadata?.cv_match ?? null}
                                    onGoToCoverLetter={() => setActiveTab(3)}
                                    onComplete={() => {
                                        setOptimisticStep(prev => Math.max(prev ?? job.workflowStep, 80));
                                    }}
                                />
                            </div>
                        )}

                        {/* ===== TAB 3: COVER LETTER ===== */}
                        {displayTab === 3 && (
                            <div data-tour="content-cover-letter">
                            <Step4CoverLetter
                                jobId={job.id}
                                companyName={job.company}
                                jobTitle={job.jobTitle}
                                onComplete={() => {
                                    setOptimisticStep(prev => Math.max(prev ?? job.workflowStep, 100));
                                }}
                                onJobApplied={() => onMarkApplied?.(job.id)}
                            />
                            </div>
                        )}

                        {/* ===== TAB 4: VIDEO ===== */}
                        {displayTab === 4 && (
                            <div data-tour="content-video-letter" className="p-6">
                                <Step5Video
                                    jobId={job.id}
                                    onScriptFound={() => {
                                        setOptimisticStep(prev => Math.max(prev ?? job.workflowStep, 110));
                                    }}
                                />
                            </div>
                        )}


                    </motion.div>
                )}
            </AnimatePresence>

            {/* Delete Confirmation Dialog */}
            <CustomDialog
                isOpen={showDeleteDialog}
                onClose={() => setShowDeleteDialog(false)}
                title={t('delete_title')}
            >
                <div className="p-6">
                    <p className="text-slate-500 mb-6 text-center">
                        {t.rich('delete_confirm', {
                            company: job.company,
                            jobTitle: job.jobTitle,
                            b: (chunks) => <strong>{chunks}</strong>,
                        })}
                    </p>
                    <div className="flex justify-end gap-3 mt-6">
                        <Button variant="outline" onClick={(e) => { e.stopPropagation(); setShowDeleteDialog(false); }}>
                            {t('btn_cancel')}
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
                            {t('btn_delete')}
                        </Button>
                    </div>
                </div>
            </CustomDialog>
        </motion.div>
    );
}
