"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { motion } from "framer-motion"
import { TemplateSelector } from "./TemplateSelector"
import { DiffReview } from "./DiffReview"
import { InlineCvEditor } from "./InlineCvEditor"
import { CvStructuredData, CvOptimizationProposal, UserDecisions } from "@/types/cv"
import { CVOptSettings, DEFAULT_CV_OPT_SETTINGS, StationMetrics } from "@/types/cv-opt-settings"
import { applyCVOptSettings } from "@/lib/utils/cv-settings-filter"
import { saveCvDecisions } from "@/app/actions/save-cv-decisions"
import { createClient } from '@/lib/supabase/client'
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { CustomDialog } from "@/components/ui/custom-dialog"
import { Check, Settings, Sparkles, FileText, Layout, Pencil, CheckCheck, ToggleLeft, ToggleRight, Video, Loader2 } from "lucide-react"
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { applyOptimizations, stripTodoItems } from '@/lib/utils/cv-merger';
import QRCode from 'qrcode';

const DynamicPdfViewer = dynamic(
    () => import('@/components/cv-templates/PdfViewerWrapper'),
    {
        ssr: false,
        loading: () => (
            <div className="animate-pulse h-[800px] w-full bg-gray-100 rounded-md flex items-center justify-center">
                <span className="text-gray-400 text-sm">PDF wird geladen...</span>
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
}

// --- Cancel Button for CV Optimizer (appears after 15s) ---
function OptCancelButton({ onCancel }: { onCancel: () => void }) {
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
            Abbrechen
        </motion.button>
    );
}

export function OptimizerWizard({ jobId, liveMatchResult, onGoToCoverLetter }: OptimizerWizardProps) {
    const [step, setStep] = useState<1 | 2>(1);

    const [isLoading, setIsLoading] = useState(true);
    const [isOptimizing, setIsOptimizing] = useState(false);
    const [optimizerError, setOptimizerError] = useState<string | null>(null);

    // Inline editor state
    const [isEditing, setIsEditing] = useState(false);
    const [editablePdfData, setEditablePdfData] = useState<CvStructuredData | null>(null);

    // Station metrics — always initialized from CV experience, user can fill values before optimizing
    const [stationMetrics, setStationMetrics] = useState<StationMetrics[]>([]);

    const OPT_STEPS = [
        "Lebenslauf & Match-Ergebnisse werden geladen",
        "Schwachstellen werden analysiert",
        "Bullet-Points werden neu formuliert",
        "Keywords aus der Stellenanzeige werden integriert",
        "ATS-Kompatibilität wird geprüft",
        "Vorschläge werden finalisiert",
    ];
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
    const [templateId, setTemplateId] = useState<string>("clean");

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

                        // Restore state if optimization was already completed previously
                        if (jobRes.cv_optimization_proposal && jobRes.cv_optimization_user_decisions) {
                            setProposal(jobRes.cv_optimization_proposal);
                            setUserDecisions(jobRes.cv_optimization_user_decisions);
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
                                        company: exp.company || 'Unbekannt',
                                        role: exp.role || '',
                                        metrics: '',
                                    }))
                                );
                            }

                            // If we have restored decisions+proposal -> skip to Step 2 (Preview)
                            if (jobRes?.cv_optimization_proposal && jobRes?.cv_optimization_user_decisions) {
                                const restoredFinalData = applyOptimizations(cvStructured, jobRes.cv_optimization_user_decisions);
                                setFinalCv(restoredFinalData);
                                setStep(2);
                            }
                            // Otherwise stay at Step 1 (Optimize)
                        }
                        if (userRes.preferred_cv_template) {
                            setTemplateId(userRes.preferred_cv_template);
                        }
                    }
                }
            } catch (err) {
                console.error("Failed to fetch wizard data:", err);
            } finally {
                if (isMounted) setIsLoading(false);
            }
        };

        fetchData();
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
                setOptimizerError('Kein CV-Match-Ergebnis gefunden. Bitte führe zuerst den CV-Match-Schritt durch.');
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
                    ...(metricsToSend && metricsToSend.length > 0 ? { station_metrics: metricsToSend } : {}),
                    cv_opt_settings: { showSummary: cvOptSettings.showSummary, summaryMode: cvOptSettings.summaryMode },
                }),
                signal: controller.signal,
            });
            clearTimeout(timeoutId);

            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data.error || data.details || 'Optimierung fehlgeschlagen');
            }

            setProposal(data.proposal);
        } catch (error: unknown) {
            if (error instanceof DOMException && error.name === 'AbortError') {
                console.error('[CV Optimize] Client timeout after 110s');
                setOptimizerError('Die Optimierung hat zu lange gedauert (>110 Sek.). Bitte versuche es erneut — die KI ist manchmal langsamer bei großen Lebensläufen.');
            } else {
                const msg = error instanceof Error ? error.message : 'Unbekannter Fehler';
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
        } else {
        }
    };

    // -- Step 2: Template Switcher --
    const handleTemplateSwitchInPreview = async (newId: string) => {
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
                <p className="text-gray-800 text-lg font-medium">Kein Lebenslauf gefunden.</p>
                <p className="text-sm text-gray-500 max-w-sm mx-auto">
                    Bitte lade deinen initialen Lebenslauf zuerst hoch und scanne ihn, bevor du ihn optimieren kannst.
                </p>
                <Link href="/dashboard/settings" className="inline-block mt-4 text-blue-600 hover:text-blue-800 font-medium underline">
                    Zu den Einstellungen
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
                    Optimize
                </div>
                <div className="w-8 h-[1px] bg-gray-300" />
                <div className={`flex items-center gap-2 text-sm font-medium ${step === 2 ? 'text-[#012e7a]' : 'text-gray-400'}`}>
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${step === 2 ? 'bg-blue-100 text-[#012e7a]' : 'bg-gray-200'}`}>2</span>
                    Preview
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
                            <div className="w-full max-w-md">
                                {/* Header */}
                                <div className="flex items-center gap-3 mb-8">
                                    <LoadingSpinner className="w-7 h-7 text-[#012e7a] shrink-0" />
                                    <div>
                                        <p className="text-sm font-semibold text-[#012e7a]">CV wird optimiert…</p>
                                        <p className="text-xs text-gray-500 mt-0.5">Das dauert etwa 15–20 Sekunden</p>
                                    </div>
                                </div>

                                {/* Step list */}
                                <div className="space-y-3">
                                    {OPT_STEPS.map((label, i) => {
                                        const isDone = i < optStep;
                                        const isActive = i === optStep;
                                        return (
                                            <motion.div
                                                key={i}
                                                initial={{ opacity: 0, x: -8 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ delay: i * 0.08 }}
                                                className={`flex items-center gap-3 py-2 px-3 rounded-lg transition-colors ${isDone ? 'bg-[#012e7a]/5' : isActive ? 'bg-[#012e7a]/10 border border-[#012e7a]/20' : 'opacity-30'
                                                    }`}
                                            >
                                                <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-xs font-bold transition-all ${isDone ? 'bg-[#012e7a] text-white' : isActive ? 'border-2 border-[#012e7a] text-[#012e7a]' : 'border border-gray-300 text-gray-400'
                                                    }`}>
                                                    {isDone ? '✓' : i + 1}
                                                </div>
                                                <span className={`text-sm ${isDone ? 'text-[#012e7a] line-through opacity-60' : isActive ? 'text-[#012e7a] font-medium' : 'text-gray-400'
                                                    }`}>
                                                    {label}
                                                </span>
                                                {isActive && (
                                                    <motion.div
                                                        className="ml-auto w-3 h-3 rounded-full bg-[#012e7a]"
                                                        animate={{ scale: [1, 1.4, 1], opacity: [1, 0.4, 1] }}
                                                        transition={{ repeat: Infinity, duration: 1.2 }}
                                                    />
                                                )}
                                            </motion.div>
                                        );
                                    })}
                                </div>

                                {/* Cancel button — appears after 15s */}
                                <OptCancelButton onCancel={() => setIsOptimizing(false)} />
                            </div>
                        ) : (
                            <>
                                {/* Error state: visible retry UI */}
                                {optimizerError && (
                                    <div className="w-full max-w-md mb-4 bg-red-50 border border-red-200 rounded-lg p-4 text-left">
                                        <p className="text-sm font-medium text-red-800 mb-1">Optimierung fehlgeschlagen</p>
                                        <p className="text-xs text-red-700 mb-3">{optimizerError}</p>
                                        <button
                                            onClick={() => { setOptimizerError(null); handleOptimizeClick(); }}
                                            className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-md transition"
                                        >
                                            Erneut versuchen
                                        </button>
                                    </div>
                                )}
                                <div className="text-center max-w-md w-full">
                                    <h3 className="text-xl font-semibold text-gray-900 mb-2">CV: Was können wir besser machen?</h3>
                                    <p className="text-gray-500 mb-4">
                                        Wir gleichen deinen <strong className="text-gray-700">Lebenslauf</strong> mit den <strong className="text-gray-700">Match-Ergebnissen</strong> ab und geben dir <strong className="text-gray-700">Vorschläge</strong>, mit welchen Formulierungen du <strong className="text-gray-700">mehr Erfolg</strong> haben wirst.
                                    </p>

                                    {/* Anzeigeoptionen Toggle Group */}
                                    <details className="w-full mb-4 text-left group">
                                        <summary className="flex items-center gap-2 cursor-pointer select-none text-sm font-medium text-gray-600 hover:text-gray-900 transition list-none">
                                            <span className="text-gray-400 group-open:rotate-90 transition-transform duration-200 inline-block">▶</span>
                                            Anzeigeoptionen
                                        </summary>
                                        <div className="mt-3 bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">

                                            {/* Summary toggle */}
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm text-gray-700">Zusammenfassung anzeigen</span>
                                                <button
                                                    onClick={() => setCvOptSettings(s => ({ ...s, showSummary: !s.showSummary }))}
                                                    className="text-gray-500 hover:text-[#012e7a] transition"
                                                    aria-label="Zusammenfassung umschalten"
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
                                                        Vollständig
                                                    </label>
                                                    <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                                                        <input
                                                            type="radio"
                                                            name="summaryMode"
                                                            checked={cvOptSettings.summaryMode === 'compact'}
                                                            onChange={() => setCvOptSettings(s => ({ ...s, summaryMode: 'compact' }))}
                                                            className="accent-[#012e7a]"
                                                        />
                                                        Kompakt (max. 2 Sätze)
                                                    </label>
                                                </div>
                                            )}

                                            {/* Certificates toggle */}
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm text-gray-700">Zertifikate anzeigen</span>
                                                <button
                                                    onClick={() => setCvOptSettings(s => ({ ...s, showCertificates: !s.showCertificates }))}
                                                    className="text-gray-500 hover:text-[#012e7a] transition"
                                                    aria-label="Zertifikate umschalten"
                                                >
                                                    {cvOptSettings.showCertificates
                                                        ? <ToggleRight className="w-7 h-7 text-[#012e7a]" />
                                                        : <ToggleLeft className="w-7 h-7 text-gray-400" />}
                                                </button>
                                            </div>

                                            {/* Languages toggle */}
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm text-gray-700">Sprachen anzeigen</span>
                                                <button
                                                    onClick={() => setCvOptSettings(s => ({ ...s, showLanguages: !s.showLanguages }))}
                                                    className="text-gray-500 hover:text-[#012e7a] transition"
                                                    aria-label="Sprachen umschalten"
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
                                        <details className="w-full mb-6 text-left group">
                                            <summary className="flex items-center gap-2 cursor-pointer select-none text-sm font-medium text-gray-600 hover:text-gray-900 transition list-none">
                                                <span className="text-gray-400 group-open:rotate-90 transition-transform duration-200 inline-block">▶</span>
                                                Hast du konkrete Zahlen?
                                            </summary>
                                            <div className="mt-3 bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
                                                <p className="text-xs text-gray-500">
                                                    CVs mit Metriken erzielen deutlich bessere ATS-Scores. Ordne Zahlen direkt deinen Stationen zu — die KI integriert sie gezielt in die passenden Bullet-Points.
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
                                                                placeholder="z.B. 30% Umsatzsteigerung, Team von 12..."
                                                                className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#012e7a]/30"
                                                                maxLength={150}
                                                            />
                                                            <p className="text-[10px] text-gray-400 mt-0.5 text-right">{station.metrics.length}/150</p>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </details>
                                    )}

                                    <button
                                        onClick={handleOptimizeClick}
                                        className="px-6 py-3 bg-[#012e7a] hover:bg-[#01246b] transition flex items-center gap-2 font-medium text-white rounded-lg shadow-sm w-full justify-center"
                                    >
                                        <Sparkles className="w-5 h-5" />
                                        Optimierung starten
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
                                originalCv={cvData}
                                proposal={proposal}
                                onSave={handleSaveDiffs}
                                onCancel={() => setProposal(null)}
                            />
                        </div>
                    </div>
                )}

                {/* ===== STEP 2: PREVIEW ===== */}
                {step === 2 && activePdfData && (
                    <div className="space-y-4">
                        {/* Template Switcher + Bearbeiten */}
                        <div className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-5 py-3">
                            <div className="text-sm font-medium text-gray-700">Template waehlen:</div>
                            <div className="flex gap-2">
                                {TEMPLATES.map((t) => (
                                    <button
                                        key={t.id}
                                        onClick={() => handleTemplateSwitchInPreview(t.id)}
                                        className={`
                                            px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all
                                            ${templateId === t.id
                                                ? 'bg-blue-600 text-white shadow-sm'
                                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}
                                        `}
                                    >
                                        {t.icon}
                                        {t.label}
                                    </button>
                                ))}
                                <button
                                    onClick={() => setIsEditing(!isEditing)}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all
                                        ${isEditing
                                            ? 'bg-green-600 text-white shadow-sm'
                                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                        }`}
                                >
                                    {isEditing ? <><CheckCheck size={15} /> Fertig</> : <><Pencil size={15} /> Bearbeiten</>}
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
                                QR-Video
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

                        <div className="flex justify-between items-center py-4 border-t border-gray-100 mt-6">
                            <button
                                onClick={() => { setStep(1); setIsEditing(false); }}
                                className="px-5 py-2 text-gray-600 hover:text-gray-900 font-medium rounded-lg hover:bg-gray-50 flex items-center transition"
                            >
                                Zurueck zum Optimizer
                            </button>

                        <div className="flex items-center gap-3">
                                <DynamicDownloadButton data={activePdfData} templateId={templateId} qrBase64={qrBase64} />
                                <button
                                    onClick={() => onGoToCoverLetter?.()}
                                    className="px-5 py-2.5 bg-white border border-[#012e7a] text-[#012e7a] hover:bg-[#012e7a]/5 font-medium rounded-lg flex items-center gap-2 transition-colors"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                                    Cover Letter
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </motion.div>

            {/* QR-Video Consent Dialog */}
            <CustomDialog
                isOpen={showQrDialog}
                onClose={() => setShowQrDialog(false)}
                title="QR-Code auf dem Lebenslauf"
                maxWidth="max-w-lg"
            >
                <div className="p-6 space-y-4">
                    <p className="text-sm text-gray-600 leading-relaxed">
                        Bevor wir deinen persönlichen QR-Code generieren, hier ein kurzer Überblick, warum sich dieser Schritt für dich lohnt:
                    </p>

                    <div className="space-y-2.5">
                        <div className="border border-gray-100 rounded-lg p-3">
                            <p className="text-sm font-semibold text-gray-900 mb-0.5">Der beste erste Eindruck</p>
                            <p className="text-xs text-gray-500 leading-relaxed">Ein kurzes Video gibt Recruitern ein authentischeres Bild von dir als reiner Text. Du zeigst, wer du bist.</p>
                        </div>

                        <div className="border border-gray-100 rounded-lg p-3">
                            <p className="text-sm font-semibold text-gray-900 mb-0.5">Deine Chancen steigen</p>
                            <p className="text-xs text-gray-500 leading-relaxed">Du stichst sofort aus der Masse heraus. Erfahrungswerte zeigen, dass persönliche Videobotschaften die Chance auf ein Vorstellungsgespräch um bis zu 40&nbsp;% erhöhen können.</p>
                        </div>

                        <div className="border border-gray-100 rounded-lg p-3">
                            <p className="text-sm font-semibold text-gray-900 mb-0.5">Volle Kontrolle (Kein Download)</p>
                            <p className="text-xs text-gray-500 leading-relaxed">Dein Video wird sicher auf EU-Servern gehostet (AWS Frankfurt). Recruiter können das Video ausschließlich ansehen (Stream) – ein Herunterladen oder Speichern ist technisch blockiert.</p>
                        </div>

                        <div className="border border-gray-100 rounded-lg p-3">
                            <p className="text-sm font-semibold text-gray-900 mb-0.5">Automatische Löschung</p>
                            <p className="text-xs text-gray-500 leading-relaxed">Du musst dich um nichts kümmern. Nach genau 14 Tagen wird dein Video restlos und unwiderruflich gelöscht.</p>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                        <button
                            onClick={() => setShowQrDialog(false)}
                            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-50 transition"
                        >
                            Abbrechen
                        </button>
                        <button
                            onClick={generateQrCode}
                            className="px-5 py-2.5 bg-[#012e7a] hover:bg-[#012e7a]/90 text-white text-sm font-medium rounded-lg transition flex items-center gap-2"
                        >
                            <Video size={15} />
                            Einverstanden
                        </button>
                    </div>
                </div>
            </CustomDialog>
        </div>
    );
}
