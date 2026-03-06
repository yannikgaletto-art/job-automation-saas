"use client";

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, PlusCircle } from 'lucide-react';
import { JobQueueTable } from '../components/job-queue-table';
import { Job } from '../components/job-row';
import { Button } from '@/components/motion/button';
import { cn } from '@/lib/utils';
import { AddJobDialog } from '@/components/dashboard/add-job-dialog';
import { CustomDialog } from '@/components/ui/custom-dialog';
import { CVComparison } from '@/components/cv/cv-comparison';
import type { CVOptimizationResult } from '@/lib/services/cv-optimizer';
import { showSafeToast } from '@/lib/utils/toast';
import { ApplicationHistory } from '@/app/dashboard/components/application-history';

// ─── Toggle Section (Notion-style accordion) ───────────────────────────
function ToggleSection({ title, count, defaultOpen = false, children }: {
    title: string;
    count?: number;
    defaultOpen?: boolean;
    children: React.ReactNode;
}) {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    return (
        <div className="bg-white border border-[#E7E7E5] rounded-xl overflow-hidden shadow-sm">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center gap-2.5 px-5 py-3 hover:bg-[#FAFAF9] transition-colors text-left cursor-pointer"
            >
                <motion.div
                    animate={{ rotate: isOpen ? 90 : 0 }}
                    transition={{ duration: 0.15 }}
                    className="shrink-0"
                >
                    <ChevronRight className="w-3.5 h-3.5 text-[#A8A29E]" />
                </motion.div>
                <span className="text-sm font-medium text-[#37352F]">{title}</span>
                {count !== undefined && (
                    <span className="text-sm text-[#73726E]">({count})</span>
                )}
            </button>
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <div className="border-t border-[#E7E7E5]">
                            {children}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

export default function JobQueuePage() {
    const [jobs, setJobs] = useState<Job[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isAddJobOpen, setIsAddJobOpen] = useState(false);

    // Optimization State
    const [showOptimization, setShowOptimization] = useState(false);
    const [optimizationResult, setOptimizationResult] = useState<CVOptimizationResult | null>(null);
    const [isOptimizing, setIsOptimizing] = useState(false);
    const [currentJobId, setCurrentJobId] = useState<string | null>(null);

    // ✅ Canonical UI Status mapping (SICHERHEITSARCHITEKTUR.md Section 9)
    const mapDbStatusToUi = (dbStatus: string): Job['status'] => {
        switch (dbStatus.toLowerCase()) {
            case 'pending': return 'NEW';
            case 'processing': return 'JOB_REVIEWED';
            case 'steckbrief_confirmed': return 'JOB_REVIEWED';
            case 'cv_matched':       // ← von Inngest Pipeline gesetzt
            case 'cv_match_done': return 'CV_CHECKED';  // ← beide → CV_CHECKED
            case 'cv_optimized': return 'CV_OPTIMIZED';
            case 'cover_letter_done': return 'CL_GENERATED';
            case 'ready_for_review': return 'CL_GENERATED';
            case 'ready_to_apply': return 'READY';
            default: return 'NEW';
        }
    };

    // ✅ Canonical Stepper % mapping (SICHERHEITSARCHITEKTUR.md Section 9)
    const mapDbStatusToStep = (dbStatus: string): number => {
        switch (dbStatus.toLowerCase()) {
            case 'pending': return 0;
            case 'processing': return 10;
            case 'steckbrief_confirmed': return 30;
            case 'cv_matched':       // ← von Inngest Pipeline gesetzt
            case 'cv_match_done': return 30;
            case 'cv_optimized': return 60;
            case 'cover_letter_done': return 100;
            case 'ready_for_review': return 100;
            case 'ready_to_apply': return 100;
            default: return 0;
        }
    };

    const fetchJobs = async () => {
        try {
            const res = await fetch('/api/jobs/list', { cache: 'no-store' });
            if (!res.ok) return [];
            const data = await res.json();
            if (data.success && data.jobs) {
                const dbJobs: Job[] = data.jobs.map((j: Record<string, unknown>) => ({
                    id: j.id as string,
                    company: (j.company_name as string) || 'Unknown',
                    jobTitle: (j.job_title as string) || 'Unknown Position',
                    location: (j.location as string) || null,
                    summary: (j.summary as string) || null,
                    responsibilities: (j.responsibilities as string[]) || null,
                    qualifications: (j.requirements as string[]) || null,
                    benefits: (j.benefits as string[]) || null,
                    seniority: (j.seniority as string) || 'unknown',
                    buzzwords: (j.buzzwords as string[]) || null,
                    matchScore: (j.match_score as number) || ((j.status !== 'pending' || (j.responsibilities && (j.responsibilities as string[]).length > 0)) ? 10 : 0),
                    workflowStep: mapDbStatusToStep(j.status as string),
                    dbStatus: (j.status as string) || 'pending', // Raw DB status for getNextAction
                    status: mapDbStatusToUi(j.status as string),
                    // ✅ Pass through metadata so cv_match cache is available in CVMatchTab
                    metadata: (j.metadata as Record<string, unknown>) || null,
                    source_url: (j.source_url as string) || null,
                }));
                setJobs(dbJobs);
                return dbJobs;
            }
            return [];
        } catch (err) {
            console.warn('⚠️ Could not fetch jobs:', err);
            return [];
        }
    };

    useEffect(() => {
        fetchJobs().finally(() => setIsLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleReanalyze = async (jobId: string) => {
        showSafeToast('Analyse läuft im Hintergrund...', `reanalyze_start:${jobId}`, 'info');
        try {
            const res = await fetch('/api/jobs/extract', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jobId }),
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.error);

            // Poll for results (Inngest processes in background)
            let attempts = 0;
            const maxAttempts = 20; // 20 × 3s = 60s max
            const pollInterval = setInterval(async () => {
                attempts++;
                try {
                    const freshJobs = await fetchJobs();
                    const updatedJob = freshJobs.find(j => j.id === jobId);
                    if (updatedJob?.summary) {
                        clearInterval(pollInterval);
                        showSafeToast('Steckbrief erfolgreich extrahiert ✓', `extract_success:${jobId}`);
                    } else if (attempts >= maxAttempts) {
                        clearInterval(pollInterval);
                        showSafeToast('Analyse dauert länger als erwartet — bitte Seite neu laden', `extract_timeout:${jobId}`, 'info');
                    }
                } catch {
                    clearInterval(pollInterval);
                }
            }, 3000);

        } catch (err) {
            showSafeToast('Extraktion fehlgeschlagen', `extract_error:${jobId}`, 'error', String(err));
        }
    };

    const handleConfirm = async (jobId: string) => {
        try {
            await fetch('/api/jobs/confirm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jobId }),
            });
            setJobs(prev => prev.map(j =>
                j.id === jobId ? { ...j, status: 'JOB_REVIEWED', workflowStep: 10 } : j
            ));
            showSafeToast('Steckbrief bestätigt → CV Match freigeschaltet', `confirm_success:${jobId}`);
        } catch {
            showSafeToast('Bestätigung fehlgeschlagen', `confirm_error:${jobId}`, 'error');
        }
    };

    const handleDelete = async (jobId: string) => {
        showSafeToast('Lösche Bewerbung...', `delete_start:${jobId}`, 'info');
        try {
            const res = await fetch('/api/jobs/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jobId }),
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.error);
            setJobs(prev => prev.filter(j => j.id !== jobId));
            showSafeToast('Bewerbung gelöscht', `delete_success:${jobId}`);
        } catch (err) {
            showSafeToast('Löschen fehlgeschlagen', `delete_error:${jobId}`, 'error', String(err));
        }
    };

    const handleOptimizeCV = async (jobId: string) => {
        setIsOptimizing(true);
        setCurrentJobId(jobId);
        try {
            const response = await fetch('/api/cv/optimize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jobId })
            });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Optimization failed');
            }
            const result = await response.json();
            setOptimizationResult(result);
            setShowOptimization(true);
            setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: 'CV_OPTIMIZED', workflowStep: 60 } : j));
            showSafeToast('CV optimiert', `cv_optimized:${jobId}`);
        } catch (error) {
            showSafeToast('Optimierung fehlgeschlagen', `cv_optimize_error:${jobId}`, 'error', error instanceof Error ? error.message : 'Bitte erneut versuchen');
        } finally {
            setIsOptimizing(false);
        }
    };

    return (
        <div className="space-y-8 max-w-7xl mx-auto">
            <AddJobDialog
                isOpen={isAddJobOpen}
                onClose={() => setIsAddJobOpen(false)}
                onJobAdded={() => {
                    fetchJobs();
                    showSafeToast('Job hinzugefügt', 'job_added:new');
                }}
            />

            {/* Header */}
            <div>
                <div>
                    <h1 className="text-2xl font-semibold text-[#37352F]">Job Queue</h1>
                    <p className="text-sm text-[#73726E] mt-1">Verwalte und tracke deine aktiven Bewerbungen</p>
                </div>
                <div className="mt-3 flex items-center gap-3">
                    <Button
                        variant="primary"
                        onClick={() => setIsAddJobOpen(true)}
                        className="rounded-xl px-5 py-2.5 font-medium"
                        disabled={jobs.length >= 5}
                    >
                        <PlusCircle className="w-4 h-4 mr-2" />
                        Add Job
                    </Button>
                    {jobs.length >= 5 && (
                        <span className="text-xs text-[#73726E]">
                            Max. 5 aktive Jobs erreicht
                        </span>
                    )}
                </div>
            </div>

            {/* Toggle 1: Aktuelle Jobs */}
            <ToggleSection
                title="Aktuelle Jobs"
                count={jobs.length}
                defaultOpen={true}
            >
                <div className="space-y-2">
                    {isOptimizing && <span className="text-sm text-blue-600 animate-pulse px-5">Optimizing CV...</span>}
                    <JobQueueTable
                        jobs={jobs}
                        onOptimize={handleOptimizeCV}
                        onReanalyze={handleReanalyze}
                        onConfirm={handleConfirm}
                        onDelete={handleDelete}
                        loading={isLoading}
                        optimizingJobId={isOptimizing ? currentJobId : null}
                    />
                </div>
            </ToggleSection>

            {/* Toggle 2: Application History */}
            <ToggleSection
                title="Application History"
                defaultOpen={false}
            >
                <ApplicationHistory />
            </ToggleSection>

            {/* Optimization Modal */}
            <CustomDialog
                isOpen={showOptimization}
                onClose={() => setShowOptimization(false)}
                title="Review Optimized CV"
                maxWidth="max-w-6xl"
                className="h-[90vh] overflow-hidden flex flex-col"
            >
                <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-[#FAFAF9]">
                    {optimizationResult && (
                        <CVComparison
                            optimizationResult={optimizationResult}
                            onAcceptAll={async () => { setShowOptimization(false); showSafeToast('\u00c4nderungen übernommen', `cv_accepted:${currentJobId}`); }}
                            onRejectAll={() => setShowOptimization(false)}
                            onDownload={async () => {
                                try {
                                    const res = await fetch(`/api/cv/download?jobId=${currentJobId}&type=cv`);
                                    if (!res.ok) throw new Error('PDF-Generierung fehlgeschlagen');
                                    const blob = await res.blob();
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement('a');
                                    a.href = url;
                                    const company = jobs.find(j => j.id === currentJobId)?.company?.replace(/[^a-z0-9]/gi, '_') || 'Pathly';
                                    a.download = `CV_${company}.pdf`;
                                    document.body.appendChild(a);
                                    a.click();
                                    document.body.removeChild(a);
                                    URL.revokeObjectURL(url);
                                } catch {
                                    showSafeToast('CV-Download fehlgeschlagen — bitte erneut versuchen', `cv_download_error:${currentJobId}`, 'error');
                                }
                            }}
                        />
                    )}
                </div>
            </CustomDialog>
        </div>
    );
}
