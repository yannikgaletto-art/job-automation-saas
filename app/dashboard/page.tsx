"use client";

import { useState } from 'react';
import { motion } from 'framer-motion';
import { CountUp } from '@/components/motion/count-up';
import { JobQueueTable } from './components/job-queue-table';
import { Job } from './components/job-row';
import { Button } from '@/components/motion/button';
import { Plus } from 'lucide-react';
import { TimeBlockingCalendar } from './components/time-blocking-calendar';
import { DailyGoalsChecklist } from './components/daily-goals-checklist';
import { AddJobDialog } from '@/components/dashboard/add-job-dialog';

export default function DashboardPage() {
    // Demo data with different workflow states
    const [jobs] = useState<Job[]>([
        {
            id: '1',
            company: 'Stripe',
            jobTitle: 'Backend Eng.',
            matchScore: 95,
            workflowStep: 4, // 4/5 steps done
            status: 'CL_GENERATED',
        },
        {
            id: '2',
            company: 'Tesla',
            jobTitle: 'Full-Stack',
            matchScore: 88,
            workflowStep: 3, // 3/5 steps done
            status: 'CV_OPTIMIZED',
        },
        {
            id: '3',
            company: 'N26',
            jobTitle: 'Platform',
            matchScore: 82,
            workflowStep: 1, // 1/5 steps done
            status: 'JOB_REVIEWED',
        },
    ]);

    // Calculate stats
    const totalJobs = jobs.length;
    const readyToApply = jobs.filter(j => j.status === 'READY' || j.status === 'CL_GENERATED').length;
    const inProgress = jobs.filter(j => j.workflowStep > 0 && j.workflowStep < 5).length;

    const [isAddJobOpen, setIsAddJobOpen] = useState(false);

    return (
        <div className="space-y-8">
            <AddJobDialog
                isOpen={isAddJobOpen}
                onClose={() => setIsAddJobOpen(false)}
                onJobAdded={() => {
                    // Logic to refresh jobs would go here
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

            {/* Time Blocking + Daily Goals Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <TimeBlockingCalendar />
                <DailyGoalsChecklist />
            </div>

            {/* Job Queue Table */}
            <div className="space-y-4">
                <h2 className="text-xl font-semibold text-[#37352F]">Job Queue</h2>
                <JobQueueTable jobs={jobs} />
            </div>
        </div>
    );
}
