-- ============================================
-- Migration: Add avatar_animal to user_settings
-- Stores the user's selected animal avatar ID (e.g. 'wolf', 'fox', 'eagle')
-- RLS already enabled on user_settings
-- ============================================

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS avatar_animal TEXT;
