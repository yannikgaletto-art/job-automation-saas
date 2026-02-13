'use client'

import { useState, useEffect } from 'react'
import type { Job } from '@/lib/types'

// Mock data for development
const mockJobs: Job[] = [
  {
    id: '1',
    company: 'Stripe',
    title: 'Backend Engineer',
    matchScore: 95,
    status: 'CL_GENERATED',
    location: 'Berlin, Germany',
    salary: '€90-120k',
    createdAt: new Date().toISOString(),
  },
  {
    id: '2',
    company: 'Tesla',
    title: 'Full-Stack Developer',
    matchScore: 88,
    status: 'CV_OPTIMIZED',
    location: 'Berlin, Germany',
    salary: '€85-110k',
    createdAt: new Date().toISOString(),
  },
  {
    id: '3',
    company: 'N26',
    title: 'Platform Engineer',
    matchScore: 82,
    status: 'NEW',
    location: 'Berlin, Germany',
    salary: '€80-105k',
    createdAt: new Date().toISOString(),
  },
]

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