"use client";

import { Home, Inbox, History, Settings } from 'lucide-react';
import { Sidebar, NavSection, NavItem, ProgressCard, CreditsCard } from '@/components/ui/sidebar';
import { JobCard } from '@/components/ui/job-card';

// ============================================================================
// DEMO PAGE - Showcasing Sidebar + JobCard Components
// ============================================================================

export default function DemoPage() {
  // Mock data
  const mockJobs = [
    {
      id: 1,
      company: 'Stripe',
      logo: 'https://logo.clearbit.com/stripe.com',
      jobTitle: 'Senior Backend Engineer',
      location: 'Berlin',
      salary: '€90-120k',
      remote: 'Full Remote',
      matchScore: 95,
      aiInsight: 'Perfect match - your Python experience aligns with their payment infrastructure needs.',
      skills: ['Python', 'Kubernetes', 'gRPC', 'PostgreSQL', 'Redis'],
    },
    {
      id: 2,
      company: 'Tesla',
      logo: 'https://logo.clearbit.com/tesla.com',
      jobTitle: 'Full-Stack Developer',
      location: 'Berlin',
      salary: '€80-100k',
      remote: 'Hybrid (60%)',
      matchScore: 88,
      aiInsight: 'Great fit - your React and Node.js skills match their requirements. Tesla is expanding Gigafactory Berlin.',
      skills: ['React', 'Node.js', 'TypeScript', 'AWS', 'Docker'],
    },
    {
      id: 3,
      company: 'N26',
      logo: 'https://logo.clearbit.com/n26.com',
      jobTitle: 'Platform Engineer',
      location: 'Berlin',
      salary: '€75-95k',
      remote: 'Full Remote',
      matchScore: 82,
      aiInsight: 'Good match - your DevOps background fits their platform team needs.',
      skills: ['Kubernetes', 'Terraform', 'AWS', 'Python', 'Go'],
    },
  ];

  const handleReview = (jobId: number) => {
    console.log('Review job:', jobId);
    alert(`Reviewing job #${jobId} - This would open the cover letter review modal`);
  };

  const handleEdit = (jobId: number) => {
    console.log('Edit job:', jobId);
    alert(`Editing job #${jobId} - This would open the editor`);
  };

  const handleSkip = (jobId: number) => {
    console.log('Skip job:', jobId);
    alert(`Skipped job #${jobId}`);
  };

  return (
    <div className="min-h-screen bg-[#FAFAF9]">
      {/* Sidebar */}
      <Sidebar>
        <NavSection title="Main">
          <NavItem icon={Home} label="Dashboard" href="/dashboard" />
          <NavItem icon={Inbox} label="Auto-Apply" href="/auto-apply" badge={12} isActive />
          <NavItem icon={History} label="History" href="/history" />
          <NavItem icon={Settings} label="Settings" href="/settings" />
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
          <div>
            <h1 className="text-3xl font-semibold text-[#37352F] mb-2">
              Auto-Apply Inbox
            </h1>
            <p className="text-[#73726E]">
              Today • {mockJobs.length} new jobs
            </p>
          </div>

          {/* Job Cards Stack */}
          <div className="space-y-6">
            {mockJobs.map((job) => (
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
              />
            ))}
          </div>

          {/* Empty State */}
          <div className="text-center py-12">
            <p className="text-[#A8A29E] text-sm">
              🎉 You've reviewed all jobs for today!
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
