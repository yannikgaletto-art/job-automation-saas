'use client'

import { JobQueueTable } from './components/job-queue-table'
import { ProgressWorkflowDetailed } from './components/progress-workflow'
import { useJobs } from './hooks/use-jobs'
import { Skeleton } from '@/components/ui/skeleton'

export default function DashboardPage() {
  const { jobs, loading } = useJobs()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold mb-2">Job Queue</h1>
        <p className="text-muted-foreground">
          Manage your job applications with the progressive workflow
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border bg-card p-6">
          <div className="text-sm font-medium text-muted-foreground">Total Jobs</div>
          <div className="text-2xl font-bold mt-2">{loading ? <Skeleton className="h-8 w-16" /> : jobs.length}</div>
        </div>
        <div className="rounded-lg border bg-card p-6">
          <div className="text-sm font-medium text-muted-foreground">Ready to Apply</div>
          <div className="text-2xl font-bold mt-2">
            {loading ? <Skeleton className="h-8 w-16" /> : jobs.filter(j => j.status === 'CL_GENERATED').length}
          </div>
        </div>
        <div className="rounded-lg border bg-card p-6">
          <div className="text-sm font-medium text-muted-foreground">Avg. Match Score</div>
          <div className="text-2xl font-bold mt-2">
            {loading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              `${Math.round(jobs.reduce((acc, j) => acc + j.matchScore, 0) / jobs.length)}%`
            )}
          </div>
        </div>
      </div>

      {/* Job Queue Table */}
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : (
        <JobQueueTable jobs={jobs} />
      )}
    </div>
  )
}