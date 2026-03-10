-- Migration: Deprecate classic and modern templates → valley
-- Run ONCE: After deploying CV Generation Engine V2 (2026-03-10)
-- Safe to run multiple times (idempotent via WHERE clause)

UPDATE job_queue
SET preferred_template = 'valley'
WHERE preferred_template IN ('classic', 'modern');

-- Verify result:
-- SELECT preferred_template, COUNT(*) FROM job_queue GROUP BY preferred_template;
