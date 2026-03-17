'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ExternalLink, CheckCircle2, Circle } from 'lucide-react'
import type { Job } from '@/lib/types'

interface Step1AboutJobProps {
  job: Job
  active: boolean
}

export function Step1AboutJob({ job, active }: Step1AboutJobProps) {
  if (!active) return null

  // Mock job requirements (in production, these would come from job data)
  const requirements = [
    { skill: 'Python', years: '5+', met: true },
    { skill: 'Kubernetes', years: '3+', met: true },
    { skill: 'PostgreSQL', years: '4+', met: true },
    { skill: 'Go', years: 'nice-to-have', met: false },
  ]

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">📋</span>
            <CardTitle>Job Requirements</CardTitle>
          </div>
          <Badge variant="success" className="bg-green-100 text-green-800 border-green-200">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Analyzed
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Required Skills */}
        <div>
          <h4 className="text-sm font-medium mb-3">Required Skills</h4>
          <div className="space-y-2">
            {requirements.map((req) => (
              <div key={req.skill} className="flex items-center gap-2 text-sm">
                {req.met ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="font-medium">{req.skill}</span>
                <span className="text-muted-foreground">({req.years})</span>
              </div>
            ))}
          </div>
        </div>

        {/* Job Details */}
        <div className="grid grid-cols-2 gap-4 pt-2 border-t">
          <div>
            <div className="text-sm text-muted-foreground mb-1">Experience</div>
            <div className="font-medium">Senior (5-8 years)</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground mb-1">Location</div>
            <div className="font-medium">{job.location || 'Remote'}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground mb-1">Salary</div>
            <div className="font-medium">{job.salary || '€90-120k'}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground mb-1">Posted</div>
            <div className="font-medium">{new Date(job.createdAt).toLocaleDateString()}</div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button variant="outline" size="sm" className="flex-1">
            <ExternalLink className="h-4 w-4 mr-2" />
            View Full Description
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}