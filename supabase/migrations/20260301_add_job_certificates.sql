-- Migration: Add job_certificates table for Weiterbildung & Zertifizierung feature
-- AGENT_7.1.1 — supabase/migrations/ (NICHT database/migrations/)

CREATE TABLE IF NOT EXISTS job_certificates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id        UUID NOT NULL REFERENCES job_queue(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recommendations JSONB,
  summary_text  TEXT,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for fast lookups
CREATE INDEX idx_job_certificates_job_id ON job_certificates(job_id);
CREATE INDEX idx_job_certificates_user_id ON job_certificates(user_id);

-- RLS: PFLICHT (Contract §3 — user_id scoped)
ALTER TABLE job_certificates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see only own certificates"
  ON job_certificates FOR ALL
  USING (auth.uid() = user_id);
