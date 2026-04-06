"use client"

import { useTranslations, useLocale } from 'next-intl'

import { useState, useEffect, useMemo, useRef } from "react"
import { motion } from "framer-motion"
import { DiffReview } from "./DiffReview"
import { InlineCvEditor } from "./InlineCvEditor"
import { CvStructuredData, CvOptimizationProposal, UserDecisions } from "@/types/cv"
import { CVOptSettings, DEFAULT_CV_OPT_SETTINGS, StationMetrics } from "@/types/cv-opt-settings"
import { applyCVOptSettings } from "@/lib/utils/cv-settings-filter"
import { saveCvDecisions } from "@/app/actions/save-cv-decisions"
import { createClient } from '@/lib/supabase/client'
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { CustomDialog } from "@/components/ui/custom-dialog"
import { Check, Settings, Sparkles, Layout, Pencil, CheckCheck, ToggleLeft, ToggleRight, Video, Loader2 } from "lucide-react"
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { applyOptimizations, stripTodoItems } from '@/lib/utils/cv-merger';
import { cn } from '@/lib/utils';
import QRCode from 'qrcode';
import { useCreditExhausted } from '@/app/[locale]/dashboard/hooks/credit-exhausted-context';

const DynamicPdfViewer = dynamic(
    () => import('@/components/cv-templates/PdfViewerWrapper'),
    {
        ssr: false,
        loading: () => (
            <div className="animate-pulse h-[800px] w-full bg-gray-100 rounded-md flex items-center justify-center">
                <span className="text-gray-400 text-sm">Loading PDF...</span>
            </div>
        ),
    }
);

const DynamicDownloadButton = dynamic(
    () => import('./DownloadButton'),
    { ssr: false }
);

export interface OptimizerWizardProps {
    jobId: string
    liveMatchResult?: any | null
    onGoToCoverLetter?: () => void
    onComplete?: () => void
}

// --- Cancel Button for CV Optimizer (appears after 15s) ---
function OptCancelButton({ onCancel, label }: { onCancel: () => void; label: string }) {
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
            className="mt-4 text-xs text-gray-400 hover:text-red-500 transition-colors"
        >
            {label}
        </motion.button>
    );
}

