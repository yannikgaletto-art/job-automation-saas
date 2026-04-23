"use client";

/**
 * CVMatchTab — V5 Steckbrief Card Redesign.
 * - MatchOrbit: Shows Steckbrief cards in right panel (replaces old table).
 * - ATS Keywords: Expandable toggle below the orbit.
 * - Next Step: CTA to proceed to CV Optimizer.
 *
 * i18n: All UI strings use useTranslations('cv_match').
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { motion, AnimatePresence } from 'framer-motion';
import { CVMatchResult } from '@/lib/services/cv-match-analyzer';
import { MatchOrbit } from './MatchOrbit';
import { Button } from '@/components/motion/button';
import {
    Loader2, CheckCircle2, AlertCircle, ChevronDown
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { CVSelectDialog, type CVOption } from '@/components/dashboard/cv-select-dialog';
import { DocumentsRequiredDialog } from '@/components/shared/documents-required-dialog';
import { useNotification } from '@/hooks/use-notification';
import { useCreditExhausted } from '@/app/[locale]/dashboard/hooks/credit-exhausted-context';

interface CVMatchTabProps {
    jobId: string;
    cachedMatch?: any;
    onMatchStart?: () => void;
    onMatchComplete?: (result: any) => void;
    onNextStep?: () => void;
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
    const { showPaywall } = useCreditExhausted();
    const [matchData, setMatchData] = useState<CVMatchResult | null>(null);
    const [loadingStep, setLoadingStep] = useState(0);
    const [atsOpen, setAtsOpen] = useState(false);
    const [isMatchFromCache, setIsMatchFromCache] = useState(true);

    // Steps shown during loading — 5 steps for progressive disclosure
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
                    setIsMatchFromCache(true);
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
    const notifiedRef = useRef(false);

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
        setIsMatchFromCache(false);
        setShowCVSelect(false);
        onMatchStart?.();

        try {
            await new Promise(r => setTimeout(r, 800));
            setLoadingStep(2);

            // Progressive step simulation during the polling wait
            const step3Timer = setTimeout(() => setLoadingStep(3), 10000);
            const step4Timer = setTimeout(() => setLoadingStep(4), 25000);
            const step5Timer = setTimeout(() => setLoadingStep(5), 45000);

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
                if (res.status === 402 && data?.error === 'CREDITS_EXHAUSTED') {
                    showPaywall('credits', { remaining: data.remaining ?? 0 });
                    setState('idle');
                    return;
                }
                if (data?.code === 'CV_NOT_FOUND') {
                    setState('no-cv');
                    return;
                }
                throw new Error(data?.error || t('error_analysis'));
            }

            // Cache HIT: identical input already analyzed — load cached result immediately
            if (data?.status === 'done_cached') {
                console.log('✅ [CV Match] Cache HIT — loading existing result');
                try {
                    const cacheRes = await fetch(`/api/cv/match/cached?jobId=${jobId}`);
                    const cacheData = await cacheRes.json();
                    if (cacheData.success && cacheData.cached?.analyzed_at) {
                        setMatchData(cacheData.cached);
                        setIsMatchFromCache(true);
                        setState('complete');
                        onMatchComplete?.(cacheData.cached);
                        return;
                    }
                } catch (cacheError) {
                    console.warn('[CV Match] Cache read failed:', cacheError);
                }
                // Fallback: cache read failed — reset to idle so user can retry
                setState('idle');
                return;
            }

            // Poll for results (Inngest processes in background)
            let attempts = 0;
            const maxAttempts = 60; // 60 × 3s = 180s max — single Sonnet call expected in 40-70s

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
                        clearTimeout(step3Timer);
                        clearTimeout(step4Timer);
                        clearTimeout(step5Timer);
                        setMatchData(pollData.cached);
                        setState('complete');
                        if (!notifiedRef.current) {
                            notifiedRef.current = true;
                            notify(t('notify_match_done'));
                        }
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

        const score = typeof matchData.overallScore === 'number' ? matchData.overallScore : parseInt(String(matchData.overallScore ?? 0), 10);

        return (
            <div className="p-5 bg-[#FAFAF9] rounded-b-xl border-t border-slate-200 space-y-4" style={{ minHeight: 600 }}>

                {/* ── MatchOrbit + Steckbrief Card Stack ── */}
                <MatchOrbit
                    overallScore={score}
                    breakdown={matchData.scoreBreakdown}
                    summaryData={{ strengths, gaps, potentialHighlights }}
                    overallRecommendation={typeof matchData.overallRecommendation === 'string' ? matchData.overallRecommendation : undefined}
                    requirementRows={rows}
                    isFromCache={isMatchFromCache}
                />

                {/* ── ATS Keywords (Toggle) ── */}
                <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
                    <button
                        onClick={() => setAtsOpen(!atsOpen)}
                        className="w-full px-4 py-3 flex justify-between items-center cursor-pointer hover:bg-slate-50 transition-colors"
                    >
                        <h4 className="text-xs font-semibold text-[#37352F] flex items-center gap-1.5">
                            {t('toggle_ats_keywords')}
                            <span className="text-[10px] text-slate-400 font-normal">{t('ats_subtitle')}</span>
                        </h4>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-400">
                                {keywordsFound.length} ✓ / {keywordsMissing.length} ✗
                            </span>
                            <ChevronDown
                                size={14}
                                className={cn("text-slate-400 transition-transform duration-200", atsOpen && "rotate-180")}
                            />
                        </div>
                    </button>

                    <AnimatePresence>
                        {atsOpen && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.25, ease: 'easeInOut' }}
                                className="overflow-hidden"
                            >
                                <div className="px-4 pb-4 pt-1">
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
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* ── Next Step ── */}
                <div className="flex items-center justify-end gap-3 pt-1">
                    <Button variant="primary" onClick={() => onNextStep?.()} className="shadow-sm text-sm">
                        {t('next_step_btn')}
                    </Button>
                </div>

            </div>
        );
    }

    return null;
}
