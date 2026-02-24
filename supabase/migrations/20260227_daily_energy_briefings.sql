-- ============================================
-- Dashboard Navigation: Daily Energy + Briefings
-- ============================================

-- Energie-Tracking (Morning Briefing)
CREATE TABLE IF NOT EXISTS public.daily_energy (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  date        DATE NOT NULL,
  energy      INTEGER CHECK (energy BETWEEN 1 AND 5),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);

-- Briefing cache (one per user per day)
CREATE TABLE IF NOT EXISTS public.daily_briefings (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  date        DATE NOT NULL,
  message     TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);

-- RLS
ALTER TABLE public.daily_energy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_briefings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_energy" ON public.daily_energy
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "own_briefings" ON public.daily_briefings
  FOR ALL USING (auth.uid() = user_id);
