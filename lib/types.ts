export interface Job {
  id: string
  company: string
  title: string
  matchScore: number
  status: 'NEW' | 'JOB_REVIEWED' | 'CV_CHECKED' | 'CV_OPTIMIZED' | 'CL_GENERATED'
  location?: string
  salary?: string
  createdAt: string
}