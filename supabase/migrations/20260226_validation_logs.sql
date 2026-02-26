-- ============================================
-- MIGRATION: validation_logs table
-- Reference: AGENT_5.3 Cover Letter Validation
-- ============================================

CREATE TABLE IF NOT EXISTS validation_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES job_queue(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    iteration INTEGER NOT NULL,
    is_valid BOOLEAN NOT NULL,
    errors TEXT[],
    warnings TEXT[],
    word_count INTEGER,
    paragraph_count INTEGER,
    company_mentions INTEGER,
    forbidden_phrase_count INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_validation_logs_job ON validation_logs(job_id);
CREATE INDEX IF NOT EXISTS idx_validation_logs_user ON validation_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_validation_logs_created ON validation_logs(created_at DESC);

ALTER TABLE validation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only access their own validation logs"
  ON validation_logs FOR ALL
  USING (auth.uid() = user_id);
