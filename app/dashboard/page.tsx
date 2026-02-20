"use client";

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { CountUp } from '@/components/motion/count-up';
import { JobQueueTable } from './components/job-queue-table';
import { Job } from './components/job-row';
import { Button } from '@/components/motion/button';
import { Plus } from 'lucide-react';
import { TimeBlockingCalendar } from './components/time-blocking-calendar';
import { DailyGoalsChecklist } from './components/daily-goals-checklist';
import { AddJobDialog } from '@/components/dashboard/add-job-dialog';
import { CustomDialog } from '@/components/ui/custom-dialog';
import { CVComparison } from '@/components/cv/cv-comparison';
import type { CVOptimizationResult } from '@/lib/services/cv-optimizer';
import { CardSkeletonGrid } from "@/components/skeletons/card-skeleton";
import { ApplicationHistory } from '@/app/dashboard/components/application-history';
import { toast } from "sonner";

export default function DashboardPage() {
    const [jobs, setJobs] = useState<Job[]>([]);

    // Map job_queue status → UI status
    const mapDbStatusToUi = (dbStatus: string): Job['status'] => {
        switch (dbStatus) {
            case 'pending': return 'NEW';
            case 'processing': return 'JOB_REVIEWED';
            case 'ready_for_review': return 'CV_OPTIMIZED';
            case 'ready_to_apply': return 'CL_GENERATED';
            case 'submitted': return 'READY';
            default: return 'NEW';
        }
    };

    const mapDbStatusToStep = (dbStatus: string): number => {
        switch (dbStatus) {
            case 'pending': return 0;
            case 'processing': return 1;
            case 'ready_for_review': return 2;
            case 'ready_to_apply': return 4;
            case 'submitted': return 4;
            default: return 0;
        }
    };

    // Fetch real jobs from DB
    const fetchJobs = async () => {
        try {
            const res = await fetch('/api/jobs/list');
            if (!res.ok) return;
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
                    matchScore: 0,
                    workflowStep: mapDbStatusToStep(j.status as string),
                    status: mapDbStatusToUi(j.status as string),
                }));
                setJobs(dbJobs);
            }
        } catch (err) {
            console.warn('⚠️ Could not fetch jobs from API:', err);
        }
    };

    const [isAddJobOpen, setIsAddJobOpen] = useState(false);

    // Optimization State
    const [showOptimization, setShowOptimization] = useState(false);
    const [optimizationResult, setOptimizationResult] = useState<CVOptimizationResult | null>(null);
    const [isOptimizing, setIsOptimizing] = useState(false);
    const [currentJobId, setCurrentJobId] = useState<string | null>(null);

    // Loading state
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        // Fetch real jobs, then finish loading
        fetchJobs().finally(() => {
            setIsLoading(false);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Calculate stats
    const totalJobs = jobs.length;
    const readyToApply = jobs.filter(j => j.status === 'READY' || j.status === 'CL_GENERATED').length;
    const inProgress = jobs.filter(j => j.workflowStep > 0 && j.workflowStep < 5).length;


    // ...

    const handleOptimizeCV = async (jobId: string) => {
        setIsOptimizing(true);
        setCurrentJobId(jobId);

        try {
            // In a real app, we'd get userId from session
            const userId = "test-user-id";

            // Call API
            const response = await fetch('/api/cv/optimize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, jobId })
            });

            if (!response.ok) {
                // If 500 or 429, show error
                const err = await response.json();
                toast.error("Optimization failed", {
                    description: err.error || "Please try again",
                    action: {
                        label: "Retry",
                        onClick: () => handleOptimizeCV(jobId)
                    }
                });
                return;
            }

            const result = await response.json();
            setOptimizationResult(result);
            setShowOptimization(true);

            // Update local job status to reflect optimization done
            setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: 'CV_OPTIMIZED', workflowStep: 3 } : j));
            toast.success("CV Optimized");

        } catch (error) {
            console.error('❌ Optimization failed:', error);
            toast.error("Optimization request failed", {
                description: "Network error or server unavailable."
            });
        } finally {
            setIsOptimizing(false);
        }
    };

    const handleAcceptAll = async () => {
        // Logic to persist final choice or move to next step
        console.log('✅ Accepted all changes for job', currentJobId);
        setShowOptimization(false);
        toast.success("Changes applied");
    };

    const handleDownload = async () => {
        console.log('📥 Download requested');
        // Simulate delay
        await new Promise(resolve => setTimeout(resolve, 1000));
        toast.info("PDF Download not implemented in demo yet");
    };

    return (
        <div className="space-y-8">
            <AddJobDialog
                isOpen={isAddJobOpen}
                onClose={() => setIsAddJobOpen(false)}
                onJobAdded={() => {
                    console.log("Job added, refreshing list...");
                    fetchJobs();
                }}
            />

            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-semibold text-[#37352F]">Dashboard</h1>
                    <p className="text-[#73726E] mt-1">Manage your job application workflow</p>
                </div>
                <Button variant="primary" onClick={() => setIsAddJobOpen(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Job
                </Button>
            </div>

            {/* Stats Cards */}
            {isLoading ? (
                <CardSkeletonGrid count={3} />
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <motion.div
                        className="bg-white rounded-xl border border-[#d6d6d6] p-6 shadow-sm"
                        whileHover={{ scale: 1.02, y: -2, boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)" }}
                        transition={{ duration: 0.2 }}
                    >
                        <p className="text-xs font-semibold text-[#002e7a]/60 uppercase tracking-wider mb-1">Total Jobs</p>
                        <div className="text-4xl font-bold text-[#002e7a]">
                            <CountUp value={totalJobs} duration={1} />
                        </div>
                    </motion.div>
                    <motion.div
                        className="bg-white rounded-xl border border-[#d6d6d6] p-6 shadow-sm"
                        whileHover={{ scale: 1.02, y: -2, boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)" }}
                        transition={{ duration: 0.2 }}
                    >
                        <p className="text-xs font-semibold text-[#002e7a]/60 uppercase tracking-wider mb-1">Ready to Apply</p>
                        <div className="text-4xl font-bold text-[#002e7a]">
                            <CountUp value={readyToApply} duration={1} />
                        </div>
                    </motion.div>
                    <motion.div
                        className="bg-white rounded-xl border border-[#d6d6d6] p-6 shadow-sm"
                        whileHover={{ scale: 1.02, y: -2, boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)" }}
                        transition={{ duration: 0.2 }}
                    >
                        <p className="text-xs font-semibold text-[#002e7a]/60 uppercase tracking-wider mb-1">In Progress</p>
                        <div className="text-4xl font-bold text-[#002e7a]">
                            <CountUp value={inProgress} duration={1} />
                        </div>
                    </motion.div>
                </div>
            )}

            {/* Time Blocking + Daily Goals Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <TimeBlockingCalendar />
                <DailyGoalsChecklist />
            </div>

            {/* Job Queue Table */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold text-[#37352F]">Job Queue</h2>
                    {isOptimizing && <span className="text-sm text-blue-600 animate-pulse">✨ Optimizing CV...</span>}
                </div>
                <JobQueueTable
                    jobs={jobs}
                    onOptimize={handleOptimizeCV}
                    loading={isLoading}
                    optimizingJobId={isOptimizing ? currentJobId : null}
                />
            </div>

            {/* Application History Section */}
            <div className="space-y-4 pt-8 border-t border-[#d6d6d6]">
                <h2 className="text-xl font-semibold text-[#37352F]">Application History</h2>
                <ApplicationHistory />
            </div>

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
                            onAcceptAll={handleAcceptAll}
                            onRejectAll={() => setShowOptimization(false)}
                            onDownload={handleDownload}
                        />
                    )}
                </div>
            </CustomDialog>
        </div>
    );
}
