-- ============================================
-- Pulse Board: Add source column to tasks
-- Distinguishes manual tasks from pulse-generated tasks
-- ============================================

-- Step 1: Add column with default (lock-free on PG >= 11)
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';

-- Step 2: Add constraint as NOT VALID (idempotent)
DO $$ BEGIN
  ALTER TABLE public.tasks
    ADD CONSTRAINT tasks_source_check
    CHECK (source IN ('manual', 'pulse')) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Step 3: Validate constraint (non-blocking background scan)
ALTER TABLE public.tasks
  VALIDATE CONSTRAINT tasks_source_check;
