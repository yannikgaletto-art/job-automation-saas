'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ProgressWorkflow } from './progress-workflow'
import { WorkflowSteps } from './workflow-steps'
import type { Job } from '@/lib/types'
import { FileText, CheckCircle2, Sparkles, Mail, Eye, ChevronDown } from 'lucide-react'

interface JobRowProps {
  job: Job
  expanded: boolean
  onToggle: () => void
  mobile?: boolean
}

const getNextAction = (status: Job['status']) => {
  switch (status) {
    case 'NEW':
      return { icon: FileText, label: 'View Job', variant: 'primary' as const }
    case 'JOB_REVIEWED':
      return { icon: CheckCircle2, label: 'Check CV Match', variant: 'primary' as const }
    case 'CV_CHECKED':
      return { icon: Sparkles, label: 'Optimize CV', variant: 'primary' as const }
    case 'CV_OPTIMIZED':
      return { icon: Mail, label: 'Generate Cover Letter', variant: 'primary' as const }
    case 'CL_GENERATED':
      return { icon: Eye, label: 'Review & Apply', variant: 'primary' as const }
    default:
      return { icon: FileText, label: 'View Job', variant: 'primary' as const }
  }
}

const getWorkflowStep = (status: Job['status']) => {
  const steps = ['NEW', 'JOB_REVIEWED', 'CV_CHECKED', 'CV_OPTIMIZED', 'CL_GENERATED']
  return steps.indexOf(status) + 1
}

export function JobRow({ job, expanded, onToggle, mobile }: JobRowProps) {
  const nextAction = getNextAction(job.status)
  const NextIcon = nextAction.icon
  const currentStep = getWorkflowStep(job.status)

  if (mobile) {
    return (
      <div className="bg-card rounded-lg border shadow-sm overflow-hidden">
        {/* Mobile Collapsed View */}
        <button
          onClick={onToggle}
          className="w-full p-4 text-left hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className={`h-2 w-2 rounded-full ${
                  currentStep === 5 ? 'bg-green-500' : 'bg-blue-500'
                } animate-pulse`} />
                <span className="font-medium text-sm truncate">{job.company}</span>
              </div>
              <p className="text-sm text-muted-foreground truncate mb-2">{job.title}</p>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">{job.matchScore}% Match</Badge>
                <ProgressWorkflow current={currentStep} max={5} size="sm" />
              </div>
            </div>
            <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform ${
              expanded ? 'rotate-180' : ''
            }`} />
          </div>
        </button>

        {/* Mobile Expanded View */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="border-t"
            >
              <div className="p-4">
                <WorkflowSteps job={job} currentStep={currentStep} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )
  }

  return (
    <div className="group">
      {/* Desktop Collapsed View */}
      <div
        className="grid grid-cols-[auto,1fr,100px,140px,180px] gap-4 px-6 py-4 hover:bg-muted/50 transition-colors cursor-pointer"
        onClick={onToggle}
      >
        {/* Status Indicator */}
        <div className="flex items-center">
          <span className={`h-3 w-3 rounded-full ${
            currentStep === 5 ? 'bg-green-500' : 'bg-blue-500'
          } animate-pulse`} />
        </div>

        {/* Company & Job */}
        <div className="min-w-0">
          <div className="font-medium truncate">{job.company}</div>
          <div className="text-sm text-muted-foreground truncate">{job.title}</div>
        </div>

        {/* Match Score */}
        <div className="flex items-center justify-center">
          <Badge variant="secondary">{job.matchScore}%</Badge>
        </div>

        {/* Progress */}
        <div className="flex items-center">
          <ProgressWorkflow current={currentStep} max={5} />
        </div>

        {/* Next Action */}
        <div className="flex items-center">
          <Button size="sm" variant={nextAction.variant} className="w-full">
            <NextIcon className="h-4 w-4 mr-2" />
            {nextAction.label}
          </Button>
        </div>
      </div>

      {/* Desktop Expanded View */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-hidden border-t bg-muted/20"
          >
            <div className="px-6 py-6">
              <WorkflowSteps job={job} currentStep={currentStep} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}