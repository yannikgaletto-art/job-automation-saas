-- ============================================
-- AUTO-CREATE USER PROFILE ON SIGNUP
-- ============================================
-- This trigger automatically creates a user_profiles entry
-- when a new user signs up via Supabase Auth

CREATE OR REPLACE FUNCTION create_user_profile()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_profiles (id, pii_encrypted, encryption_key_version)
  VALUES (
    NEW.id,
    E'\\x00'::bytea,  -- Placeholder, will be updated during onboarding
    1
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_user_profile();

-- ============================================
-- VERIFICATION
-- ============================================
-- To verify this trigger works:
-- 1. Sign up a new user via the signup page
-- 2. Run: SELECT * FROM user_profiles WHERE id = 'user_id';
-- 3. Should see a row with placeholder pii_encrypted
