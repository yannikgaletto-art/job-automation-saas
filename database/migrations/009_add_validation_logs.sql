-- Migration: Add validation_logs table for cover letter validation tracking
-- Created: 2026-02-16
-- Description: Tracks validation results from cover letter generation loop
--              Enables monitoring of validation pass rates and common errors

CREATE TABLE IF NOT EXISTS validation_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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

-- Indexes for performance
CREATE INDEX idx_validation_logs_job ON validation_logs(job_id);
CREATE INDEX idx_validation_logs_user ON validation_logs(user_id);
CREATE INDEX idx_validation_logs_created ON validation_logs(created_at DESC);

-- RLS Policies
ALTER TABLE validation_logs ENABLE ROW LEVEL SECURITY;

-- Users can view their own validation logs
CREATE POLICY "Users can view own validation logs"
    ON validation_logs
    FOR SELECT
    USING (auth.uid() = user_id);

-- Service role can insert validation logs
CREATE POLICY "Service can insert validation logs"
    ON validation_logs
    FOR INSERT
    WITH CHECK (true);

-- Comment for documentation
COMMENT ON TABLE validation_logs IS 'Tracks validation results from cover letter generation (word count, forbidden phrases, etc.)';