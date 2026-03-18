"use client";

/**
 * CVMatchTab — Iteration Redesign.
 * - Match Score: Progress bar instead of circle, with top 3 bullets strictly under it.
 * - Score Breakdown: Expandable disclosure instead of truncation.
 * - Anforderungs-Check: 2fr_3fr_4fr columns with clear headers and full badge status.
 *
 * i18n: All UI strings use useTranslations('cv_match').
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { motion, AnimatePresence } from 'framer-motion';
import { CVMatchResult } from '@/lib/services/cv-match-analyzer';
import { Button } from '@/components/motion/button';
import {
    Loader2, CheckCircle2, AlertCircle, Sparkles, Zap, ChevronDown
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { CVSelectDialog, type CVOption } from '@/components/dashboard/cv-select-dialog';
import { DocumentsRequiredDialog } from '@/components/shared/documents-required-dialog';
import { useNotification } from '@/hooks/use-notification';

interface CVMatchTabProps {
    jobId: string;
    cachedMatch?: any;
    onMatchStart?: () => void;
    onMatchComplete?: (result: any) => void;
    onNextStep?: () => void;
}

// --- Status Badge ---
function StatusBadge({ status, t }: { status: 'met' | 'partial' | 'missing'; t: ReturnType<typeof useTranslations> }) {
    const config = {
        met: { icon: CheckCircle2, bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-100', label: t('status_met') },
        partial: { icon: Zap, bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-100', label: t('status_partial') },
        missing: { icon: AlertCircle, bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-100', label: t('status_missing') },
    }[status];
    const Icon = config.icon;
    return (
        <span className={cn("inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[10px] font-medium border", config.bg, config.text, config.border)}>
            <Icon size={12} />
            {config.label}
        </span>
    );
}

// --- Expandable bullet list for reasons ---
function ReasonsList({ reasons, t }: { reasons: string[]; t: ReturnType<typeof useTranslations> }) {
    const [expanded, setExpanded] = useState(false);
    if (reasons.length === 0) return null;

    /** Bold the KEY TERM at start of each bullet */
    const boldStart = (text: string): React.ReactNode => {
        const match = text.match(/^([^:,\-–]+)[:\-–,]\s*(.*)/);
        if (match) return <><strong className="font-semibold text-[#37352F]">{match[1]}:</strong> {match[2]}</>;
        return text;
    };

    return (
        <div className="pl-[140px] pr-8 mt-0.5">
            <ul className="space-y-0.5">
                <li className="text-xs text-slate-500 list-disc ml-4 leading-snug">{boldStart(reasons[0])}</li>
            </ul>

            <AnimatePresence>
                {expanded && reasons.length > 1 && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: 'easeOut' }}
                        className="overflow-hidden"
                    >
                        <ul className="space-y-0.5 mt-0.5">
                            {reasons.slice(1).map((r, idx) => (
                                <li key={idx} className="text-xs text-slate-500 list-disc ml-4 leading-snug">{boldStart(r)}</li>
                            ))}
                        </ul>
                    </motion.div>
                )}
            </AnimatePresence>

            {reasons.length > 1 && (
                <button
                    onClick={() => setExpanded(!expanded)}
                    className="mt-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1 transition-colors"
                >
                    <ChevronDown
                        size={12}
                        className={cn("transition-transform duration-200", expanded && "rotate-180")}
                    />
                    {expanded ? t('show_less') : t('show_more')}
                </button>
            )}
        </div>
    );
}

