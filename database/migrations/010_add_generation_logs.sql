-- Migration: Add generation_logs table for cover letter generation quality tracking
-- Created: 2026-02-16
-- Description: Tracks quality scores, model usage, and costs for each generation iteration
--              Enables monitoring of quality trends and cost optimization

CREATE TABLE IF NOT EXISTS generation_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES job_queue(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    iteration INTEGER NOT NULL,
    model_name TEXT NOT NULL,
    
    -- Quality Scores (from quality-judge)
    overall_score NUMERIC(3,1),
    naturalness_score NUMERIC(3,1),
    style_match_score NUMERIC(3,1),
    company_relevance_score NUMERIC(3,1),
    individuality_score NUMERIC(3,1),
    
    -- Quality Feedback
    issues TEXT[],
    suggestions TEXT[],
    
    -- Validation Results
    validation_passed BOOLEAN,
    word_count INTEGER,
    
    -- Generated Content
    generated_text TEXT NOT NULL,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_generation_logs_job ON generation_logs(job_id);
CREATE INDEX idx_generation_logs_user ON generation_logs(user_id);
CREATE INDEX idx_generation_logs_created ON generation_logs(created_at DESC);
CREATE INDEX idx_generation_logs_model ON generation_logs(model_name);

-- RLS Policies
ALTER TABLE generation_logs ENABLE ROW LEVEL SECURITY;

-- Users can view their own generation logs
CREATE POLICY "Users can view own generation logs"
    ON generation_logs
    FOR SELECT
    USING (auth.uid() = user_id);

-- Service role can insert generation logs
CREATE POLICY "Service can insert generation logs"
    ON generation_logs
    FOR INSERT
    WITH CHECK (true);

-- Comment for documentation
COMMENT ON TABLE generation_logs IS 'Tracks quality scores and costs for each cover letter generation iteration';