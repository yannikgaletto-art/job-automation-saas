-- Video Approach Feature: video_approaches table
-- Stores video tokens, talking points, and upload metadata
-- QR-Code on CV links to pathly.app/v/{access_token}

CREATE TABLE IF NOT EXISTS video_approaches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES job_queue(id) ON DELETE CASCADE,
  
  -- Token for public access (QR-Code URL)
  access_token UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  
  -- Video metadata
  storage_path TEXT,                    -- NULL until video uploaded
  status TEXT NOT NULL DEFAULT 'token_created'
    CHECK (status IN ('token_created', 'prompts_ready', 'uploaded', 'expired')),
  
  -- AI-generated talking points
  talking_points JSONB,                 -- { items: [{ label, text }] }
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  uploaded_at TIMESTAMPTZ,              -- When video was uploaded
  expires_at TIMESTAMPTZ,               -- uploaded_at + 14 days
  
  UNIQUE(user_id, job_id)               -- Max 1 video per job per user
);

-- RLS (PFLICHT — SICHERHEITSARCHITEKTUR.md §3)
ALTER TABLE video_approaches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own videos"
  ON video_approaches FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Index for token lookup (public access via QR)
CREATE INDEX idx_video_token ON video_approaches(access_token);

-- Index for cleanup job (find expired videos)
CREATE INDEX idx_video_expires ON video_approaches(expires_at) 
  WHERE status = 'uploaded';
