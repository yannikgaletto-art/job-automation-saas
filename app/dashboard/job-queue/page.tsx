"use client";

import { useState, useEffect } from 'react';
import { JobQueueTable } from '../components/job-queue-table';
import { Job } from '../components/job-row';
import { Button } from '@/components/motion/button';
import { Plus } from 'lucide-react';
import { AddJobDialog } from '@/components/dashboard/add-job-dialog';
import { CustomDialog } from '@/components/ui/custom-dialog';
import { CVComparison } from '@/components/cv/cv-comparison';
import type { CVOptimizationResult } from '@/lib/services/cv-optimizer';
import { toast } from "sonner";

export default function JobQueuePage() {
    const [jobs, setJobs] = useState<Job[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isAddJobOpen, setIsAddJobOpen] = useState(false);

    // Optimization State
    const [showOptimization, setShowOptimization] = useState(false);
    const [optimizationResult, setOptimizationResult] = useState<CVOptimizationResult | null>(null);
    const [isOptimizing, setIsOptimizing] = useState(false);
    const [currentJobId, setCurrentJobId] = useState<string | null>(null);

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

    const fetchJobs = async () => {
        try {
            const res = await fetch('/api/jobs/list', { cache: 'no-store' });
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
                    buzzwords: (j.buzzwords as string[]) || null,
                    matchScore: (j.match_score as number) || ((j.status !== 'pending' || (j.responsibilities && (j.responsibilities as string[]).length > 0)) ? 10 : 0),
                    workflowStep: mapDbStatusToStep(j.status as string),
                    status: mapDbStatusToUi(j.status as string),
                }));
                setJobs(dbJobs);
            }
        } catch (err) {
            console.warn('⚠️ Could not fetch jobs:', err);
        }
    };

    useEffect(() => {
        fetchJobs().finally(() => setIsLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleReanalyze = async (jobId: string) => {
        toast.info('Analysiere Job-Beschreibung...');
        try {
            const res = await fetch('/api/jobs/extract', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jobId }),
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.error);
            await fetchJobs();
            toast.success('Steckbrief erfolgreich extrahiert ✓');
        } catch (err) {
            toast.error('Extraktion fehlgeschlagen', { description: String(err) });
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
                j.id === jobId ? { ...j, status: 'JOB_REVIEWED', workflowStep: 1 } : j
            ));
            toast.success('Steckbrief bestätigt → CV Match freigeschaltet');
        } catch {
            toast.error('Bestätigung fehlgeschlagen');
        }
    };

    const handleDelete = async (jobId: string) => {
        toast.info("Lösche Bewerbung...");
        try {
            const res = await fetch('/api/jobs/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jobId }),
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.error);
            setJobs(prev => prev.filter(j => j.id !== jobId));
            toast.success("Bewerbung gelöscht");
        } catch (err) {
            toast.error("Löschen fehlgeschlagen", { description: String(err) });
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
            setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: 'CV_OPTIMIZED', workflowStep: 3 } : j));
            toast.success("CV optimiert");
        } catch (error) {
            toast.error("Optimierung fehlgeschlagen", {
                description: error instanceof Error ? error.message : "Bitte erneut versuchen"
            });
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
                    toast.success("Job hinzugefügt");
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
                <div className="flex items-center gap-2">
                    {isOptimizing && <span className="text-sm text-blue-600 animate-pulse">✨ Optimizing CV...</span>}
                </div>

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
                            onAcceptAll={async () => { setShowOptimization(false); toast.success("Änderungen übernommen"); }}
                            onRejectAll={() => setShowOptimization(false)}
                            onDownload={async () => { toast.info("PDF Download noch nicht implementiert"); }}
                        />
                    )}
                </div>
            </CustomDialog>
        </div>
    );
}
