"use client";

import { useState } from 'react';
import { JobRow, Job } from './job-row';
import { cn } from '@/lib/utils';

import { TableSkeleton } from "@/components/skeletons/table-skeleton";
import { EmptyJobQueue } from '@/components/empty-states/empty-job-queue';

interface JobQueueTableProps {
    jobs: Job[];
    className?: string;
    onOptimize?: (jobId: string) => void;
    loading?: boolean;
    optimizingJobId?: string | null;
}

export function JobQueueTable({ jobs, className, onOptimize, loading, optimizingJobId }: JobQueueTableProps) {
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const handleToggle = (jobId: string) => {
        setExpandedId(expandedId === jobId ? null : jobId);
    };

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
            {/* Table Header */}
            {/* ... */}
            <div>
                {jobs.map((job) => (
                    <JobRow
                        key={job.id}
                        job={job}
                        expanded={expandedId === job.id}
                        onToggle={() => handleToggle(job.id)}
                        onOptimize={onOptimize}
                        isOptimizing={optimizingJobId === job.id}
                    />
                ))}
            </div>
        </div>
    );
}
