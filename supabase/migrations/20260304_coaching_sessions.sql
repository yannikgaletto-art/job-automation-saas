-- ============================================
-- COACHING SESSIONS (Text-Chat Mock Interview)
-- Version: 1.0
-- Date: 2026-03-04
-- ============================================

CREATE TABLE IF NOT EXISTS coaching_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES job_queue(id) ON DELETE CASCADE,

  -- Session State
  session_status TEXT DEFAULT 'active' CHECK (session_status IN ('active', 'completed', 'abandoned')),

  -- Conversation Data
  conversation_history JSONB DEFAULT '[]'::jsonb,
  coaching_dossier JSONB,  -- Gap-Analyse: { strengths, gaps, interviewQuestions, companyContext }

  -- Report (generated after session ends via Inngest)
  feedback_report TEXT,
  coaching_score INTEGER CHECK (coaching_score BETWEEN 1 AND 10),

  -- Tracking
  turn_count INTEGER DEFAULT 0,
  duration_seconds INTEGER,
  tokens_used INTEGER DEFAULT 0,
  cost_cents INTEGER DEFAULT 0,
  prompt_version TEXT DEFAULT 'v1',
  max_questions INTEGER DEFAULT 5 CHECK (max_questions BETWEEN 1 AND 5),
  interview_round TEXT DEFAULT 'kennenlernen' CHECK (interview_round IN ('kennenlernen', 'deep_dive', 'case_study')),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_coaching_sessions_user ON coaching_sessions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coaching_sessions_job ON coaching_sessions(job_id);
CREATE INDEX IF NOT EXISTS idx_coaching_sessions_status ON coaching_sessions(session_status)
  WHERE session_status = 'active';

-- Row Level Security
ALTER TABLE coaching_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own coaching sessions"
  ON coaching_sessions FOR ALL
  USING (auth.uid() = user_id);

-- Extend consent_history CHECK constraint to include 'coaching_ai'
-- Use DROP + ADD since ALTER CHECK is not directly supported
ALTER TABLE consent_history DROP CONSTRAINT IF EXISTS consent_history_document_type_check;
ALTER TABLE consent_history ADD CONSTRAINT consent_history_document_type_check
  CHECK (document_type IN (
    'privacy_policy', 'terms_of_service', 'ai_processing', 'cookies', 'coaching_ai'
  ));
