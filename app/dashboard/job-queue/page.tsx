"use client";

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { JobQueueTable } from '../components/job-queue-table';
import { Job } from '../components/job-row';
import { Button } from '@/components/motion/button';
import { Plus } from 'lucide-react';
import { AddJobDialog } from '@/components/dashboard/add-job-dialog';
import { CustomDialog } from '@/components/ui/custom-dialog';
import { CVComparison } from '@/components/cv/cv-comparison';
import type { CVOptimizationResult } from '@/lib/services/cv-optimizer';
import { toast } from "sonner";
import { ErrorAlert } from '@/components/ui/error-alert';

export default function JobQueuePage() {
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

    const [isAddJobOpen, setIsAddJobOpen] = useState(false);

    // Optimization State
    const [showOptimization, setShowOptimization] = useState(false);
    const [optimizationResult, setOptimizationResult] = useState<CVOptimizationResult | null>(null);
    const [isOptimizing, setIsOptimizing] = useState(false);
    const [currentJobId, setCurrentJobId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Simulate initial loading (for demonstration)
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const timer = setTimeout(() => {
            setIsLoading(false);
        }, 1000);
        return () => clearTimeout(timer);
    }, []);

    const handleOptimizeCV = async (jobId: string) => {
        setIsOptimizing(true);
        setCurrentJobId(jobId);
        setError(null);

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
                const err = await response.json();
                throw new Error(err.error || 'Optimization failed');
            }

            const result = await response.json();
            setOptimizationResult(result);
            setShowOptimization(true);

            // Update local job status to reflect optimization done
            setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: 'CV_OPTIMIZED', workflowStep: 3 } : j));
            toast.success("CV Optimization Complete", {
                description: "Review the suggested changes below."
            });

        } catch (error) {
            console.error('❌ Optimization failed:', error);
            const message = error instanceof Error ? error.message : "Optimization request failed";
            toast.error("Optimization Failed", {
                description: message,
                action: {
                    label: "Retry",
                    onClick: () => handleOptimizeCV(jobId)
                }
            });
        } finally {
            setIsOptimizing(false);
        }
    };

    const handleAcceptAll = async () => {
        // Logic to persist final choice or move to next step
        console.log('✅ Accepted all changes for job', currentJobId);
        toast.success("Changes Applied", {
            description: "Your CV has been updated."
        });
        setShowOptimization(false);
    };

    const handleDownload = async () => {
        console.log('📥 Download requested');
        toast.info("Download Started", {
            description: "Your PDF is being generated..."
        });
        // Simulate delay
        await new Promise(resolve => setTimeout(resolve, 1000));
        toast.error("Not Implemented", {
            description: "PDF Download is not available in this demo."
        });
    };

    if (error) {
        return (
            <div className="p-8">
                <ErrorAlert
                    title="Error Loading Job Queue"
                    message={error}
                    onRetry={() => window.location.reload()}
                />
            </div>
        );
    }

    return (
        <div className="space-y-8 max-w-7xl mx-auto">
            <AddJobDialog
                isOpen={isAddJobOpen}
                onClose={() => setIsAddJobOpen(false)}
                onJobAdded={() => {
                    toast.success("Job Added", { description: "The new job has been added to your queue." });
                }}
            />

            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-semibold text-[#37352F]">Job Queue</h1>
                    <p className="text-[#73726E] mt-1">Manage and track your active job applications</p>
                </div>
                <Button variant="primary" onClick={() => setIsAddJobOpen(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Job
                </Button>
            </div>

            {/* Job Queue Table */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        {isOptimizing && <span className="text-sm text-blue-600 animate-pulse">✨ Optimizing CV...</span>}
                    </div>
                </div>

                <JobQueueTable
                    jobs={jobs}
                    onOptimize={handleOptimizeCV}
                    loading={isLoading}
                    optimizingJobId={isOptimizing ? currentJobId : null}
                />
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
