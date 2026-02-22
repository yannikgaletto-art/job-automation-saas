"use client"

import { useState, useEffect, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { TemplateSelector } from "./TemplateSelector"
import { DiffReview } from "./DiffReview"
import { CvStructuredData, CvOptimizationProposal, UserDecisions } from "@/types/cv"
import { saveCvDecisions } from "@/app/actions/save-cv-decisions"
import { createClient } from '@/lib/supabase/client'
import { toast } from "sonner"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { Check, Settings, Sparkles, FileText, Layout } from "lucide-react"
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
    const [step, setStep] = useState<1 | 2 | 3>(1);

    const [isLoading, setIsLoading] = useState(true);
    const [isOptimizing, setIsOptimizing] = useState(false);
    const [optProgressText, setOptProgressText] = useState("Lade CV-Daten...");

    useEffect(() => {
        if (isOptimizing) {
            const messages = [
                "Lade CV-Daten...",
                "Analysiere Schwachstellen...",
                "Formuliere Bullet-Points neu...",
                "Optimiere für ATS-Systeme...",
                "Integriere Job-Keywords...",
                "Prüfe Lesbarkeit und Struktur..."
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
    const [templateId, setTemplateId] = useState<string>("modern");

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

                            // Because cvAdmin depends on cv_structured_data, wait for userRes assignment below
                        }
                    }
                    if (userRes) {
                        if (userRes.cv_structured_data) {
                            setCvData(userRes.cv_structured_data);

                            // If we have restored decisions and proposal, we can skip straight to Step 3
                            if (jobRes?.cv_optimization_proposal && jobRes?.cv_optimization_user_decisions) {
                                // Since DiffReview isn't rendered, we manually apply the restored decisions to set finalCv
                                const restoredFinalData = applyOptimizations(userRes.cv_structured_data, jobRes.cv_optimization_user_decisions);
                                setFinalCv(restoredFinalData);
                                setStep(3);
                            } else if (jobRes?.metadata?.cv_match) {
                                // If CV match exists but optimization doesn't, go to Step 2
                                setStep(2);
                            }
                        }
                        if (userRes.preferred_cv_template) {
                            setTemplateId(userRes.preferred_cv_template);
                        }
                    }
                }
            } catch (err) {
                console.error("❌ Failed to fetch wizard data:", err);
                toast.error("Ein Fehler ist beim Laden aufgetreten.");
            } finally {
                if (isMounted) setIsLoading(false);
            }
        };

        fetchData();
        return () => { isMounted = false; };
    }, [jobId]);

    // -- Step 1 Actions --
    const handleTemplateSelected = (id: string) => {
        setTemplateId(id);
        toast.success("Template ausgewählt");
        setStep(2);
    };

    // -- Step 2 Actions --
    const runOptimizer = async () => {
        if (!cvData) {
            toast.error("Keine CV-Daten gefunden. Bitte lade zuerst deinen Lebenslauf in den Einstellungen hoch.");
            return;
        }

        setIsOptimizing(true);
        toast.info("CV wird optimiert... Dies dauert meist ~15s");
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
                toast.error("CV-Match-Analyse nicht gefunden. Bitte zuerst den 'CV Match' Tab ausführen.");
                setIsOptimizing(false);
                return;
            }

            setJobData(freshJob);

            const res = await fetch('/api/cv/optimize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    cv_structured_data: cvData,
                    cv_match_result: cvMatch,
                    template_id: templateId,
                    job_id: jobId,
                    user_id: userId,
                }),
            });

            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data.error || data.details || 'Optimierung fehlgeschlagen');
            }

            setProposal(data.proposal);
            toast.success("Optimierung abgeschlossen – bitte jetzt prüfen!");
        } catch (error: any) {
            console.error("❌ Optimizer error:", error);
            toast.error("Optimizer fehlgeschlagen", { description: error.message });
        } finally {
            setIsOptimizing(false);
        }
    };

    const handleSaveDiffs = async (finalData: CvStructuredData, accepted: any[]) => {
        setFinalCv(finalData);

        toast.info("Speichere Entscheidungen...");
        const choices: Record<string, 'accepted'> = {};
        accepted.forEach(c => { choices[c.id] = 'accepted'; });
        const decisions: UserDecisions = { choices, appliedChanges: accepted };
        setUserDecisions(decisions);

        if (!proposal) {
            toast.error("Vorschlag fehlt.");
            return;
        }

        const res = await saveCvDecisions(jobId, decisions, proposal);
        if (res.success) {
            toast.success("Einstellungen gespeichert");
            setStep(3);
        } else {
            toast.error("Fehler", { description: res.error });
        }
    };

    // -- Step 3: Template Switcher --
    const handleTemplateSwitchInStep3 = async (newId: string) => {
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

    // Compute clean PDF data from finalCv + decisions
    const pdfData = useMemo(() => {
        if (!finalCv) return null;
        // finalCv already has accepted changes applied by DiffReview
        return stripTodoItems(finalCv);
    }, [finalCv]);

    if (isLoading) {
        return <div className="p-10 flex justify-center"><LoadingSpinner className="w-8 h-8 text-blue-600" /></div>;
    }

    if (!cvData) {
        return (
            <div className="p-8 text-center bg-gray-50 border border-gray-200 rounded-lg space-y-4">
                <p className="text-gray-800 text-lg font-medium">⚠️ Kein Lebenslauf gefunden.</p>
                <p className="text-sm text-gray-500 max-w-sm mx-auto">
                    Bitte lade deinen initialen Lebenslauf zuerst hoch und scanne ihn, bevor du ihn optimieren kannst.
                </p>
                <Link href="/dashboard/settings" className="inline-block mt-4 text-blue-600 hover:text-blue-800 font-medium underline">
                    → Zu den Einstellungen
                </Link>
            </div>
        );
    }

    const TEMPLATES = [
        { id: 'modern', label: 'Modern', icon: <Layout className="w-4 h-4" /> },
        { id: 'classic', label: 'Classic', icon: <FileText className="w-4 h-4" /> },
        { id: 'tech', label: 'Tech', icon: <Settings className="w-4 h-4" /> },
    ];

    return (
        <div className="w-full flex flex-col space-y-6">
            {/* Step Indicator */}
            <div className="flex gap-4 items-center mb-4 px-4 py-3 bg-gray-50 border border-gray-100 rounded-lg">
                <div className={`flex items-center gap-2 text-sm font-medium ${step >= 1 ? 'text-blue-700' : 'text-gray-400'}`}>
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${step >= 1 ? 'bg-blue-100' : 'bg-gray-200'}`}>1</span>
                    Layout
                </div>
                <div className="w-8 h-[1px] bg-gray-300" />
                <div className={`flex items-center gap-2 text-sm font-medium ${step >= 2 ? 'text-blue-700' : 'text-gray-400'}`}>
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${step >= 2 ? 'bg-blue-100' : 'bg-gray-200'}`}>2</span>
                    Optimize
                </div>
                <div className="w-8 h-[1px] bg-gray-300" />
                <div className={`flex items-center gap-2 text-sm font-medium ${step === 3 ? 'text-blue-700' : 'text-gray-400'}`}>
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${step === 3 ? 'bg-blue-100' : 'bg-gray-200'}`}>3</span>
                    Preview & Download
                </div>
            </div>

            {/* Active Step Content */}
            <motion.div
                key={step}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
            >
                {step === 1 && userId && (
                    <div className="bg-white border rounded-xl overflow-hidden pb-4">
                        <TemplateSelector
                            userId={userId}
                            initialTemplateId={templateId}
                            onSelected={handleTemplateSelected}
                        />
                    </div>
                )}

                {step === 2 && !proposal && (
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
                                <div className="text-center max-w-md">
                                    <h3 className="text-xl font-semibold text-gray-900 mb-2">Ready to Optimize</h3>
                                    <p className="text-gray-500 mb-6">
                                        The AI will now cross-reference your CV with the job match results to rewrite bullet points and maximize your ATS score without hallucinating.
                                    </p>
                                    <button
                                        onClick={runOptimizer}
                                        className="px-6 py-3 bg-blue-600 hover:bg-blue-700 transition flex items-center gap-2 font-medium text-white rounded-lg shadow-sm w-full justify-center"
                                    >
                                        <Sparkles className="w-5 h-5" />
                                        Run Optimizer
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                )}

                {step === 2 && proposal && (
                    <DiffReview
                        originalCv={cvData}
                        proposal={proposal}
                        onSave={handleSaveDiffs}
                        onCancel={() => setProposal(null)}
                    />
                )}

                {step === 3 && pdfData && (
                    <div className="space-y-4">
                        {/* Template Switcher */}
                        <div className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-5 py-3">
                            <div className="text-sm font-medium text-gray-700">Template wählen:</div>
                            <div className="flex gap-2">
                                {TEMPLATES.map((t) => (
                                    <button
                                        key={t.id}
                                        onClick={() => handleTemplateSwitchInStep3(t.id)}
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
                            </div>
                        </div>

                        {/* PDF Preview */}
                        <DynamicPdfViewer data={pdfData} templateId={templateId} />

                        <div className="flex justify-between items-center py-4 border-t border-gray-100 mt-6">
                            <button
                                onClick={() => setStep(2)}
                                className="px-5 py-2 text-gray-600 hover:text-gray-900 font-medium rounded-lg hover:bg-gray-50 flex items-center transition"
                            >
                                ← Zurück zum Optimizer
                            </button>

                            <DynamicDownloadButton data={pdfData} templateId={templateId} />
                        </div>
                    </div>
                )}
            </motion.div>
        </div>
    );
}
