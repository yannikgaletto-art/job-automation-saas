-- ============================================
-- AUTO-CREATE USER PROFILE ON SIGNUP
-- ============================================
-- This trigger automatically creates a user_profiles entry
-- when a new user signs up via Supabase Auth
-- Updated 2026-04-18: Also captures full_name from user_metadata

CREATE OR REPLACE FUNCTION create_user_profile()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_profiles (id, full_name, pii_encrypted, encryption_key_version)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',  -- Captured from signup data
    E'\\x00'::bytea,                        -- Placeholder, updated during onboarding
    1
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- CRITICAL: Never block user creation. Log and continue.
  RAISE WARNING '[create_user_profile] Trigger failed for user %: % (SQLSTATE: %)',
    NEW.id, SQLERRM, SQLSTATE;
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
-- 2. Run: SELECT id, full_name FROM user_profiles WHERE id = 'user_id';
-- 3. Should see a row with the user's full name from signup
