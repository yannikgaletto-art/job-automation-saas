-- Video Script Studio: video_scripts + script_block_templates
-- Allows users to create structured scripts before recording their video approach.
-- Lifecycle: independent of video_approaches (script can exist without video).

-- ============================================
-- Table 1: video_scripts
-- ============================================
CREATE TABLE IF NOT EXISTS video_scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES job_queue(id) ON DELETE CASCADE,

  -- Script mode
  mode TEXT NOT NULL DEFAULT 'bullets' CHECK (mode IN ('teleprompter', 'bullets')),

  -- Structured blocks (JSONB array of block objects)
  -- Schema: [{ id, templateId, title, durationSeconds, isRequired, content, sortOrder }]
  blocks JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Keywords the user has covered in their script text
  keywords_covered TEXT[] DEFAULT '{}',

  -- Categorized keywords from generate route (cached to avoid re-calling AI)
  categorized_keywords JSONB,  -- { mustHave: [], niceToHave: [], companySpecific: [] }

  -- Teleprompter scroll speed
  wpm_speed INTEGER DEFAULT 130,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- 1 script per job per user
  UNIQUE(user_id, job_id)
);

-- RLS (PFLICHT — SICHERHEITSARCHITEKTUR.md §3)
ALTER TABLE video_scripts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own scripts"
  ON video_scripts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- updated_at Trigger (reuses existing update_updated_at function)
DROP TRIGGER IF EXISTS trigger_video_scripts_updated_at ON video_scripts;
CREATE TRIGGER trigger_video_scripts_updated_at
  BEFORE UPDATE ON video_scripts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Index for fast lookup by user + job
CREATE INDEX idx_video_scripts_user_job ON video_scripts(user_id, job_id);

-- ============================================
-- Table 2: script_block_templates
-- ============================================
CREATE TABLE IF NOT EXISTS script_block_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  is_system BOOLEAN NOT NULL DEFAULT false,
  is_required BOOLEAN NOT NULL DEFAULT false,
  default_duration_seconds INTEGER NOT NULL DEFAULT 15,
  sort_order INTEGER NOT NULL DEFAULT 0,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE, -- NULL = system template
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(name, is_system, user_id)  -- System: (name, true, NULL). Custom: (name, false, uuid)
);

-- RLS with separate policies to prevent NULL-user_id bypass (QA-Fix)
ALTER TABLE script_block_templates ENABLE ROW LEVEL SECURITY;

-- Read: system templates (user_id IS NULL) + own custom templates
CREATE POLICY "Read system and own templates"
  ON script_block_templates FOR SELECT
  USING (user_id IS NULL OR auth.uid() = user_id);

-- Write: only own custom templates (explicit per-operation to prevent system template modification)
CREATE POLICY "Insert own custom templates"
  ON script_block_templates FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Update own custom templates"
  ON script_block_templates FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Delete own custom templates"
  ON script_block_templates FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- Seed: System block templates
-- ============================================
INSERT INTO script_block_templates (name, is_system, is_required, default_duration_seconds, sort_order)
VALUES
  ('Vorstellung', true, true, 10, 1),
  ('Motivation', true, false, 15, 2),
  ('Erfahrung', true, false, 20, 3),
  ('Abschluss', true, true, 10, 4)
ON CONFLICT (name, is_system, user_id) DO NOTHING;
