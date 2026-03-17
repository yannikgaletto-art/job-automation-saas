'use client'

import { useState, useEffect } from 'react'
import type { Job } from '@/lib/types'

// Mock data for development
const mockJobs: Job[] = []

export function useJobs() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Simulate API call
    setTimeout(() => {
      setJobs(mockJobs)
      setLoading(false)
    }, 500)
  }, [])

  return { jobs, loading }
}