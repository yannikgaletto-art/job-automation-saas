-- ============================================
-- Kalender-Task-Sync: Tasks table + user settings
-- ============================================

-- Tasks table for timeblocking and focus mode
CREATE TABLE IF NOT EXISTS public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Optional relation to job queue (tasks often come from applications)
  job_queue_id UUID REFERENCES public.job_queue(id) ON DELETE SET NULL,

  -- Core fields
  title TEXT NOT NULL,
  estimated_minutes INTEGER DEFAULT 60,

  -- Status flow: inbox → scheduled → focus → in_progress → completed | carry_over
  status TEXT DEFAULT 'inbox' CHECK (status IN (
    'inbox', 'scheduled', 'focus', 'in_progress', 'completed', 'carry_over'
  )),

  -- Scheduling (stored as UTC, frontend converts to local timezone)
  scheduled_start TIMESTAMPTZ,
  scheduled_end TIMESTAMPTZ,

  -- Focus mode
  pomodoros_completed INTEGER DEFAULT 0,
  notes TEXT,
  completed_at TIMESTAMPTZ,

  -- Optional progress tracking (never mandatory)
  progress_percent INTEGER CHECK (progress_percent IS NULL OR (progress_percent BETWEEN 0 AND 100)),
  progress_note TEXT,

  -- Carry-over
  carry_over_to DATE,
  carry_over_count INTEGER DEFAULT 0,  -- Track how often this task was deferred (MVP stat)

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own tasks" ON public.tasks;
CREATE POLICY "Users can manage own tasks" ON public.tasks
  FOR ALL USING (auth.uid() = user_id);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_tasks_scheduled_start
  ON public.tasks (user_id, scheduled_start)
  WHERE status IN ('scheduled', 'focus', 'in_progress');

CREATE INDEX IF NOT EXISTS idx_tasks_carry_over
  ON public.tasks (user_id, carry_over_to)
  WHERE status = 'carry_over';

CREATE INDEX IF NOT EXISTS idx_tasks_inbox
  ON public.tasks (user_id, created_at DESC)
  WHERE status = 'inbox';

-- User preference for skipping focus confirmation modal
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS skip_focus_confirmation BOOLEAN DEFAULT false;
