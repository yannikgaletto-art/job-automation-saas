-- ============================================================
-- User Feedback (Feedback Voice Feature)
-- DSGVO-compliant: EU-only storage (Supabase Frankfurt)
-- RLS: Users can INSERT own feedback, cannot SELECT/UPDATE/DELETE
-- ON DELETE CASCADE: Right to erasure (Art. 17 DSGVO)
-- ============================================================

CREATE TABLE IF NOT EXISTS user_feedback (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feedback    TEXT NOT NULL CHECK (char_length(feedback) >= 10 AND char_length(feedback) <= 5000),
  name        TEXT,
  locale      TEXT DEFAULT 'de' CHECK (locale IN ('de', 'en', 'es')),
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Index for admin queries (Yannik reads feedback via Supabase Dashboard)
CREATE INDEX idx_user_feedback_created ON user_feedback (created_at DESC);

-- RLS: Users can only insert their own feedback, nothing else
ALTER TABLE user_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_can_insert_own_feedback"
  ON user_feedback
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- No SELECT/UPDATE/DELETE policy for users = they cannot read back or modify feedback
-- Admin access via service_role key in Supabase Dashboard
