"use client";

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, PlusCircle, Puzzle } from 'lucide-react';
import { JobQueueTable } from '../components/job-queue-table';
import { Job } from '../components/job-row';
import { Button } from '@/components/motion/button';
import { cn } from '@/lib/utils';
import { AddJobDialog } from '@/components/dashboard/add-job-dialog';
import { CustomDialog } from '@/components/ui/custom-dialog';
import { CVComparison } from '@/components/cv/cv-comparison';
import type { CVOptimizationResult } from '@/lib/services/cv-optimizer';
import { useNotification } from '@/hooks/use-notification';
import { ApplicationHistory } from '@/app/[locale]/dashboard/components/application-history';
import { GuidedTourOverlay } from '@/components/dashboard/guided-tour-overlay';
import { useDashboardTour, type TourStep } from '../hooks/useDashboardTour';
import { useCreditExhausted } from '../hooks/credit-exhausted-context';

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
    const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

    // ─── State-Lifted from JobQueueTable (for tour auto-expand) ──────
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const handleToggle = useCallback((jobId: string) => {
        setExpandedId((prev) => (prev === jobId ? null : jobId));
    }, []);

    // ─── Tour Setup (two-branch: empty vs. full) ──────────────────────
    const [tourReady, setTourReady] = useState(false);

    const EMPTY_STEPS: TourStep[] = [
        {
            targetSelector: '[data-tour="job-queue-add-btn"]',
            position: 'bottom',
            titleKey: 'job_queue.empty_step1_title',
            bodyKey: 'job_queue.empty_step1_body',
        },
        {
            targetSelector: '[data-tour="chrome-extension-link"]',
            position: 'bottom',
            titleKey: 'job_queue.chrome_ext_title',
            bodyKey: 'job_queue.chrome_ext_body',
            imageUrl: '/images/chrome-extension-onboarding.png',
        },
    ];

    // Full branch: Steps 0-1 = Add Job + Chrome Extension (same as empty)
    // Step 2 = compact row, Steps 3-7 = tab CONTENT panels
    // Each step programmatically switches to the correct tab (via useEffect below)
    const FULL_STEPS: TourStep[] = [
        // Step 0: Add Job button
        {
            targetSelector: '[data-tour="job-queue-add-btn"]',
            position: 'bottom',
            titleKey: 'job_queue.empty_step1_title',
            bodyKey: 'job_queue.empty_step1_body',
        },
        // Step 1: Chrome Extension
        {
            targetSelector: '[data-tour="chrome-extension-link"]',
            position: 'bottom',
            titleKey: 'job_queue.chrome_ext_title',
            bodyKey: 'job_queue.chrome_ext_body',
            imageUrl: '/images/chrome-extension-onboarding.png',
        },
        // Step 2: Compact row overview
        {
            targetSelector: '[data-tour="job-compact-row"]',
            position: 'bottom',
            titleKey: 'job_queue.step1_title',
            bodyKey: 'job_queue.step1_body',
        },
        // Step 3: Steckbrief
        {
            targetSelector: '[data-tour="content-steckbrief"]',
            position: 'right',
            titleKey: 'job_queue.step2_title',
            bodyKey: 'job_queue.step2_body',
        },
        // Step 4: CV Match
        {
            targetSelector: '[data-tour="content-cv-match"]',
            position: 'right',
            titleKey: 'job_queue.step3_title',
            bodyKey: 'job_queue.step3_body',
        },
        // Step 5: CV Optimizer
        {
            targetSelector: '[data-tour="content-cv-opt"]',
            position: 'right',
            titleKey: 'job_queue.step4_title',
            bodyKey: 'job_queue.step4_body',
        },
        // Step 6: Cover Letter
        {
            targetSelector: '[data-tour="content-cover-letter"]',
            position: 'right',
            titleKey: 'job_queue.step5_title',
            bodyKey: 'job_queue.step5_body',
        },
        // Step 7: Video Letter
        {
            targetSelector: '[data-tour="content-video-letter"]',
            position: 'right',
            titleKey: 'job_queue.step6_title',
            bodyKey: 'job_queue.step6_body',
        },
    ];

    const tourSteps = !tourReady ? [] : (jobs.length === 0 ? EMPTY_STEPS : FULL_STEPS);

    const tour = useDashboardTour('job-queue', tourSteps, {
        delayMs: 2000,
        enabled: tourReady,
        requireOnboardingFlag: true,
    });

    const handleTourNext = useCallback(() => tour.nextStep(), [tour]);
    const handleTourSkip = useCallback(() => tour.skipTour(), [tour]);

    // ─── Tour: Auto-expand first job + programmatic tab switching ─────
    // Mirrors the Tagesziele pattern (layout.tsx) where each step controls
    // the UI state before the overlay tries to find its target element.
    //
    // Steps 0-1 (Add Job + Chrome Extension) → no job interaction needed
    // Step 2 (compact row overview) → row collapsed, clean spotlight
    // Steps 3-7 → row expanded, tab switched to matching content panel
    useEffect(() => {
        if (!tour.isActive) return;
        if (jobs.length === 0) return;

        // Steps 0-1: Add Job + Chrome Extension — no job interaction
        if (tour.currentStep <= 1) {
            setExpandedId(null);
            return;
        }

        // Step 2: Show compact row — DO NOT expand
        if (tour.currentStep === 2) {
            setExpandedId(null);
            return;
        }

        // Steps 3-7: Expand first job + click correct tab
        setExpandedId(jobs[0].id);

        // Map tour step → tab button to click
        const TAB_MAP: Record<number, string> = {
            3: '[data-tour="tab-steckbrief"]',    // Step 3 → Steckbrief
            4: '[data-tour="tab-cv-match"]',      // Step 4 → CV Match
            5: '[data-tour="tab-cv-opt"]',         // Step 5 → CV Opt
            6: '[data-tour="tab-cover-letter"]',   // Step 6 → Cover Letter
            7: '[data-tour="tab-video-letter"]',   // Step 7 → Video Letter
        };

        const selector = TAB_MAP[tour.currentStep];
        if (selector) {
            // RAF to ensure the expanded row has rendered its tab bar
            const raf = requestAnimationFrame(() => {
                const btn = document.querySelector(selector) as HTMLElement;
                btn?.click();
            });
            return () => cancelAnimationFrame(raf);
        }
    }, [tour.isActive, tour.currentStep, jobs]);

    // Optimization State
    const notify = useNotification();
    const t = useTranslations('dashboard.job_queue');
    const { showPaywall } = useCreditExhausted();
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
            case 'cv_matched':
            case 'cv_match_done': return 'CV_CHECKED';
            case 'cv_optimized': return 'CV_OPTIMIZED';
            case 'cover_letter_done': return 'CL_GENERATED';
            case 'ready_for_review': return 'CL_GENERATED';
            case 'ready_to_apply': return 'READY';
            case 'submitted': return 'READY';
            case 'video_letter_done': return 'READY';
            default: return 'NEW';
        }
    };

    // ✅ Canonical Stepper % mapping (SICHERHEITSARCHITEKTUR.md Section 9)
    const mapDbStatusToStep = (dbStatus: string): number => {
        switch (dbStatus.toLowerCase()) {
            case 'pending': return 0;
            case 'processing': return 10;
            case 'steckbrief_confirmed': return 30;
            case 'cv_matched':
            case 'cv_match_done': return 30;
            case 'cv_optimized': return 60;
            case 'cover_letter_done': return 100;
            case 'ready_for_review': return 100;
            case 'ready_to_apply': return 100;
            case 'submitted': return 100;
            case 'video_letter_done': return 110;
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
                    dbStatus: (j.status as string) || 'pending',
                    status: mapDbStatusToUi(j.status as string),
                    metadata: (j.metadata as Record<string, unknown>) || null,
                    source_url: (j.source_url as string) || null,
                    source: (j.source as string) || null,
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
        fetchJobs().finally(() => {
            setIsLoading(false);
            setTourReady(true);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleReanalyze = async (jobId: string) => {
        try {
            const res = await fetch('/api/jobs/extract', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jobId }),
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.error);

            let attempts = 0;
            const maxAttempts = 20;
            const pollInterval = setInterval(async () => {
                attempts++;
                try {
                    const freshJobs = await fetchJobs();
                    const updatedJob = freshJobs.find(j => j.id === jobId);
                    if (updatedJob?.summary) {
                        clearInterval(pollInterval);
                        notify(t('notify_steckbrief'));
                    } else if (attempts >= maxAttempts) {
                        clearInterval(pollInterval);
                    }
                } catch {
                    clearInterval(pollInterval);
                }
            }, 3000);

        } catch (err) {
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
                j.id === jobId ? { ...j, status: 'JOB_REVIEWED', dbStatus: 'steckbrief_confirmed', workflowStep: 30 } : j
            ));
            notify(t('notify_confirmed'));
        } catch {
        }
    };

    const handleDelete = async (jobId: string) => {
        try {
            const res = await fetch('/api/jobs/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jobId }),
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.error);
            setJobs(prev => prev.filter(j => j.id !== jobId));
            notify(t('notify_deleted'));
        } catch (err) {
        }
    };

    const handleMarkApplied = async (jobId: string) => {
        try {
            const res = await fetch('/api/jobs/mark-applied', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jobId }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.error || 'Mark applied failed');

            // Remove from active list — submitted jobs are filtered by /api/jobs/list
            setJobs(prev => prev.filter(j => j.id !== jobId));
            notify(t('notify_applied'));
            // Trigger ApplicationHistory refresh (even if section is already open)
            setHistoryRefreshKey(k => k + 1);

            // Confetti celebration
            import('canvas-confetti').then(({ default: confetti }) => {
                confetti({
                    particleCount: 80,
                    spread: 70,
                    origin: { y: 0.6 },
                    colors: ['#002e7a', '#3b82f6', '#60a5fa', '#93c5fd'],
                });
            });
        } catch (err) {
            console.error('❌ [mark-applied] Failed:', err);
            notify(t('error_mark_applied'));
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
                if (response.status === 402 && err.error === 'CREDITS_EXHAUSTED') {
                    showPaywall('credits', { remaining: err.remaining ?? 0 });
                    return;
                }
                throw new Error(err.error || 'Optimization failed');
            }
            const result = await response.json();
            setOptimizationResult(result);
            setShowOptimization(true);
            setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: 'CV_OPTIMIZED', workflowStep: 60 } : j));
            notify(t('notify_cv_optimized'));
        } catch (error) {
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
                    notify(t('notify_added'));
                }}
            />

            {/* Header */}
            <div>
                <div>
                    <h1 className="text-3xl font-semibold text-[#37352F]">{t('title')}</h1>
                    <p className="text-[#73726E] mt-1">{t('subtitle')}</p>
                </div>
                <div className="mt-3 flex items-center gap-3">
                    {/* Chrome Extension — left of Add Job */}
                    <a
                        href="https://chromewebstore.google.com/detail/pathly-%E2%80%94-job-copilot/iebipapmekiemcgdonmnmlpbobfonkki"
                        target="_blank"
                        rel="noopener noreferrer"
                        data-tour="chrome-extension-link"
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#002e7a]/30 text-[#002e7a] text-sm font-medium bg-[#f0f4ff] hover:bg-[#e0eaff] transition-colors"
                    >
                        <Puzzle className="w-4 h-4" />
                        Chrome Extension
                    </a>
                    <Button
                        variant="primary"
                        onClick={() => setIsAddJobOpen(true)}
                        className="rounded-xl px-5 py-2.5 font-medium"
                        disabled={jobs.length >= 5}
                        data-tour="job-queue-add-btn"
                    >
                        <PlusCircle className="w-4 h-4 mr-2" />
                        {t('add_job')}
                    </Button>
                    {jobs.length >= 5 && (
                        <span className="text-xs text-[#73726E]">
                            {t('max_jobs')}
                        </span>
                    )}
                </div>
            </div>

            {/* Toggle 1: Aktuelle Jobs */}
            <ToggleSection
                title={t('current_jobs')}
                count={jobs.length}
                defaultOpen={true}
            >
                <div className="space-y-2">
                    {isOptimizing && <span className="text-sm text-blue-600 animate-pulse px-5">{t('optimizing')}</span>}
                    <JobQueueTable
                        jobs={jobs}
                        onOptimize={handleOptimizeCV}
                        onReanalyze={handleReanalyze}
                        onConfirm={handleConfirm}
                        onDelete={handleDelete}
                        onMarkApplied={handleMarkApplied}
                        loading={isLoading}
                        optimizingJobId={isOptimizing ? currentJobId : null}
                        expandedId={expandedId}
                        onToggle={handleToggle}
                    />
                </div>
            </ToggleSection>

            {/* Toggle 2: Application History */}
            <ToggleSection
                title={t('application_history')}
                defaultOpen={false}
            >
                <ApplicationHistory refreshKey={historyRefreshKey} />
            </ToggleSection>

            {/* Optimization Modal */}
            <CustomDialog
                isOpen={showOptimization}
                onClose={() => setShowOptimization(false)}
                title={t('review_cv')}
                maxWidth="max-w-6xl"
                className="h-[90vh] overflow-hidden flex flex-col"
            >
                <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-[#FAFAF9]">
                    {optimizationResult && (
                        <CVComparison
                            optimizationResult={optimizationResult}
                            onAcceptAll={async () => { setShowOptimization(false); }}
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
                                }
                            }}
                        />
                    )}
                </div>
            </CustomDialog>

            {/* Job Queue Guided Tour */}
            {tour.isActive && tour.step && (
                <GuidedTourOverlay
                    step={tour.step}
                    currentStep={tour.currentStep}
                    totalSteps={tour.totalSteps}
                    onNext={handleTourNext}
                    onSkip={handleTourSkip}
                />
            )}
        </div>
    );
}
