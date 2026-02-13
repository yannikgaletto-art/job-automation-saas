'use client'

import { Inbox } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="rounded-full bg-muted p-6 mb-4">
        <Inbox className="h-12 w-12 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold mb-2">No jobs in queue yet</h3>
      <p className="text-muted-foreground text-center mb-6 max-w-md">
        Start by adding jobs from job boards using our Chrome extension,
        or upload a job description manually.
      </p>
      <div className="flex gap-3">
        <Button variant="outline">Install Extension</Button>
        <Button>Add Job Manually</Button>
      </div>
    </div>
  )
}