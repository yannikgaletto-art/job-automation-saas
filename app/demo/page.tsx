"use client";

import { Home, Inbox, History, Settings } from 'lucide-react';
import { Sidebar, NavSection, NavItem, ProgressCard, CreditsCard } from '@/components/motion/sidebar';
import { JobCard } from '@/components/motion/job-card';
import { SectionTransition, StaggerContainer, StaggerItem } from '@/components/motion/page-transition';
import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';

// ============================================================================
// DEMO PAGE - Showcasing Fluid Motion Components
// ============================================================================

export default function DemoPage() {
  const [jobs, setJobs] = useState<any[]>([]);

  const handleReview = (jobId: number) => {
    console.log('Review job:', jobId);
    // Remove job with animation
    setJobs(jobs.filter(j => j.id !== jobId));
  };

  const handleEdit = (jobId: number) => {
    console.log('Edit job:', jobId);
    alert(`Editing job #${jobId} - This would open the editor`);
  };

  const handleSkip = (jobId: number) => {
    console.log('Skip job:', jobId);
    // Remove job with animation
    setJobs(jobs.filter(j => j.id !== jobId));
  };

  return (
    <div className="min-h-screen bg-[#FAFAF9]">
      {/* Sidebar */}
      <Sidebar>
        <NavSection title="Main">
          <NavItem icon={Home} label="Dashboard" href="/dashboard" shortcut="G H" />
          <NavItem icon={Inbox} label="Auto-Apply" href="/auto-apply" badge={12} isActive shortcut="G I" />
          <NavItem icon={History} label="History" href="/history" shortcut="G A" />
          <NavItem icon={Settings} label="Settings" href="/settings" shortcut="," />
        </NavSection>

        <NavSection title="Stats" className="mt-auto">
          <ProgressCard title="This Week" value={3} total={10} />
          <CreditsCard remaining={47} />
        </NavSection>
      </Sidebar>

      {/* Main Content */}
      <main className="ml-64 p-8">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Header */}
          <SectionTransition>
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
            >
              <h1 className="text-3xl font-semibold text-[#37352F] mb-2">
                Auto-Apply Inbox
              </h1>
              <motion.p
                className="text-[#73726E]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                Today • {jobs.length} new jobs
              </motion.p>
            </motion.div>
          </SectionTransition>

          {/* Job Cards Stack */}
          <AnimatePresence mode="popLayout">
            {jobs.length > 0 ? (
              <div className="space-y-6">
                {jobs.map((job, index) => (
                  <JobCard
                    key={job.id}
                    company={job.company}
                    logo={job.logo}
                    jobTitle={job.jobTitle}
                    location={job.location}
                    salary={job.salary}
                    remote={job.remote}
                    matchScore={job.matchScore}
                    aiInsight={job.aiInsight}
                    skills={job.skills}
                    onReview={() => handleReview(job.id)}
                    onEdit={() => handleEdit(job.id)}
                    onSkip={() => handleSkip(job.id)}
                    index={index}
                  />
                ))}
              </div>
            ) : (
              <motion.div
                className="text-center py-24"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", stiffness: 200 }}
              >
                <motion.div
                  animate={{
                    y: [0, -10, 0],
                    rotate: [0, 5, -5, 0]
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: "easeInOut"
                  }}
                  className="text-6xl mb-4"
                >
                  🎉
                </motion.div>
                <h2 className="text-2xl font-semibold text-[#37352F] mb-2">
                  All Done!
                </h2>
                <p className="text-[#A8A29E] text-sm">
                  You've reviewed all jobs for today!
                </p>
                <motion.button
                  className="mt-6 px-6 py-3 bg-[#0066FF] text-white rounded-lg font-medium"
                  whileHover={{ scale: 1.05, y: -2 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => window.location.reload()}
                >
                  Reload Demo
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
