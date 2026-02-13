'use client'

import { useState } from 'react'
import { JobRow } from './job-row'
import { EmptyState } from './empty-state'
import type { Job } from '@/lib/types'

interface JobQueueTableProps {
  jobs: Job[]
}

export function JobQueueTable({ jobs }: JobQueueTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (jobs.length === 0) {
    return <EmptyState />
  }

  return (
    <div className="w-full">
      {/* Desktop View */}
      <div className="hidden md:block">
        <div className="bg-card rounded-lg border shadow-sm">
          {/* Header */}
          <div className="grid grid-cols-[auto,1fr,100px,140px,180px] gap-4 px-6 py-3 border-b bg-muted/50 text-sm font-medium text-muted-foreground">
            <div>Status</div>
            <div>Company & Job Title</div>
            <div className="text-center">Match</div>
            <div>Progress</div>
            <div>Next Action</div>
          </div>

          {/* Rows */}
          <div className="divide-y">
            {jobs.map((job) => (
              <JobRow
                key={job.id}
                job={job}
                expanded={expandedId === job.id}
                onToggle={() => setExpandedId(expandedId === job.id ? null : job.id)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Mobile View */}
      <div className="md:hidden space-y-3">
        {jobs.map((job) => (
          <JobRow
            key={job.id}
            job={job}
            expanded={expandedId === job.id}
            onToggle={() => setExpandedId(expandedId === job.id ? null : job.id)}
            mobile
          />
        ))}
      </div>
    </div>
  )
}