/** Insights list for Match Score card — all items + toggle, text-xs to match Score Breakdown */
function InsightsList({ items, t }: { items: string[]; t: ReturnType<typeof useTranslations> }) {
    const [expanded, setExpanded] = useState(false);
    if (items.length === 0) return <p className="text-xs text-slate-400 italic">–</p>;
    const shown = expanded ? items : items.slice(0, 1);
    return (
        <div>
            <ul className="list-disc list-inside space-y-0.5">
                {shown.map((item, i) => (
                    <li key={i} className="text-xs text-slate-700 leading-snug">{item}</li>
                ))}
            </ul>
            {items.length > 1 && (
                <button
                    onClick={() => setExpanded(!expanded)}
                    className="mt-1 text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1 transition-colors"
                >
                    <ChevronDown size={12} className={cn("transition-transform duration-200", expanded && "rotate-180")} />
                    {expanded ? t('show_less') : t('show_more_count', { n: items.length - 1 })}
                </button>
            )}
        </div>
    );
}

/** Expandable table cell for Anforderungs-Check rows */
function ExpandableCell({ text, boldFn, t }: { text: string; boldFn: (s: string) => React.ReactNode; t: ReturnType<typeof useTranslations> }) {
    const [expanded, setExpanded] = useState(false);
    const SHORT_LIMIT = 80;
    const isLong = text.length > SHORT_LIMIT;
    return (
        <div>
            {expanded ? (
                <p className="text-xs text-slate-600 leading-snug">{text}</p>
            ) : (
                <p className="text-xs text-slate-600 leading-snug">{boldFn(text)}</p>
            )}
            {isLong && (
                <button
                    onClick={() => setExpanded(!expanded)}
                    className="mt-1 text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1 transition-colors"
                >
                    <ChevronDown size={12} className={cn("transition-transform duration-200", expanded && "rotate-180")} />
                    {expanded ? t('show_less') : t('show_more')}
                </button>
            )}
        </div>
    );
}

// --- Cancel Button (appears after delay so user is never stuck) ---
function CancelButton({ onCancel, t }: { onCancel: () => void; t: ReturnType<typeof useTranslations> }) {
    const [visible, setVisible] = useState(false);
    useEffect(() => {
        const timer = setTimeout(() => setVisible(true), 15000);
        return () => clearTimeout(timer);
    }, []);

    if (!visible) return null;

    return (
        <motion.button
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            onClick={onCancel}
            className="text-xs text-slate-400 hover:text-red-500 transition-colors mt-1"
        >
            {t('btn_cancel')}
        </motion.button>
    );
}

