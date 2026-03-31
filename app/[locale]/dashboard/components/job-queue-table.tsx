"use client";

import { JobRow, Job } from './job-row';
import { cn } from '@/lib/utils';

import { TableSkeleton } from "@/components/skeletons/table-skeleton";
import { EmptyJobQueue } from '@/components/empty-states/empty-job-queue';

interface JobQueueTableProps {
    jobs: Job[];
    className?: string;
    onOptimize?: (jobId: string) => void;
    onReanalyze?: (jobId: string) => void;
    onConfirm?: (jobId: string) => void;
    onDelete?: (jobId: string) => void;
    loading?: boolean;
    optimizingJobId?: string | null;
    /** Controlled expand state — lifted from parent */
    expandedId: string | null;
    /** Toggle callback — lifted from parent */
    onToggle: (jobId: string) => void;
}

export function JobQueueTable({
    jobs, className, onOptimize, onReanalyze, onConfirm, onDelete,
    loading, optimizingJobId, expandedId, onToggle,
}: JobQueueTableProps) {
    if (loading) {
        return <TableSkeleton rows={5} columns={5} />;
    }

    if (jobs.length === 0) {
        return (
            <div className={className}>
                <EmptyJobQueue />
            </div>
        );
    }

    return (
        <div className={cn("bg-white rounded-lg border border-[#d6d6d6] overflow-hidden", className)}>
            <div>
                {jobs.map((job) => (
                    <JobRow
                        key={job.id}
                        job={job}
                        expanded={expandedId === job.id}
                        onToggle={() => onToggle(job.id)}
                        onOptimize={onOptimize}
                        onReanalyze={onReanalyze}
                        onConfirm={onConfirm}
                        onDelete={onDelete}
                        isOptimizing={optimizingJobId === job.id}
                    />
                ))}
            </div>
        </div>
    );
}
