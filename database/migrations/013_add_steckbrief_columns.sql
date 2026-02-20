-- Add Steckbrief columns for rich UI display
ALTER TABLE job_queue
  ADD COLUMN IF NOT EXISTS responsibilities JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS summary TEXT,
  ADD COLUMN IF NOT EXISTS seniority TEXT,
  ADD COLUMN IF NOT EXISTS benefits JSONB DEFAULT '[]';

INSERT INTO schema_version (version) VALUES ('3.3') ON CONFLICT DO NOTHING;
