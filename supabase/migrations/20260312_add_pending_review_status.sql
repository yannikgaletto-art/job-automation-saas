-- Migration: Add 'pending_review' status for Steckbrief Preview (§12.5)
-- Jobs from search pipeline land here first so user can verify before queue.

ALTER TABLE job_queue DROP CONSTRAINT IF EXISTS job_queue_status_check;

ALTER TABLE job_queue ADD CONSTRAINT job_queue_status_check
    CHECK (status IN (
        'pending_review',
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
