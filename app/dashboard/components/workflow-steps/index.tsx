'use client'

import type { Job } from '@/lib/types'
import { Step1AboutJob } from './step-1-about-job'

interface WorkflowStepsProps {
  job: Job
  currentStep: number
}

export function WorkflowSteps({ job, currentStep }: WorkflowStepsProps) {
  return (
    <div className="space-y-4">
      {/* Step 1: About Job */}
      <Step1AboutJob job={job} active={currentStep >= 1} />

      {/* Step 2: CV Match (Coming in Phase 2) */}
      {currentStep >= 2 && (
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">📄</span>
            <h3 className="font-medium">CV vs Requirements</h3>
          </div>
          <p className="text-sm text-muted-foreground">Coming in Phase 2...</p>
        </div>
      )}

      {/* Step 3: Optimize CV (Coming in Phase 2) */}
      {currentStep >= 3 && (
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">✨</span>
            <h3 className="font-medium">CV Optimization</h3>
          </div>
          <p className="text-sm text-muted-foreground">Coming in Phase 2...</p>
        </div>
      )}

      {/* Step 4: Cover Letter (Coming in Phase 2) */}
      {currentStep >= 4 && (
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">📝</span>
            <h3 className="font-medium">Cover Letter Generation</h3>
          </div>
          <p className="text-sm text-muted-foreground">Coming in Phase 2...</p>
        </div>
      )}

      {/* Step 5: Review (Coming in Phase 2) */}
      {currentStep >= 5 && (
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">✅</span>
            <h3 className="font-medium">Final Review</h3>
          </div>
          <p className="text-sm text-muted-foreground">Coming in Phase 2...</p>
        </div>
      )}
    </div>
  )
}