export function OptimizerWizard({ jobId, liveMatchResult, onGoToCoverLetter, onComplete }: OptimizerWizardProps) {
    const t = useTranslations('cv_optimizer');
    const locale = useLocale();
    const { showPaywall } = useCreditExhausted();
    const [step, setStep] = useState<1 | 2>(1);

    const [isLoading, setIsLoading] = useState(true);
    const [isOptimizing, setIsOptimizing] = useState(false);
    const [optimizerError, setOptimizerError] = useState<string | null>(null);

    // Inline editor state
    const [isEditing, setIsEditing] = useState(false);
    const [editablePdfData, setEditablePdfData] = useState<CvStructuredData | null>(null);

    // Station metrics — always initialized from CV experience, user can fill values before optimizing
    const [stationMetrics, setStationMetrics] = useState<StationMetrics[]>([]);

    const OPT_STEPS = useMemo(() => [
        t('opt_step_1'),
        t('opt_step_2'),
        t('opt_step_3'),
        t('opt_step_4'),
        t('opt_step_5'),
        t('opt_step_6'),
    ], [t]);
    const [optStep, setOptStep] = useState(0);

    useEffect(() => {
        if (isOptimizing) {
            setOptStep(0);
            let idx = 0;
            const interval = setInterval(() => {
                idx = Math.min(idx + 1, OPT_STEPS.length - 1);
                setOptStep(idx);
                if (idx >= OPT_STEPS.length - 1) clearInterval(interval);
            }, 3500);
            return () => clearInterval(interval);
        } else {
            setOptStep(0);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOptimizing]);

    const [cvData, setCvData] = useState<CvStructuredData | null>(null);
    const [jobData, setJobData] = useState<any>(null);
    const [templateId, setTemplateId] = useState<string>("valley");

    // P1: Layout-fix free retry state — read from jobData.metadata, no extra query
    const [freeRetryUsed, setFreeRetryUsed] = useState(false);
    const [isLayoutFixing, setIsLayoutFixing] = useState(false);
    const [layoutFixError, setLayoutFixError] = useState<string | null>(null);

    // CVOptSettings — client-side only, not persisted to DB
    const [cvOptSettings, setCvOptSettings] = useState<CVOptSettings>(DEFAULT_CV_OPT_SETTINGS);

    const [proposal, setProposal] = useState<CvOptimizationProposal | null>(null);
    const [finalCv, setFinalCv] = useState<CvStructuredData | null>(null);
    const [userDecisions, setUserDecisions] = useState<UserDecisions | null>(null);

    const [userId, setUserId] = useState<string | null>(null);

    // QR-Video toggle state
    const [qrEnabled, setQrEnabled] = useState(false);
    const [qrBase64, setQrBase64] = useState<string | undefined>(undefined);
    const [qrLoading, setQrLoading] = useState(false);
    const [showQrDialog, setShowQrDialog] = useState(false);

    // ATS warning for Tech template
    const [showTechAtsWarning, setShowTechAtsWarning] = useState(false);
    const [techAtsWarnDismiss, setTechAtsWarnDismiss] = useState(false);
    const [pendingTechSwitch, setPendingTechSwitch] = useState<(() => void) | null>(null);

    useEffect(() => {
        let isMounted = true;
        const fetchData = async () => {
            setIsLoading(true);
            try {
                const supabase = createClient();
                const { data: { user }, error: authError } = await supabase.auth.getUser();
                if (authError || !user) throw new Error("Not authenticated");

                if (isMounted) setUserId(user.id);

                const { data: jobRes } = await supabase
                    .from('job_queue')
                    .select('*, metadata, cv_optimization_proposal, cv_optimization_user_decisions')
                    .eq('id', jobId)
                    .single();

                const { data: userRes } = await supabase
                    .from('user_profiles')
                    .select('cv_structured_data, preferred_cv_template')
                    .eq('id', user.id)
                    .single();

                if (isMounted) {
                    if (jobRes) {
                        setJobData(jobRes);
                        // P1: Read free-retry flag from metadata (no extra query, QA-7)
                        if (jobRes.metadata?.cv_opt_free_retry_used) {
                            setFreeRetryUsed(true);
                        }

                        // Restore state: proposal is always restored if it exists.
                        // If decisions also exist → full restore (Step 2 skip below).
                        // If only proposal exists → user still sees DiffReview (Step 1).
                        if (jobRes.cv_optimization_proposal) {
                            setProposal(jobRes.cv_optimization_proposal);
                            if (jobRes.cv_optimization_user_decisions) {
                                setUserDecisions(jobRes.cv_optimization_user_decisions);
                            }
                        }
                    }
                    if (userRes) {
                        if (userRes.cv_structured_data) {
                            const cvStructured: CvStructuredData = userRes.cv_structured_data;
                            setCvData(cvStructured);

                            // Pre-populate station metrics from CV experience (max 5, most recent first)
                            if (cvStructured.experience && cvStructured.experience.length > 0) {
                                setStationMetrics(
                                    cvStructured.experience.slice(0, 5).map(exp => ({
                                        company: exp.company || '',
                                        role: exp.role || '',
                                        metrics: '',
                                    }))
                                );
                            }

                            // If we have restored decisions+proposal → skip to Step 2 (Preview)
                            if (jobRes?.cv_optimization_proposal && jobRes?.cv_optimization_user_decisions) {
                                // Prefer proposal.translated as the reconstitution base: it is the CV
                                // AFTER language translation (Pass 1) but BEFORE ATS changes (Pass 2).
                                // Falls back to the original cvStructured for proposals pre-v2.4.
                                const baseForRestore =
                                    jobRes.cv_optimization_proposal.translated ?? cvStructured;
                                const restoredFinalData = applyOptimizations(baseForRestore, jobRes.cv_optimization_user_decisions);
                                setFinalCv(restoredFinalData);
                                setStep(2);
                            }
                            // Otherwise stay at Step 1 (Optimize)
                        }
                        // Valley is ALWAYS the default template (per Directive).
                        // preferred_cv_template is intentionally NOT loaded from DB
                        // so the ATS-warning popup always appears when switching to Tech.
                    }
                }
            } catch (err) {
                console.error("Failed to fetch wizard data:", err);
            } finally {
                if (isMounted) setIsLoading(false);
            }
        };

        // QR code persistence: check if a token already exists for this job
        const restoreQr = async () => {
            try {
                const supabase = createClient();
                const { data: { user } } = await supabase.auth.getUser();
                if (!user || !isMounted) return;

                const { data: approach } = await supabase
                    .from('video_approaches')
                    .select('access_token')
                    .eq('user_id', user.id)
                    .eq('job_id', jobId)
                    .single();

                if (approach?.access_token && isMounted) {
                    const qrUrl = `${window.location.origin}/v/${approach.access_token}`;
                    const QRCode = (await import('qrcode')).default;
                    const base64 = await QRCode.toDataURL(qrUrl, { width: 200, margin: 1 });
                    if (isMounted) {
                        setQrBase64(base64);
                        setQrEnabled(true);
                        console.log('✅ [QR] Restored from existing video_approaches token');
                    }
                }
            } catch {
                // Non-critical — QR just won't be pre-enabled
            }
        };

        fetchData();
        restoreQr();
        return () => { isMounted = false; };
    }, [jobId]);

    /** Start optimizer — passes any filled station metrics directly to the API */
    const handleOptimizeClick = () => {
        if (!cvData) return;
        setOptimizerError(null);
        const filledStations = stationMetrics.filter(s => s.metrics.trim().length > 0);
        runOptimizer(filledStations.length > 0 ? filledStations : undefined);
    };


    const runOptimizer = async (metricsOverride?: StationMetrics[]) => {
        if (!cvData) {
            return;
        }
        setOptimizerError(null);
        setIsOptimizing(true);
        try {
            const supabase = createClient();
            const { data: freshJob } = await supabase
                .from('job_queue')
                .select('*, metadata')
                .eq('id', jobId)
                .single();

            const cvMatch = liveMatchResult
                || freshJob?.metadata?.cv_match
                || freshJob?.cv_match_result
                || jobData?.metadata?.cv_match
                || jobData?.cv_match_result;
            if (!cvMatch) {
                setIsOptimizing(false);
                setOptimizerError(t('error_no_match'));
                return;
            }

            setJobData(freshJob);

            const metricsToSend = metricsOverride?.filter(s => s.metrics.trim().length > 0);

            // 110s client-side timeout — slightly below the 120s server maxDuration
            // so the server can return a proper error response instead of the client aborting first.
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 110_000);

            const res = await fetch('/api/cv/optimize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    cv_structured_data: cvData,
                    cv_match_result: cvMatch,
                    template_id: templateId,
                    job_id: jobId,
                    user_id: userId,
                    locale,
                    ...(metricsToSend && metricsToSend.length > 0 ? { station_metrics: metricsToSend } : {}),
                    cv_opt_settings: { showSummary: cvOptSettings.showSummary, summaryMode: cvOptSettings.summaryMode },
                }),
                signal: controller.signal,
            });
            clearTimeout(timeoutId);

            const data = await res.json();

            // ── Credit Exhaustion: show paywall modal, not generic error ──
            if (res.status === 402 && data.error === 'CREDITS_EXHAUSTED') {
                showPaywall('credits', { remaining: data.remaining ?? 0 });
                return; // Do NOT set optimizerError — paywall modal handles the UX
            }

            if (!res.ok || !data.success) {
                // API returns error codes (e.g. 'error_ai_failed') — translate via t()
                const errorCode = data.error || 'error_failed';
                const translated = t.has(errorCode) ? t(errorCode) : (data.details || t('error_failed'));
                throw new Error(translated);
            }

            setProposal(data.proposal);
        } catch (error: unknown) {
            if (error instanceof DOMException && error.name === 'AbortError') {
                console.error('[CV Optimize] Client timeout after 110s');
                setOptimizerError(t('error_timeout'));
            } else {
                const msg = error instanceof Error ? error.message : t('error_unknown');
                console.error('[CV Optimize] Error:', msg);
                setOptimizerError(msg);
            }
        } finally {
            setIsOptimizing(false);
        }
    };

    const handleSaveDiffs = async (finalData: CvStructuredData, accepted: any[]) => {
        setFinalCv(finalData);

        const choices: Record<string, 'accepted'> = {};
        accepted.forEach(c => { choices[c.id] = 'accepted'; });
        const decisions: UserDecisions = { choices, appliedChanges: accepted };
        setUserDecisions(decisions);

        if (!proposal) {
            return;
        }

        const res = await saveCvDecisions(jobId, decisions, proposal);
        if (res.success) {
            setStep(2); // -> Preview
            onComplete?.();
        } else {
        }
    };

    // -- Step 2: Template Switcher --
    const applyTemplateSwitch = async (newId: string) => {
        setTemplateId(newId);
        if (userId) {
            try {
                const supabase = createClient();
                await supabase
                    .from('user_profiles')
                    .update({ preferred_cv_template: newId })
                    .eq('id', userId);
            } catch (err) {
                console.error("Failed to persist template preference:", err);
            }
        }
    };

    const handleTemplateSwitchInPreview = (newId: string) => {
        if (newId === 'tech') {
            const alreadyDismissed = typeof window !== 'undefined'
                && sessionStorage.getItem('pathly_tech_ats_warning_dismissed') === 'true';
            if (!alreadyDismissed) {
                // Intercept: show warning, remember what to do if user proceeds
                setTechAtsWarnDismiss(false);
                setPendingTechSwitch(() => () => applyTemplateSwitch(newId));
                setShowTechAtsWarning(true);
                return;
            }
        }
        applyTemplateSwitch(newId);
    };

    const handleTechAtsWarningProceed = () => {
        if (techAtsWarnDismiss) {
            sessionStorage.setItem('pathly_tech_ats_warning_dismissed', 'true');
        }
        setShowTechAtsWarning(false);
        pendingTechSwitch?.();
        setPendingTechSwitch(null);
    };

    const handleTechAtsWarningStay = () => {
        setShowTechAtsWarning(false);
        setPendingTechSwitch(null);
    };

    // -- Layout-Fix Retry: free, once per job --
    const handleLayoutFixRetry = async () => {
        if (freeRetryUsed || isLayoutFixing) return;
        setIsLayoutFixing(true);
        setLayoutFixError(null);
        try {
            const res = await fetch('/api/cv/optimize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    cv_structured_data: cvData,
                    cv_match_result: jobData?.metadata?.cv_match,
                    template_id: templateId,
                    job_id: jobId,
                    user_id: userId,
                    locale,
                    layoutFix: true,
                    cv_opt_settings: { showSummary: cvOptSettings.showSummary, summaryMode: cvOptSettings.summaryMode },
                }),
            });
            const data = await res.json();

            // ── Credit Exhaustion on layout-fix (should not happen — it's free — but guard anyway)
            if (res.status === 402 && data.error === 'CREDITS_EXHAUSTED') {
                showPaywall('credits', { remaining: data.remaining ?? 0 });
                return;
            }

            if (!res.ok) {
                if (data.error === 'free_retry_exhausted') {
                    setFreeRetryUsed(true);
                    setLayoutFixError(t('error_free_retry_exhausted'));
                } else {
                    setLayoutFixError(data.details || t('error_failed'));
                }
                return;
            }
            if (data.proposal) {
                setProposal(data.proposal);
                setFreeRetryUsed(true);
                setStep(1); // Back to diff-review with new proposal
            }
        } catch {
            setLayoutFixError(t('error_failed'));
        } finally {
            setIsLayoutFixing(false);
        }
    };

    // -- QR-Video: Button opens dialog or toggles off --
    const handleQrToggle = () => {
        if (qrEnabled) {
            // Toggle off — no dialog needed
            setQrEnabled(false);
            setQrBase64(undefined);
            return;
        }
        // Show consent dialog
        setShowQrDialog(true);
    };

    // -- QR-Video: Actually generate after consent --
    const generateQrCode = async () => {
        setShowQrDialog(false);
        setQrLoading(true);
        try {
            const res = await fetch('/api/video/create-token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jobId }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                console.error('[QR Toggle] Token creation failed:', data.error);
                return;
            }

            // async→sync bridge: resolve QR Base64 here, not in template
            const qrUrl = `${window.location.origin}/v/${data.accessToken}`;
            const base64 = await QRCode.toDataURL(qrUrl, { width: 200, margin: 1 });
            setQrBase64(base64);
            setQrEnabled(true);
        } catch (err) {
            console.error('[QR Toggle] Error:', err);
        } finally {
            setQrLoading(false);
        }
    };

    // Compute clean PDF data from finalCv + decisions + CVOptSettings
    const pdfData = useMemo(() => {
        if (!finalCv) return null;
        const stripped = stripTodoItems(finalCv);
        return applyCVOptSettings(stripped, cvOptSettings);
    }, [finalCv, cvOptSettings]);

    // Sync editablePdfData when pdfData changes
    useEffect(() => {
        setEditablePdfData(pdfData);
    }, [pdfData]);

    // Active render data (editor overrides pdfData)
    const activePdfData = editablePdfData ?? pdfData;

    if (isLoading) {
        return <div className="p-10 flex justify-center"><LoadingSpinner className="w-8 h-8 text-[#012e7a]" /></div>;
    }

    if (!cvData) {
        return (
            <div className="p-8 text-center bg-gray-50 border border-gray-200 rounded-lg space-y-4">
                <p className="text-gray-800 text-lg font-medium">{t('no_cv_title')}</p>
                <p className="text-sm text-gray-500 max-w-sm mx-auto">
                    {t('no_cv_desc')}
                </p>
                <Link href={`/${locale}/dashboard/settings`} className="inline-block mt-4 text-blue-600 hover:text-blue-800 font-medium underline">
                    {t('no_cv_link')}
                </Link>
            </div>
        );
    }

    const TEMPLATES = [
        { id: 'valley', label: 'Valley', icon: <Layout className="w-4 h-4" /> },
        { id: 'tech', label: 'Tech', icon: <Settings className="w-4 h-4" /> },
    ];

    return (
        <div className="w-full flex flex-col space-y-6">
            {/* Step Indicator — 2 steps only */}
            <div className="flex gap-4 items-center mb-4 px-4 py-3 bg-gray-50 border border-gray-100 rounded-lg">
                <div className={`flex items-center gap-2 text-sm font-medium ${step >= 1 ? 'text-[#012e7a]' : 'text-gray-400'}`}>
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${step >= 1 ? 'bg-blue-100 text-[#012e7a]' : 'bg-gray-200'}`}>1</span>
                    {t('step_optimize')}
                </div>
                <div className="w-8 h-[1px] bg-gray-300" />
                <div className={`flex items-center gap-2 text-sm font-medium ${step === 2 ? 'text-[#012e7a]' : 'text-gray-400'}`}>
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${step === 2 ? 'bg-blue-100 text-[#012e7a]' : 'bg-gray-200'}`}>2</span>
                    {t('step_preview')}
                </div>
            </div>

            {/* Active Step Content */}
            <motion.div
                key={step}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
            >
                {/* ===== STEP 1: OPTIMIZE ===== */}
                {step === 1 && !proposal && (
                    <div className="flex flex-col items-center justify-center p-12 bg-white border border-gray-200 rounded-xl space-y-6">
                        {isOptimizing ? (
                            <div className="w-full px-6 py-8 bg-[#FAFAF9] rounded-xl border border-slate-200">
                                {/* Spinner + title — left-aligned, identical to CV Match design */}
                                <div className="flex items-center gap-2.5 mb-1">
                                    <LoadingSpinner className="w-5 h-5 text-[#002e7a] shrink-0" />
                                    <span className="text-sm font-semibold text-[#37352F]">
                                        {t('optimizing_title')}
                                    </span>
                                </div>
                                <p className="text-xs text-[#73726E] mb-5 pl-[29px]">{t('optimizing_duration')}</p>

                                {/* Step list — full width, identical structure to CV Match */}
                                <div className="space-y-2">
                                    {OPT_STEPS.map((label, i) => {
                                        const isDone = i < optStep;
                                        const isActive = i === optStep;
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
                                                    {isDone ? <Check size={12} /> : <span>{i + 1}</span>}
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

                                                {/* Right: grey dot for active step */}
                                                {isActive && (
                                                    <div className="w-3.5 h-3.5 rounded-full bg-[#9CA3AF] shrink-0" />
                                                )}
                                            </motion.div>
                                        );
                                    })}
                                </div>

                                {/* Cancel button — appears after 15s */}
                                <div className="mt-5 pl-1">
                                    <OptCancelButton onCancel={() => setIsOptimizing(false)} label={t('cancel')} />
                                </div>
                            </div>
                        ) : (
                            <>
                                {/* Error state: visible retry UI */}
                                {optimizerError && (
                                    <div className="w-full max-w-md mb-4 bg-red-50 border border-red-200 rounded-lg p-4 text-left">
                                        <p className="text-sm font-medium text-red-800 mb-1">{t('error_failed')}</p>
                                        <p className="text-xs text-red-700 mb-3">{optimizerError}</p>
                                        <button
                                            onClick={() => { setOptimizerError(null); handleOptimizeClick(); }}
                                            className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-md transition"
                                        >
                                            {t('error_retry')}
                                        </button>
                                    </div>
                                )}
                                <div className="text-center max-w-md w-full">
                                    <h3 className="text-xl font-semibold text-gray-900 mb-2">{t('main_title')}</h3>
                                    <p className="text-gray-500 mb-4 text-pretty leading-relaxed">
                                        {t.rich('main_desc', {
                                            cv: (chunks) => <strong className="text-gray-700 font-medium">{chunks}</strong>,
                                            matchResults: (chunks) => <strong className="text-gray-700 font-medium">{chunks}</strong>,
                                            suggestions: (chunks) => <strong className="text-gray-700 font-medium">{chunks}</strong>,
                                            moreSuccess: (chunks) => <strong className="text-gray-700 font-medium">{chunks}</strong>,
                                        })}
                                    </p>

                                    {/* Anzeigeoptionen Toggle Group */}
                                    <details className="w-full mb-4 text-left group">
                                        <summary className="flex items-center gap-2 cursor-pointer select-none text-sm font-medium text-gray-600 hover:text-gray-900 transition list-none">
                                            <span className="text-gray-400 group-open:rotate-90 transition-transform duration-200 inline-block">▶</span>
                                            {t('display_options')}
                                        </summary>
                                        <div className="mt-3 bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">

                                            {/* Summary toggle */}
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm text-gray-700">{t('show_summary')}</span>
                                                <button
                                                    onClick={() => setCvOptSettings(s => ({ ...s, showSummary: !s.showSummary }))}
                                                    className="text-gray-500 hover:text-[#012e7a] transition"
                                                    aria-label={t('show_summary')}
                                                >
                                                    {cvOptSettings.showSummary
                                                        ? <ToggleRight className="w-7 h-7 text-[#012e7a]" />
                                                        : <ToggleLeft className="w-7 h-7 text-gray-400" />}
                                                </button>
                                            </div>
                                            {cvOptSettings.showSummary && (
                                                <div className="ml-4 flex gap-3">
                                                    <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                                                        <input
                                                            type="radio"
                                                            name="summaryMode"
                                                            checked={cvOptSettings.summaryMode === 'full'}
                                                            onChange={() => setCvOptSettings(s => ({ ...s, summaryMode: 'full' }))}
                                                            className="accent-[#012e7a]"
                                                        />
                                                        {t('summary_full')}
                                                    </label>
                                                    <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                                                        <input
                                                            type="radio"
                                                            name="summaryMode"
                                                            checked={cvOptSettings.summaryMode === 'compact'}
                                                            onChange={() => setCvOptSettings(s => ({ ...s, summaryMode: 'compact' }))}
                                                            className="accent-[#012e7a]"
                                                        />
                                                        {t('summary_compact')}
                                                    </label>
                                                </div>
                                            )}

                                            {/* Certificates toggle */}
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm text-gray-700">{t('show_certificates')}</span>
                                                <button
                                                    onClick={() => setCvOptSettings(s => ({ ...s, showCertificates: !s.showCertificates }))}
                                                    className="text-gray-500 hover:text-[#012e7a] transition"
                                                    aria-label={t('show_certificates')}
                                                >
                                                    {cvOptSettings.showCertificates
                                                        ? <ToggleRight className="w-7 h-7 text-[#012e7a]" />
                                                        : <ToggleLeft className="w-7 h-7 text-gray-400" />}
                                                </button>
                                            </div>

                                            {/* Languages toggle */}
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm text-gray-700">{t('show_languages')}</span>
                                                <button
                                                    onClick={() => setCvOptSettings(s => ({ ...s, showLanguages: !s.showLanguages }))}
                                                    className="text-gray-500 hover:text-[#012e7a] transition"
                                                    aria-label={t('show_languages')}
                                                >
                                                    {cvOptSettings.showLanguages
                                                        ? <ToggleRight className="w-7 h-7 text-[#012e7a]" />
                                                        : <ToggleLeft className="w-7 h-7 text-gray-400" />}
                                                </button>
                                            </div>
                                        </div>
                                    </details>

                                    {/* Metriken Toggle — station-based, always visible, same style as Anzeigeoptionen */}
                                    {stationMetrics.length > 0 && (
                                        <details className="w-full mb-6 text-left group" id="metrics-accordion">
                                            <summary className="flex items-center gap-2 cursor-pointer select-none text-sm font-medium text-gray-600 hover:text-gray-900 transition list-none">
                                                <span className="text-gray-400 group-open:rotate-90 transition-transform duration-200 inline-block">▶</span>
                                                {t('metrics_title')}
                                            </summary>
                                            <div className="mt-3 bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
                                                <p className="text-xs text-gray-500">
                                                    {t('metrics_desc')}
                                                </p>
                                                <div className="space-y-3">
                                                    {stationMetrics.map((station, idx) => (
                                                        <div key={idx} className="bg-white border border-gray-200 rounded-md p-3">
                                                            <div className="flex items-center gap-2 mb-1.5">
                                                                <span className="text-sm font-medium text-gray-900">{station.company}</span>
                                                            </div>
                                                            {station.role && (
                                                                <p className="text-xs text-gray-500 mb-2">{station.role}</p>
                                                            )}
                                                            <input
                                                                type="text"
                                                                value={station.metrics}
                                                                onChange={(e) => {
                                                                    const updated = [...stationMetrics];
                                                                    updated[idx] = { ...updated[idx], metrics: e.target.value.slice(0, 150) };
                                                                    setStationMetrics(updated);
                                                                }}
                                                                placeholder={t('metrics_placeholder')}
                                                                className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#012e7a]/30"
                                                                maxLength={150}
                                                            />
                                                            <p className="text-[10px] text-gray-400 mt-0.5 text-right">{station.metrics.length}/150</p>
                                                        </div>
                                                    ))}
                                                </div>
                                                {/* OK button — collapses accordion and confirms entries */}
                                                {stationMetrics.some(s => s.metrics.trim().length > 0) && (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const el = document.getElementById('metrics-accordion') as HTMLDetailsElement | null;
                                                            if (el) el.open = false;
                                                        }}
                                                        className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-[#012e7a] hover:bg-[#01246b] text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
                                                    >
                                                        <Check className="w-4 h-4" />
                                                        {t('metrics_ok')}
                                                    </button>
                                                )}
                                            </div>
                                        </details>
                                    )}

                                    <button
                                        onClick={handleOptimizeClick}
                                        className="px-6 py-3 bg-[#012e7a] hover:bg-[#01246b] transition flex items-center gap-2 font-medium text-white rounded-lg shadow-sm w-full justify-center"
                                    >
                                        <Sparkles className="w-5 h-5" />
                                        {t('start_button')}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                )}

                {step === 1 && proposal && (
                    <div className="flex items-center justify-center py-8">
                        <div className="w-full">
                            <DiffReview
                                jobId={jobId}
                                originalCv={cvData}
                                proposal={proposal}
                                atsKeywords={
                                    jobData?.metadata?.cv_match?.keywordsMissing
                                    || jobData?.buzzwords
                                    || []
                                }
                                onSave={handleSaveDiffs}
                                onCancel={() => setProposal(null)}
                            />
                        </div>
                    </div>
                )}

                {/* ===== STEP 2: PREVIEW ===== */}
                {step === 2 && activePdfData && (
                    <div className="space-y-4 px-4">
                        {/* Template Switcher + Bearbeiten */}
                        <div className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-5 py-3">
                            <div className="text-sm font-medium text-gray-700">{t('template_label')}</div>
                            <div className="flex gap-2">
                                {TEMPLATES.map((tmpl) => (
                                    <button
                                        key={tmpl.id}
                                        onClick={() => handleTemplateSwitchInPreview(tmpl.id)}
                                        className={`
                                            px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all
                                            ${templateId === tmpl.id
                                                ? 'bg-[#012e7a] text-white shadow-sm'
                                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}
                                        `}
                                    >
                                        {tmpl.icon}
                                        {tmpl.label}
                                    </button>
                                ))}
                                <button
                                    onClick={() => setIsEditing(!isEditing)}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all
                                        ${isEditing
                                            ? 'bg-[#012e7a] text-white shadow-sm'
                                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                        }`}
                                >
                                    {isEditing ? <><CheckCheck size={15} /> {t('edit_done')}</> : <><Pencil size={15} /> {t('edit_start')}</>}
                                </button>
                            </div>
                            {/* QR-Video Toggle */}
                            <button
                                onClick={handleQrToggle}
                                disabled={qrLoading}
                                className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all
                                    ${qrEnabled
                                        ? 'bg-[#012e7a] text-white shadow-sm'
                                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                    } ${qrLoading ? 'opacity-50 cursor-wait' : ''}`}
                            >
                                {qrLoading ? <Loader2 size={15} className="animate-spin" /> : <Video size={15} />}
                                {t('qr_video')}
                            </button>
                        </div>

                        {/* PDF Preview + optional editor panel */}
                        {isEditing ? (
                            <div className="grid grid-cols-[1fr_480px] gap-4 items-start">
                                <DynamicPdfViewer data={activePdfData} templateId={templateId} qrBase64={qrBase64} />
                                <div className="sticky top-4 bg-white rounded-xl border border-slate-200 p-4 h-[800px]">
                                    <InlineCvEditor
                                        data={activePdfData}
                                        onChange={setEditablePdfData}
                                        onClose={() => setIsEditing(false)}
                                    />
                                </div>
                            </div>
                        ) : (
                            <DynamicPdfViewer data={activePdfData} templateId={templateId} qrBase64={qrBase64} />
                        )}

                        <div className="flex flex-col sm:flex-row justify-between items-center py-4 border-t border-gray-100 mt-6 mb-8 gap-4 pb-4">
                            <button
                                onClick={() => { setStep(1); setIsEditing(false); }}
                                className="px-5 py-2 text-gray-600 hover:text-gray-900 font-medium rounded-lg hover:bg-gray-50 flex items-center transition w-full sm:w-auto justify-center"
                            >
                                {t('back_to_optimizer')}
                            </button>

                            <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
                                <div className="flex flex-col items-center sm:items-start w-full sm:w-auto">
                                    <button
                                        onClick={handleLayoutFixRetry}
                                        disabled={freeRetryUsed || isLayoutFixing}
                                        title={freeRetryUsed ? t('btn_layout_fix_used') : t('btn_layout_fix_tooltip')}
                                        className={[
                                            'px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors w-full sm:w-auto justify-center',
                                            freeRetryUsed || isLayoutFixing
                                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed opacity-60'
                                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
                                        ].join(' ')}
                                    >
                                        {isLayoutFixing ? (
                                            <><Loader2 className="w-4 h-4 animate-spin" /> {t('optimizing_title')} (~30-75s)</>
                                        ) : (
                                            <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg> {freeRetryUsed ? t('btn_layout_fix_used') : t('btn_layout_fix')}</>
                                        )}
                                    </button>
                                    {isLayoutFixing && (
                                        <span className="text-[10px] text-gray-400 mt-1 text-center">{t('optimizing_duration')}</span>
                                    )}
                                </div>
                                <div className="w-full sm:w-auto">
                                    <DynamicDownloadButton data={activePdfData} templateId={templateId} qrBase64={qrBase64} />
                                </div>
                                <button
                                    onClick={() => onGoToCoverLetter?.()}
                                    className="px-5 py-2.5 bg-white border border-[#012e7a] text-[#012e7a] hover:bg-[#012e7a]/5 font-medium rounded-lg flex items-center justify-center gap-2 transition-colors w-full sm:w-auto"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                                    {t('cover_letter')}
                                </button>
                            </div>
                            {layoutFixError && (
                                <p className="text-xs text-red-600 mt-1 w-full text-center sm:text-right">{layoutFixError}</p>
                            )}
                        </div>

                    </div>
                )}
            </motion.div>

            {/* QR-Video Consent Dialog */}
            <CustomDialog
                isOpen={showQrDialog}
                onClose={() => setShowQrDialog(false)}
                title={t('qr_dialog_title')}
                maxWidth="max-w-lg"
            >
                <div className="p-6 space-y-4">
                    <p className="text-sm text-gray-600 leading-relaxed">
                        {t('qr_intro')}
                    </p>

                    <div className="space-y-2.5">
                        <div className="border border-gray-100 rounded-lg p-3">
                            <p className="text-sm font-semibold text-gray-900 mb-0.5">{t('qr_benefit_1_title')}</p>
                            <p className="text-xs text-gray-500 leading-relaxed">{t('qr_benefit_1_desc')}</p>
                        </div>

                        <div className="border border-gray-100 rounded-lg p-3">
                            <p className="text-sm font-semibold text-gray-900 mb-0.5">{t('qr_benefit_2_title')}</p>
                            <p className="text-xs text-gray-500 leading-relaxed">{t('qr_benefit_2_desc')}</p>
                        </div>

                        <div className="border border-gray-100 rounded-lg p-3">
                            <p className="text-sm font-semibold text-gray-900 mb-0.5">{t('qr_benefit_3_title')}</p>
                            <p className="text-xs text-gray-500 leading-relaxed">{t('qr_benefit_3_desc')}</p>
                        </div>

                        <div className="border border-gray-100 rounded-lg p-3">
                            <p className="text-sm font-semibold text-gray-900 mb-0.5">{t('qr_benefit_4_title')}</p>
                            <p className="text-xs text-gray-500 leading-relaxed">{t('qr_benefit_4_desc')}</p>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                        <button
                            onClick={() => setShowQrDialog(false)}
                            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-50 transition"
                        >
                            {t('qr_cancel')}
                        </button>
                        <button
                            onClick={generateQrCode}
                            className="px-5 py-2.5 bg-[#012e7a] hover:bg-[#012e7a]/90 text-white text-sm font-medium rounded-lg transition flex items-center gap-2"
                        >
                            <Video size={15} />
                            {t('qr_agree')}
                        </button>
                    </div>
                </div>
            </CustomDialog>

            {/* ATS Warning Dialog – Tech Template */}
            <CustomDialog isOpen={showTechAtsWarning} onClose={handleTechAtsWarningStay} title={t('tech_ats_warning_title')}>
                <div className="p-6 space-y-5">
                    
                    {/* Amber Alert Banner */}
                    <div className="flex items-start gap-3 bg-amber-50 border border-amber-200/60 rounded-lg p-4">
                        <div className="mt-0.5 flex-shrink-0">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-amber-600">
                                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                <line x1="12" y1="9" x2="12" y2="13" />
                                <line x1="12" y1="17" x2="12.01" y2="17" />
                            </svg>
                        </div>
                        <p className="text-sm text-amber-800 leading-relaxed">
                            {t('tech_ats_warning_body')}
                        </p>
                    </div>

                    {/* Dismiss checkbox */}
                    <label className="flex items-center gap-2.5 cursor-pointer select-none group w-max">
                        <input
                            type="checkbox"
                            checked={techAtsWarnDismiss}
                            onChange={e => setTechAtsWarnDismiss(e.target.checked)}
                            className="w-4 h-4 rounded border-gray-300 text-[#012e7a] focus:ring-[#012e7a] cursor-pointer"
                        />
                        <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900 transition-colors">
                            {t('tech_ats_warning_dismiss')}
                        </span>
                    </label>

                    {/* Actions */}
                    <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                        <button
                            onClick={handleTechAtsWarningProceed}
                            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-50 transition"
                        >
                            {t('tech_ats_warning_proceed')}
                        </button>
                        <button
                            onClick={handleTechAtsWarningStay}
                            className="px-4 py-2 bg-[#012e7a] hover:bg-[#012e7a]/90 text-white text-sm font-medium rounded-lg transition"
                        >
                            {t('tech_ats_warning_stay')}
                        </button>
                    </div>
                </div>
            </CustomDialog>
        </div>
    );
}
