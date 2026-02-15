"use client";

import { useState } from 'react';
import { JobRow, Job } from './job-row';
import { cn } from '@/lib/utils';

interface JobQueueTableProps {
    jobs: Job[];
    className?: string;
}

export function JobQueueTable({ jobs, className }: JobQueueTableProps) {
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const handleToggle = (jobId: string) => {
        setExpandedId(expandedId === jobId ? null : jobId);
    };

    if (jobs.length === 0) {
        return (
            <div className={cn("bg-white rounded-lg border border-[#d6d6d6] p-12 text-center", className)}>
                <p className="text-[#002e7a] opacity-80">No jobs in queue. Add a job to get started.</p>
            </div>
        );
    }

    return (
        <div className={cn("bg-white rounded-lg border border-[#d6d6d6] overflow-hidden", className)}>
            {/* Table Header */}
            <div className="flex items-center gap-2 px-6 py-3 bg-[#d4e3fe] border-b border-[#d6d6d6] text-sm font-bold text-[#002e7a] uppercase tracking-wide">
                <div className="w-4"></div> {/* Expand icon space */}
                <div className="w-2"></div> {/* Status dot space */}
                <div className="w-28 md:w-32">Company</div>
                <div className="w-40 md:w-48">Job Title</div>
                <div className="w-20 text-center">Match</div>
                <div className="flex-1 min-w-[200px]">Progress</div>
                <div className="w-48 md:w-56">Next Action</div>
            </div>

            {/* Table Rows */}
            <div>
                {jobs.map((job) => (
                    <JobRow
                        key={job.id}
                        job={job}
                        expanded={expandedId === job.id}
                        onToggle={() => handleToggle(job.id)}
                    />
                ))}
            </div>
        </div>
    );
}