export function CVMatchTab({ jobId, cachedMatch, onMatchStart, onMatchComplete, onNextStep }: CVMatchTabProps) {
    const t = useTranslations('cv_match');
    const locale = useLocale();
    const [state, setState] = useState<'idle' | 'loading' | 'complete' | 'error' | 'no-cv'>('idle');
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const router = useRouter();
    const notify = useNotification();
    const [matchData, setMatchData] = useState<CVMatchResult | null>(null);
    const [loadingStep, setLoadingStep] = useState(0);

    // Steps shown during loading — computed from translations
    const CV_STEPS = useMemo(() => [
        t('step_1'),
        t('step_2'),
        t('step_3'),
        t('step_4'),
        t('step_5'),
    ], [t]);


    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`/api/cv/match/cached?jobId=${jobId}`);
                const data = await res.json();
                if (cancelled) return;
                if (data.success && data.cached && data.cached.analyzed_at) {
                    setMatchData(data.cached as CVMatchResult);
                    setState('complete');
                } else if (data.cvMatchStatus === 'processing' && data.cvMatchStartedAt) {
                    const elapsed = Date.now() - new Date(data.cvMatchStartedAt).getTime();
                    if (elapsed > 4 * 60 * 1000) {
                        // §BUG-FIX #2: Threshold aligned with API (4min). Previously 5min caused
                        // a dead-zone where API blocked restarts but frontend kept polling.
                        // Definitively stale — set idle so user can restart cleanly.
                        console.warn(`⚠️ [CV Match] Stale processing on mount (${Math.round(elapsed / 1000)}s) — auto-retriggering silently`);
                        // runAnalysis is not available here yet (defined below), so set idle and let
                        // the user click — but clear the stale flag so they don't see an error.
                        setState('idle');
                    } else {
                        // Still within threshold — resume polling (Inngest may still be running)
                        console.log(`🔄 [CV Match] Resuming poll for in-flight job (${Math.round(elapsed / 1000)}s elapsed)`);
                        setState('loading');
                        setLoadingStep(2);

                        // Start polling immediately — same logic as after runAnalysis() fires
                        let resumeAttempts = 0;
                        const maxResumeAttempts = 120; // up to ~6 minutes of polling
                        pollingRef.current = setInterval(async () => {
                            resumeAttempts++;
                            try {
                                const pollRes = await fetch(`/api/cv/match/cached?jobId=${jobId}`);
                                const pollData = await pollRes.json();
                                if (pollData.success && pollData.cached?.analyzed_at) {
                                    if (pollingRef.current) clearInterval(pollingRef.current);
                                    pollingRef.current = null;
                                    setLoadingStep(3);
                                    setMatchData(pollData.cached as CVMatchResult);
                                    setState('complete');
                                } else if (resumeAttempts >= maxResumeAttempts) {
                                    if (pollingRef.current) clearInterval(pollingRef.current);
                                    pollingRef.current = null;
                                    setState('error');
                                }
                            } catch {
                                if (pollingRef.current) clearInterval(pollingRef.current);
                                pollingRef.current = null;
                                setState('error');
                            }
                        }, 3000);
                    }
                } else {
                    setState('idle');
                }
            } catch {
                if (!cancelled) setState('idle');
            }
        })();
        return () => {
            cancelled = true;
            if (pollingRef.current) clearInterval(pollingRef.current);
        };
    }, [jobId]);

    const [showCVSelect, setShowCVSelect] = useState(false);
    const [cvOptions, setCvOptions] = useState<CVOption[]>([]);
    const [selectedCvId, setSelectedCvId] = useState<string | undefined>(undefined);
    const [showCvDialog, setShowCvDialog] = useState(false);

    const pollingRef = useRef<NodeJS.Timeout | null>(null);

    // Cleanup polling on unmount
    useEffect(() => {
        return () => {
            if (pollingRef.current) clearInterval(pollingRef.current);
        };
    }, []);

    const runAnalysis = useCallback(async (cvDocumentId?: string, forceRestart?: boolean) => {
        setState('loading');
        setErrorMessage(null);
        setLoadingStep(1);
        setShowCVSelect(false);
        onMatchStart?.();

        try {
            await new Promise(r => setTimeout(r, 800));
            setLoadingStep(2);

            // POST triggers the Inngest pipeline — returns immediately
            const res = await fetch('/api/cv/match', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jobId, cvDocumentId, forceRestart: forceRestart || false })
            });

            let data;
            const resText = await res.text();
            try {
                data = JSON.parse(resText);
            } catch (err) {
                console.error("❌ CV Match API returned non-JSON response:", resText.substring(0, 500));
                throw new Error(t('error_parse'));
            }

            if (!res.ok || !data?.success) {
                if (data?.code === 'CV_NOT_FOUND') {
                    setState('no-cv');
                    return;
                }
                throw new Error(data?.error || t('error_analysis'));
            }

            // Poll for results (Inngest processes in background)
            let attempts = 0;
            const maxAttempts = 50; // 50 × 3s = 150s max — CV Match takes 60-80s

            pollingRef.current = setInterval(async () => {
                attempts++;
                try {
                    const pollRes = await fetch(`/api/cv/match/cached?jobId=${jobId}`);
                    const pollText = await pollRes.text();
                    let pollData;
                    try {
                        pollData = JSON.parse(pollText);
                    } catch (e) {
                        console.error("❌ Polling API non-JSON response:", pollText.substring(0, 200));
                        throw new Error(t('error_poll'));
                    }

                    if (pollData.success && pollData.cached?.analyzed_at) {
                        // Result arrived!
                        if (pollingRef.current) clearInterval(pollingRef.current);
                        pollingRef.current = null;
                        setLoadingStep(3);
                        setMatchData(pollData.cached);
                        setState('complete');
                        notify(t('notify_match_done'));
                        onMatchComplete?.(pollData.cached);
                    } else if (pollData.cvMatchStatus === 'error') {
                        // Pipeline permanently failed (onFailure wrote error to DB)
                        if (pollingRef.current) clearInterval(pollingRef.current);
                        pollingRef.current = null;
                        const pipelineError = (pollData.cached as any)?.cv_match_error || t('error_analysis');
                        throw new Error(pipelineError);
                    } else if (attempts >= maxAttempts) {
                        if (pollingRef.current) clearInterval(pollingRef.current);
                        pollingRef.current = null;
                        throw new Error(t('error_timeout'));
                    }
                } catch (pollError) {
                    if (pollingRef.current) clearInterval(pollingRef.current);
                    pollingRef.current = null;
                    const errMsg = pollError instanceof Error ? pollError.message : String(pollError);
                    setErrorMessage(errMsg);
                    setState('error');
                }
            }, 3000);

        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : String(error);
            console.error('[CV Match] Error:', errMsg);
            setErrorMessage(errMsg);
            setState('error');
        }
    }, [jobId, onMatchStart, onMatchComplete, t]);

    /** Pre-check: how many CVs does the user have? */
    const handleStartAnalysis = useCallback(async () => {
        // If retrying after error/timeout, force-restart to bypass stale-check
        const shouldForceRestart = state === 'error';
        try {
            const res = await fetch('/api/documents/list-cvs');
            const resText = await res.text();
            let data;
            try {
                data = JSON.parse(resText);
            } catch (e) {
                console.error("❌ list-cvs API non-JSON response:", resText.substring(0, 500));
                throw new Error(t('error_cv_load'));
            }
            const cvs: CVOption[] = data.cvs || [];

            if (cvs.length === 0) {
                setShowCvDialog(true);
                return;
            }

            if (cvs.length === 1) {
                // Auto-select the only CV
                runAnalysis(cvs[0].id, shouldForceRestart);
                return;
            }

            // 2+ CVs → show selection dialog
            setCvOptions(cvs);
            setShowCVSelect(true);
        } catch {
            // Fallback: run without specific ID (uses latest)
            runAnalysis(undefined, shouldForceRestart);
        }
    }, [runAnalysis, t, state]);

    // ── NO CV — Blocking State ──────────────────────────────────
    if (state === 'no-cv') {
        return (
            <>
                <DocumentsRequiredDialog
                    open={true}
                    onClose={() => setState('idle')}
                    type="cv"
                />
                <div className="px-6 py-12 flex flex-col items-center justify-center text-center bg-[#FAFAF9] rounded-b-xl border-t border-slate-200">
                    <div className="bg-amber-50 p-4 rounded-full shadow-sm mb-4 border border-amber-200">
                        <AlertCircle className="w-8 h-8 text-amber-500" />
                    </div>
                    <h3 className="text-xl font-semibold text-[#37352F] mb-2">{t('no_cv_title')}</h3>
                    <p className="text-slate-500 text-sm max-w-md mb-6 leading-relaxed">
                        {t('no_cv_desc')}
                    </p>
                    <Button
                        variant="primary"
                        onClick={() => router.push(`/${locale}/dashboard/settings`)}
                    >
                        {t('no_cv_cta')}
                    </Button>
                </div>
            </>
        );
    }

    // ── IDLE / ERROR ────────────────────────────────────────────
    if (state === 'idle' || state === 'error') {
        return (
            <>
                <DocumentsRequiredDialog
                    open={showCvDialog}
                    onClose={() => setShowCvDialog(false)}
                    type="cv"
                />
                <CVSelectDialog
                    isOpen={showCVSelect}
                    cvOptions={cvOptions}
                    onSelect={(id) => {
                        setSelectedCvId(id);
                        runAnalysis(id);
                    }}
                    onClose={() => setShowCVSelect(false)}
                />
                <div className="px-6 py-12 flex flex-col items-center justify-center text-center bg-[#FAFAF9] rounded-b-xl border-t border-slate-200">

                    <h3 className="text-xl font-semibold text-[#37352F] mb-2">{t('title')}</h3>
                    <p className="text-slate-500 text-sm max-w-md mb-6 leading-relaxed"
                       dangerouslySetInnerHTML={{ __html: String(t.raw('subtitle')) }}
                    />
                    {state === 'error' && (
                        <div className="mb-4 text-sm text-red-600 flex items-start gap-2 bg-red-50 px-3 py-2 rounded-md border border-red-100">
                            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                            <div>{errorMessage || t('error_generic')}</div>
                        </div>
                    )}
                    <Button variant="primary" onClick={handleStartAnalysis}>
                        {state === 'error' ? t('btn_retry') : t('btn_start')}
                    </Button>
                </div>
            </>
        );
    }

    // ── LOADING ────────────────────────────────────────────────
    if (state === 'loading') {
        // Map loadingStep → active step index: 1=step0, 2=step2, 3+=step4
        const activeStep = loadingStep === 1 ? 0 : loadingStep === 2 ? 2 : 4;

        return (
            <div className="px-6 py-8 bg-[#FAFAF9] rounded-b-xl border-t border-slate-200">
                {/* Spinner + title — left-aligned like the CV Optimizer design */}
                <div className="flex items-center gap-2.5 mb-1">
                    <Loader2 className="w-5 h-5 text-[#002e7a] animate-spin shrink-0" />
                    <span className="text-sm font-semibold text-[#37352F]">
                        {t('loading_title')}
                    </span>
                </div>
                <p className="text-xs text-[#73726E] mb-5 pl-[29px]">{t('loading_duration')}</p>

                {/* Step list — full width, matches the image layout */}
                <div className="space-y-2">
                    {CV_STEPS.map((label, i) => {
                        const isDone = i < activeStep;
                        const isActive = i === activeStep;
                        return (
                            <motion.div
                                key={i}
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
                                {/* Step indicator badge */}
                                <div className={cn(
                                    'w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 transition-all duration-300',
                                    isDone
                                        ? 'bg-[#002e7a] text-white'
                                        : isActive
                                            ? 'border-2 border-[#002e7a] bg-white text-[#002e7a]'
                                            : 'border border-[#D0CFC8] bg-white text-[#A8A29E]'
                                )}>
                                    {isDone ? (
                                        <CheckCircle2 size={13} />
                                    ) : (
                                        <span>{i + 1}</span>
                                    )}
                                </div>

                                {/* Label */}
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

                                {/* Right: spinner dot for active step */}
                                {isActive && (
                                    <div className="w-3.5 h-3.5 rounded-full bg-[#9CA3AF] shrink-0" />
                                )}
                            </motion.div>
                        );
                    })}
                </div>

                {/* Cancel button — appears after 15s so the user is never stuck */}
                <div className="mt-5 pl-1">
                    <CancelButton t={t} onCancel={() => {
                        if (pollingRef.current) {
                            clearInterval(pollingRef.current);
                            pollingRef.current = null;
                        }
                        setState('idle');
                    }} />
                </div>
            </div>
        );
    }

    // ── COMPLETE ───────────────────────────────────────────────
    if (state === 'complete' && matchData) {
        // §7-compliant: Array.isArray() guards — AI may return null, string, or truncated objects
        const rows = Array.isArray(matchData.requirementRows) ? matchData.requirementRows : [];
        const strengths = Array.isArray(matchData.strengths) ? matchData.strengths : [];
        const gaps = Array.isArray(matchData.gaps) ? matchData.gaps : [];
        const potentialHighlights = Array.isArray(matchData.potentialHighlights) ? matchData.potentialHighlights : [];
        const keywordsFound = Array.isArray(matchData.keywordsFound) ? matchData.keywordsFound : [];
        const keywordsMissing = Array.isArray(matchData.keywordsMissing) ? matchData.keywordsMissing : [];

        const metCount = rows.filter(r => r.status === 'met').length;
        const totalCount = rows.length;
        const metPercent = totalCount > 0 ? Math.round((metCount / totalCount) * 100) : 0;

        const scoreColor = matchData.overallScore >= 70 ? '#22c55e' : matchData.overallScore >= 50 ? '#f59e0b' : '#ef4444';
        const score = typeof matchData.overallScore === 'number' ? matchData.overallScore : parseInt(String(matchData.overallScore ?? 0), 10);

        // Arrays sourced directly from matchData
        /** Truncate to word boundary at ~60 chars */
        const trunc = (s: string, n = 60) =>
            s.length > n ? s.slice(0, s.lastIndexOf(' ', n)) + '…' : s;

        /** Extract boldable first term (noun/verb before first , : - em-dash) */
        const boldFirst = (text: string): React.ReactNode => {
            const m = text.match(/^([^:,\-–]+)[:\-–,]\s*(.*)/);
            if (m) return <><strong className="font-semibold text-slate-900">{m[1].trim()}</strong>{' — '}{trunc(m[2])}</>;
            return trunc(text);
        };

        return (
            <div className="p-5 bg-[#FAFAF9] rounded-b-xl border-t border-slate-200 space-y-4">

                {/* ── Match Score & Score Breakdown — identical card shells, same height ── */}
                <div className="grid grid-cols-2 gap-4 items-stretch">
                    {/* Match Score Card */}
                    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col">
                        <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">
                            {t('score_title')}
                        </h3>
                        <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-semibold text-slate-700">{t('score_match')}</span>
                            <span className="text-sm font-bold text-slate-900">{score}%</span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-slate-100 mb-5">
                            <div
                                className="h-2 rounded-full transition-all duration-700 ease-out"
                                style={{ width: `${score}%`, backgroundColor: scoreColor }}
                            />
                        </div>
                        <div className="space-y-3 flex-1">
                            {[
                                { label: t('strengths'), items: strengths.length > 0 ? strengths : [t('no_strengths')] },
                                { label: t('gaps'), items: gaps.length > 0 ? gaps : [t('no_gaps')] },
                                { label: t('potential'), items: potentialHighlights.length > 0 ? potentialHighlights : [t('no_potential')] },
                            ].map(({ label, items }) => (
                                <div key={label}>
                                    <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1">{label}</p>
                                    <InsightsList items={items} t={t} />
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Score Breakdown */}
                    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col overflow-y-auto max-h-[400px] custom-scrollbar">
                        <h4 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">{t('breakdown_title')}</h4>
                        <div className="space-y-3 flex-1">
                            {[
                                { label: t('breakdown_technical'), value: matchData.scoreBreakdown.technicalSkills },
                                { label: t('breakdown_soft'), value: matchData.scoreBreakdown.softSkills },
                                { label: t('breakdown_experience'), value: matchData.scoreBreakdown.experienceLevel },
                                { label: t('breakdown_domain'), value: matchData.scoreBreakdown.domainKnowledge },
                            ].map((item, i) => {
                                const sc = typeof item.value === 'number' ? item.value : item.value?.score || 0;
                                const reasons = typeof item.value === 'number' ? [] : item.value?.reasons || [];
                                return (
                                    <div key={i} className="mb-2 last:mb-0">
                                        <div className="flex items-center text-sm mb-1">
                                            <div className="w-32 text-slate-500 font-medium text-xs"><strong>{item.label}</strong></div>
                                            <div className="flex-1 h-1.5 bg-[#E7E7E5] rounded-full overflow-hidden mx-2">
                                                <motion.div
                                                    initial={{ width: 0 }}
                                                    animate={{ width: sc + '%' }}
                                                    transition={{ duration: 1, delay: i * 0.1 }}
                                                    className="h-full bg-gradient-to-r from-[#002e7a] to-[#3B82F6]"
                                                />
                                            </div>
                                            <div className="w-8 text-right font-medium text-xs text-[#37352F]">{sc}%</div>
                                        </div>
                                        <ReasonsList reasons={reasons} t={t} />
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* ── Requirements Check ── */}
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                    <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                        <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-400">{t('requirements_title')}</h3>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-400">{metCount}/{totalCount}</span>
                            <div className="w-20 h-1 bg-slate-100 rounded overflow-hidden">
                                <div className="h-1 bg-green-500 rounded" style={{ width: `${metPercent}%` }} />
                            </div>
                        </div>
                    </div>

                    <table className="w-full table-fixed">
                        <colgroup>
                            <col className="w-[22%]" />
                            <col className="w-[36%]" />
                            <col className="w-[42%]" />
                        </colgroup>
                        <thead>
                            <tr className="bg-slate-50 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                                <th className="px-4 py-2 text-left font-semibold">{t('req_col_requirement')}</th>
                                <th className="px-4 py-2 text-left font-semibold">{t('req_col_current')}</th>
                                <th className="px-4 py-2 text-left font-semibold">{t('req_col_suggestion')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {rows.map((row, i) => (
                                <motion.tr
                                    key={i}
                                    initial={{ opacity: 0, y: 5 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.04 }}
                                    className="group hover:bg-slate-50 transition-colors"
                                >
                                    {/* Requirement */}
                                    <td className="py-3 px-4 align-top">
                                        <StatusBadge status={row.status} t={t} />
                                        <p className="text-xs text-slate-700 mt-1.5 leading-snug">{row.requirement}</p>
                                    </td>

                                    {/* Current State — expandable teaser */}
                                    <td className="py-3 px-4 align-top border-l border-slate-100">
                                        <ExpandableCell text={row.currentState} boldFn={boldFirst} t={t} />
                                    </td>

                                    {/* Recommendation — expandable teaser */}
                                    <td className="py-3 px-4 align-top border-l border-slate-100">
                                        <ExpandableCell text={row.suggestion || ''} boldFn={boldFirst} t={t} />
                                    </td>
                                </motion.tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* ── ATS Keywords ── */}
                <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
                    <h4 className="text-xs font-semibold text-[#37352F] mb-2">
                        {t('ats_title')} <span className="text-[10px] text-slate-400 font-normal ml-1">{t('ats_subtitle')}</span>
                    </h4>
                    <p className="text-xs text-slate-500 leading-relaxed mb-3"
                       dangerouslySetInnerHTML={{ __html: String(t.raw('ats_desc')) }}
                    />
                    <div className="flex flex-wrap gap-1.5">
                        {keywordsFound.map(kw => (
                            <span key={kw} className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium bg-green-50 text-green-700 border border-green-100">
                                <CheckCircle2 size={10} /> {kw}
                            </span>
                        ))}
                        {keywordsMissing.map(kw => (
                            <span key={kw} className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium bg-red-50 text-red-700 border border-red-100 opacity-75">
                                <AlertCircle size={10} /> {kw}
                            </span>
                        ))}
                        {keywordsFound.length === 0 && keywordsMissing.length === 0 && (
                            <span className="text-xs text-slate-400 italic">{t('ats_empty')}</span>
                        )}
                    </div>
                </div>

                {/* ── Next Step ── */}
                <div className="bg-blue-50 rounded-lg p-4 flex flex-col sm:flex-row items-center justify-between border border-blue-100">
                    <div>
                        <h4 className="font-semibold text-[#002e7a] text-sm">{t('next_step_title')}</h4>
                        <p className="text-xs text-[#002e7a]/70 mt-0.5">{t('next_step_desc')}</p>
                    </div>
                    <div className="flex gap-3 mt-3 sm:mt-0">
                        <Button variant="primary" onClick={() => onNextStep?.()} className="shadow-sm text-sm">
                            {t('next_step_btn')}
                        </Button>
                    </div>
                </div>

            </div>
        );
    }

    return null;
}
