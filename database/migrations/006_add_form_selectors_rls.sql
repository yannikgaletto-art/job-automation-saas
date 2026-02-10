-- ============================================
-- Migration 006: Add RLS Policies to form_selectors
-- Security Fix: Crowdsourced data needs access control
-- ============================================

ALTER TABLE form_selectors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read" 
  ON form_selectors 
  FOR SELECT 
  USING (auth.role() = 'authenticated');

CREATE POLICY "Allow verified users to insert" 
  ON form_selectors 
  FOR INSERT 
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() 
      AND email_verified = true
      AND created_at < NOW() - INTERVAL '7 days'
    )
  );

CREATE POLICY "Only admins can verify" 
  ON form_selectors 
  FOR UPDATE 
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() 
      AND role = 'admin'
    )
  )
  WITH CHECK (verified_by_user_id = auth.uid());
