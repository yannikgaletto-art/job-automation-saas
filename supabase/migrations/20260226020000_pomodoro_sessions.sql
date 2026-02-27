-- ============================================
-- Analytics: Pomodoro Sessions + Heatmap View
-- ============================================

-- Sessions table
CREATE TABLE IF NOT EXISTS public.pomodoro_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- Timing
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  duration_min    SMALLINT NOT NULL CHECK (duration_min IN (25, 50)),

  -- Outcome
  completed       BOOLEAN NOT NULL DEFAULT FALSE,
  aborted_at_pct  SMALLINT CHECK (aborted_at_pct IS NULL OR aborted_at_pct BETWEEN 0 AND 100),

  -- Energy (Lee Harris Layer)
  energy_level    SMALLINT CHECK (energy_level IS NULL OR energy_level BETWEEN 1 AND 5),

  -- Kontext (optional)
  linked_job_id   UUID REFERENCES public.job_queue(id) ON DELETE SET NULL,

  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Performance Index
CREATE INDEX IF NOT EXISTS idx_pomodoro_sessions_user_time
  ON public.pomodoro_sessions (user_id, started_at);

-- RLS
ALTER TABLE public.pomodoro_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "User owns sessions" ON public.pomodoro_sessions
  FOR ALL USING (auth.uid() = user_id);

-- Aggregated Heatmap View
CREATE OR REPLACE VIEW public.pomodoro_heatmap AS
SELECT
  user_id,
  EXTRACT(ISODOW FROM started_at)::INT  AS day_of_week,
  EXTRACT(HOUR FROM started_at)::INT    AS hour_of_day,
  COUNT(*)                              AS session_count,
  COUNT(*) FILTER (WHERE completed)     AS completed_count,
  ROUND(AVG(energy_level))              AS avg_energy
FROM public.pomodoro_sessions
GROUP BY user_id, day_of_week, hour_of_day;
