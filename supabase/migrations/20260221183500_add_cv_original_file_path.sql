ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS cv_original_file_path TEXT;
