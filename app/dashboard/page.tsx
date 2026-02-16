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

export default function DashboardPage() {
    // Demo data with different workflow states
    const [jobs, setJobs] = useState<Job[]>([
        {
            id: '1',
            company: 'Stripe',
            jobTitle: 'Backend Eng.',
            matchScore: 95,
            workflowStep: 4,
            status: 'CL_GENERATED',
        },
        {
            id: '2',
            company: 'Tesla',
            jobTitle: 'Full-Stack',
            matchScore: 88,
            workflowStep: 2,
            status: 'CV_CHECKED', // Ready for optimization
        },
        {
            id: '3',
            company: 'N26',
            jobTitle: 'Platform',
            matchScore: 82,
            workflowStep: 1,
            status: 'JOB_REVIEWED',
        },
    ]);

    // Calculate stats
    const totalJobs = jobs.length;
    const readyToApply = jobs.filter(j => j.status === 'READY' || j.status === 'CL_GENERATED').length;
    const inProgress = jobs.filter(j => j.workflowStep > 0 && j.workflowStep < 5).length;

    const [isAddJobOpen, setIsAddJobOpen] = useState(false);

    // Optimization State
    const [showOptimization, setShowOptimization] = useState(false);
    const [optimizationResult, setOptimizationResult] = useState<CVOptimizationResult | null>(null);
    const [isOptimizing, setIsOptimizing] = useState(false);
    const [currentJobId, setCurrentJobId] = useState<string | null>(null);

    // Simulate initial loading (for demonstration)
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const timer = setTimeout(() => {
            setIsLoading(false);
        }, 1500); // 1.5s simulated load time
        return () => clearTimeout(timer);
    }, []);

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
                // If 500 or 429, show error (alert only for MVP)
                const err = await response.json();
                alert(`Error: ${err.error || 'Optimization failed'}`);
                return;
            }

            const result = await response.json();
            setOptimizationResult(result);
            setShowOptimization(true);

            // Update local job status to reflect optimization done
            setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: 'CV_OPTIMIZED', workflowStep: 3 } : j));

        } catch (error) {
            console.error('❌ Optimization failed:', error);
            alert('Optimization request failed');
        } finally {
            setIsOptimizing(false);
        }
    };

    const handleAcceptAll = async () => {
        // Logic to persist final choice or move to next step
        console.log('✅ Accepted all changes for job', currentJobId);
        setShowOptimization(false);
    };

    const handleDownload = async () => {
        console.log('📥 Download requested');
        // Simulate delay
        await new Promise(resolve => setTimeout(resolve, 1000));
        alert('PDF Download not implemented in demo yet');
    };

    return (
        <div className="space-y-8">
            <AddJobDialog
                isOpen={isAddJobOpen}
                onClose={() => setIsAddJobOpen(false)}
                onJobAdded={() => {
                    console.log("Job added, refreshing list...");
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
