"use client"

import { useState, useEffect, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { TemplateSelector } from "./TemplateSelector"
import { DiffReview } from "./DiffReview"
import { InlineCvEditor } from "./InlineCvEditor"
import { CvStructuredData, CvOptimizationProposal, UserDecisions } from "@/types/cv"
import { CVOptSettings, DEFAULT_CV_OPT_SETTINGS, StationMetrics } from "@/types/cv-opt-settings"
import { applyCVOptSettings } from "@/lib/utils/cv-settings-filter"
import { saveCvDecisions } from "@/app/actions/save-cv-decisions"
import { createClient } from '@/lib/supabase/client'
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { Check, Settings, Sparkles, FileText, Layout, Pencil, CheckCheck, ToggleLeft, ToggleRight } from "lucide-react"
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { applyOptimizations, stripTodoItems } from '@/lib/utils/cv-merger';

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
}

export function OptimizerWizard({ jobId, liveMatchResult }: OptimizerWizardProps) {
    const [step, setStep] = useState<1 | 2>(1);

    const [isLoading, setIsLoading] = useState(true);
    const [isOptimizing, setIsOptimizing] = useState(false);
    const [optProgressText, setOptProgressText] = useState("Lade CV-Daten...");

    // Inline editor state
    const [isEditing, setIsEditing] = useState(false);
    const [editablePdfData, setEditablePdfData] = useState<CvStructuredData | null>(null);

    // Numbers Check Flow (Batch B1 → Patch v2: station-based)
    const [showMetricsPrompt, setShowMetricsPrompt] = useState(false);
    const [stationMetrics, setStationMetrics] = useState<StationMetrics[]>([]);
    const [metricsInput, setMetricsInput] = useState(''); // freetext fallback

    useEffect(() => {
        if (isOptimizing) {
            const messages = [
                "Lade CV-Daten...",
                "Analysiere Schwachstellen...",
                "Formuliere Bullet-Points neu...",
                "Optimiere fuer ATS-Systeme...",
                "Integriere Job-Keywords...",
                "Pruefe Lesbarkeit und Struktur...",
            ];
            let index = 1;
            const interval = setInterval(() => {
                setOptProgressText(messages[index]);
                index = (index + 1) % messages.length;
            }, 3000);
            return () => clearInterval(interval);
        } else {
            setOptProgressText("Lade CV-Daten...");
        }
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
                            setCvData(userRes.cv_structured_data);

                            // If we have restored decisions+proposal -> skip to Step 2 (Preview)
                            if (jobRes?.cv_optimization_proposal && jobRes?.cv_optimization_user_decisions) {
                                const restoredFinalData = applyOptimizations(userRes.cv_structured_data, jobRes.cv_optimization_user_decisions);
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

    // -- Step 1 Actions --

    /** Check if CV text contains real performance metrics (NOT dates/years) */
    const hasPerformanceMetrics = (cv: CvStructuredData): boolean => {
        const allText = [
            cv.personalInfo?.summary || '',
            ...cv.experience.flatMap(e => e.description.map(d => d.text)),
        ].join(' ');
        return /(\d+\s*%|\d+\+\s*(Mitarbeiter|Stakeholder|Kunden|Teams?|Projekte?)|[\d]+\s*(Mio|k€|€))/i.test(allText);
    };

    /** Intercept optimizer start to check for metrics first */
    const handleOptimizeClick = () => {
        if (!cvData) {
            return;
        }

        const alreadyShown = typeof window !== 'undefined' && localStorage.getItem('cv_metrics_prompt_shown');
        if (!hasPerformanceMetrics(cvData) && !alreadyShown) {
            // Initialize station metrics from CV experience (max 5, most recent first)
            if (cvData.experience && cvData.experience.length > 0) {
                const stations = cvData.experience.slice(0, 5).map(exp => ({
                    company: exp.company || 'Unbekannt',
                    role: exp.role || '',
                    metrics: '',
                }));
                setStationMetrics(stations);
            }
            setShowMetricsPrompt(true);
            return;
        }

        runOptimizer();
    };

    /** Skip metrics prompt and proceed */
    const handleSkipMetrics = () => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('cv_metrics_prompt_shown', 'true');
        }
        setShowMetricsPrompt(false);
        runOptimizer();
    };

    /** Submit metrics and proceed */
    const handleSubmitMetrics = () => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('cv_metrics_prompt_shown', 'true');
        }
        setShowMetricsPrompt(false);

        // Station-based path
        const filledStations = stationMetrics.filter(s => s.metrics.trim().length > 0);
        if (filledStations.length > 0) {
            runOptimizer(filledStations);
        } else if (metricsInput.trim()) {
            // Freetext fallback
            runOptimizer([{ company: 'Allgemein', role: '', metrics: metricsInput.trim() }]);
        } else {
            runOptimizer();
        }
    };

    const runOptimizer = async (metricsOverride?: StationMetrics[]) => {
        if (!cvData) {
            return;
        }

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
                return;
            }

            setJobData(freshJob);

            const metricsToSend = metricsOverride?.filter(s => s.metrics.trim().length > 0);

            // 60s client-side timeout (Batch 2.3 — Stale-Recovery)
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 60_000);

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
                    cv_opt_settings: { summaryMode: cvOptSettings.summaryMode },
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
                console.error("Optimizer timeout (60s)");
            } else {
                const msg = error instanceof Error ? error.message : 'Unbekannter Fehler';
                console.error("Optimizer error:", msg);
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
        return <div className="p-10 flex justify-center"><LoadingSpinner className="w-8 h-8 text-blue-600" /></div>;
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
        { id: 'classic', label: 'Classic', icon: <FileText className="w-4 h-4" /> },
        { id: 'tech', label: 'Tech', icon: <Settings className="w-4 h-4" /> },
    ];

    return (
        <div className="w-full flex flex-col space-y-6">
            {/* Step Indicator — 2 steps only */}
            <div className="flex gap-4 items-center mb-4 px-4 py-3 bg-gray-50 border border-gray-100 rounded-lg">
                <div className={`flex items-center gap-2 text-sm font-medium ${step >= 1 ? 'text-blue-700' : 'text-gray-400'}`}>
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${step >= 1 ? 'bg-blue-100' : 'bg-gray-200'}`}>1</span>
                    Optimize
                </div>
                <div className="w-8 h-[1px] bg-gray-300" />
                <div className={`flex items-center gap-2 text-sm font-medium ${step === 2 ? 'text-blue-700' : 'text-gray-400'}`}>
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${step === 2 ? 'bg-blue-100' : 'bg-gray-200'}`}>2</span>
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
                            <>
                                <LoadingSpinner className="w-12 h-12 text-blue-600 mb-6" />
                                <div className="text-center max-w-md w-full">
                                    <h3 className="text-lg font-medium text-gray-900 mb-6">
                                        <AnimatePresence mode="popLayout">
                                            <motion.span
                                                key={optProgressText}
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: -10 }}
                                                transition={{ duration: 0.4 }}
                                                className="inline-block"
                                            >
                                                {optProgressText}
                                            </motion.span>
                                        </AnimatePresence>
                                    </h3>
                                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mx-auto mt-2">
                                        <motion.div
                                            className="h-full bg-blue-600"
                                            initial={{ width: '0%' }}
                                            animate={{ width: '85%' }}
                                            transition={{ duration: 15, ease: "easeOut" }}
                                        />
                                    </div>
                                    <p className="text-xs text-gray-500 mt-4">Bitte warten, dies dauert etwa 15-20 Sekunden...</p>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center">
                                    <Settings className="w-8 h-8" />
                                </div>
                                <div className="text-center max-w-md w-full">
                                    <h3 className="text-xl font-semibold text-gray-900 mb-2">Bereit zur Optimierung</h3>
                                    <p className="text-gray-500 mb-4">
                                        Die KI gleicht deinen Lebenslauf mit den Match-Ergebnissen ab und formuliert Bullet Points neu, um deinen ATS-Score zu maximieren.
                                    </p>

                                    {/* CVOptSettings Toggle Group */}
                                    <div className="w-full bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6 text-left space-y-3">
                                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Anzeigeoptionen</p>

                                        {/* Summary toggle — disabled when Clean template is selected */}
                                        {(() => {
                                            const isSummaryDisabled = templateId === 'valley';
                                            return (
                                                <>
                                                    <div className={`flex items-center justify-between ${isSummaryDisabled ? 'opacity-40 cursor-not-allowed' : ''}`}>
                                                        <span className="text-sm text-gray-700">Zusammenfassung anzeigen</span>
                                                        <button
                                                            onClick={() => !isSummaryDisabled && setCvOptSettings(s => ({ ...s, showSummary: !s.showSummary }))}
                                                            className={`transition ${isSummaryDisabled ? 'cursor-not-allowed' : 'text-gray-500 hover:text-blue-600'}`}
                                                            aria-label="Zusammenfassung umschalten"
                                                            disabled={isSummaryDisabled}
                                                            title={isSummaryDisabled ? 'Im Clean-Template nicht verfuegbar — dieses Format verzichtet bewusst auf einen Summary-Block.' : undefined}
                                                        >
                                                            {cvOptSettings.showSummary && !isSummaryDisabled
                                                                ? <ToggleRight className="w-7 h-7 text-blue-600" />
                                                                : <ToggleLeft className="w-7 h-7 text-gray-400" />}
                                                        </button>
                                                    </div>
                                                    {cvOptSettings.showSummary && !isSummaryDisabled && (
                                                        <div className="ml-4 flex gap-3">
                                                            <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                                                                <input
                                                                    type="radio"
                                                                    name="summaryMode"
                                                                    checked={cvOptSettings.summaryMode === 'full'}
                                                                    onChange={() => setCvOptSettings(s => ({ ...s, summaryMode: 'full' }))}
                                                                    className="accent-blue-600"
                                                                />
                                                                Vollstaendig
                                                            </label>
                                                            <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                                                                <input
                                                                    type="radio"
                                                                    name="summaryMode"
                                                                    checked={cvOptSettings.summaryMode === 'compact'}
                                                                    onChange={() => setCvOptSettings(s => ({ ...s, summaryMode: 'compact' }))}
                                                                    className="accent-blue-600"
                                                                />
                                                                Kompakt (max. 2 Saetze)
                                                            </label>
                                                        </div>
                                                    )}
                                                </>
                                            );
                                        })()}

                                        {/* Certificates toggle */}
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm text-gray-700">Zertifikate anzeigen</span>
                                            <button
                                                onClick={() => setCvOptSettings(s => ({ ...s, showCertificates: !s.showCertificates }))}
                                                className="text-gray-500 hover:text-blue-600 transition"
                                                aria-label="Zertifikate umschalten"
                                            >
                                                {cvOptSettings.showCertificates
                                                    ? <ToggleRight className="w-7 h-7 text-blue-600" />
                                                    : <ToggleLeft className="w-7 h-7 text-gray-400" />}
                                            </button>
                                        </div>

                                        {/* Languages toggle */}
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm text-gray-700">Sprachen anzeigen</span>
                                            <button
                                                onClick={() => setCvOptSettings(s => ({ ...s, showLanguages: !s.showLanguages }))}
                                                className="text-gray-500 hover:text-blue-600 transition"
                                                aria-label="Sprachen umschalten"
                                            >
                                                {cvOptSettings.showLanguages
                                                    ? <ToggleRight className="w-7 h-7 text-blue-600" />
                                                    : <ToggleLeft className="w-7 h-7 text-gray-400" />}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Numbers Check Flow — station-based metrics prompt */}
                                    {showMetricsPrompt && (
                                        <div className="w-full bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4 text-left">
                                            <p className="text-sm font-medium text-amber-900 mb-1">Hast du konkrete Zahlen?</p>
                                            <p className="text-xs text-amber-700 mb-3">
                                                CVs mit Metriken erzielen deutlich bessere ATS-Scores. Ordne Zahlen direkt deinen Stationen zu.
                                            </p>

                                            {stationMetrics.length > 0 ? (
                                                <div className="space-y-3 mb-3">
                                                    {stationMetrics.map((station, idx) => (
                                                        <div key={idx} className="bg-white border border-amber-200 rounded-md p-3">
                                                            <div className="flex items-center gap-2 mb-1.5">
                                                                <span className="text-xs">🏢</span>
                                                                <span className="text-sm font-medium text-gray-900">{station.company}</span>
                                                            </div>
                                                            {station.role && (
                                                                <p className="text-xs text-gray-500 mb-2 ml-5">{station.role}</p>
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
                                                                className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
                                                                maxLength={150}
                                                            />
                                                            <p className="text-[10px] text-gray-400 mt-0.5 text-right">{station.metrics.length}/150</p>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                /* Freetext fallback when no experience data */
                                                <>
                                                    <textarea
                                                        value={metricsInput}
                                                        onChange={(e) => setMetricsInput(e.target.value.slice(0, 300))}
                                                        placeholder="z.B. 5 Jahre Erfahrung, 30% Umsatzsteigerung, Team von 12..."
                                                        className="w-full border border-amber-300 rounded-md p-2.5 text-sm text-gray-800 resize-none h-20 focus:outline-none focus:ring-2 focus:ring-amber-400 mb-1"
                                                        maxLength={300}
                                                    />
                                                    <p className="text-[10px] text-amber-600 text-right mb-2">{metricsInput.length}/300</p>
                                                </>
                                            )}

                                            <div className="flex gap-2">
                                                <button
                                                    onClick={handleSubmitMetrics}
                                                    disabled={stationMetrics.length > 0
                                                        ? !stationMetrics.some(s => s.metrics.trim())
                                                        : !metricsInput.trim()}
                                                    className="flex-1 px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition disabled:opacity-50"
                                                >
                                                    Zahlen hinzufuegen
                                                </button>
                                                <button
                                                    onClick={handleSkipMetrics}
                                                    className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition"
                                                >
                                                    Ueberspringen
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    <button
                                        onClick={handleOptimizeClick}
                                        className="px-6 py-3 bg-blue-600 hover:bg-blue-700 transition flex items-center gap-2 font-medium text-white rounded-lg shadow-sm w-full justify-center"
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
                    <DiffReview
                        originalCv={cvData}
                        proposal={proposal}
                        onSave={handleSaveDiffs}
                        onCancel={() => setProposal(null)}
                    />
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
                        </div>

                        {/* PDF Preview + optional editor panel */}
                        {isEditing ? (
                            <div className="grid grid-cols-[1fr_480px] gap-4 items-start">
                                <DynamicPdfViewer data={activePdfData} templateId={templateId} />
                                <div className="sticky top-4 bg-white rounded-xl border border-slate-200 p-4 h-[800px]">
                                    <InlineCvEditor
                                        data={activePdfData}
                                        onChange={setEditablePdfData}
                                        onClose={() => setIsEditing(false)}
                                    />
                                </div>
                            </div>
                        ) : (
                            <DynamicPdfViewer data={activePdfData} templateId={templateId} />
                        )}

                        <div className="flex justify-between items-center py-4 border-t border-gray-100 mt-6">
                            <button
                                onClick={() => { setStep(1); setIsEditing(false); }}
                                className="px-5 py-2 text-gray-600 hover:text-gray-900 font-medium rounded-lg hover:bg-gray-50 flex items-center transition"
                            >
                                Zurueck zum Optimizer
                            </button>

                            <DynamicDownloadButton data={activePdfData} templateId={templateId} />
                        </div>
                    </div>
                )}
            </motion.div>
        </div>
    );
}
