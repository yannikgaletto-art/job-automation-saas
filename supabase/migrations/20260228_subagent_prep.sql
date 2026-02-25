-- ============================================
-- Migration 1: Mood Check-in Tracking
-- ============================================
CREATE TABLE IF NOT EXISTS public.mood_checkins (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  mood          INTEGER CHECK (mood BETWEEN 1 AND 5) NOT NULL,
  context       TEXT, -- 'morning' | 'midday' | 'evening'
  note          TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.mood_checkins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_checkins" ON public.mood_checkins FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- Migration 2: Onboarding Status (user_settings)
-- Create table if it doesn't exist, then add columns
-- ============================================
CREATE TABLE IF NOT EXISTS public.user_settings (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "own_settings" ON public.user_settings FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS onboarding_completed   BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_step        INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_mood_checkin_at    TIMESTAMPTZ;

-- ============================================
-- Migration 3: Job Search Persistenz
-- ============================================
CREATE TABLE IF NOT EXISTS public.saved_job_searches (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  query         TEXT NOT NULL,
  location      TEXT,
  filters       JSONB DEFAULT '{}',
  results       JSONB DEFAULT '[]',
  result_count  INTEGER DEFAULT 0,
  fetched_at    TIMESTAMPTZ DEFAULT now(),
  created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_search_user_query
  ON public.saved_job_searches (user_id, query, location);
ALTER TABLE public.saved_job_searches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_searches" ON public.saved_job_searches FOR ALL USING (auth.uid() = user_id);

-- Deduplizierung: job_queue braucht source_url + active_cv_id
ALTER TABLE public.job_queue
  ADD COLUMN IF NOT EXISTS source_url    TEXT,
  ADD COLUMN IF NOT EXISTS active_cv_id  UUID;
CREATE UNIQUE INDEX IF NOT EXISTS idx_jobqueue_user_url
  ON public.job_queue (user_id, source_url)
  WHERE source_url IS NOT NULL;

-- ============================================
-- Migration 4: CV Tracking in Settings
-- ============================================
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS active_cv_id            UUID,
  ADD COLUMN IF NOT EXISTS active_cv_name           TEXT,
  ADD COLUMN IF NOT EXISTS active_cv_uploaded_at    TIMESTAMPTZ;
