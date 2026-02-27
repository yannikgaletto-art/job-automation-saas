-- Migration: Add 'cv_optimized' and 'cv_matched' to job_queue status check constraint
-- Run this in Supabase SQL Editor

-- Drop the existing constraint
ALTER TABLE job_queue DROP CONSTRAINT IF EXISTS job_queue_status_check;

-- Re-create with the new statuses included
ALTER TABLE job_queue ADD CONSTRAINT job_queue_status_check
    CHECK (status IN (
        'pending',
        'processing',
        'ready_for_review',
        'cv_matched',
        'cv_optimized',
        'ready_to_apply',
        'submitted',
        'rejected',
        'archived'
    ));
