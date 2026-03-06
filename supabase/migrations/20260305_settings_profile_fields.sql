-- ============================================
-- Migration: Settings Profile Fields
-- Adds linkedin_url and target_role to user_settings
-- RLS already enabled on user_settings (own_settings policy)
-- ============================================

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS linkedin_url   TEXT,
  ADD COLUMN IF NOT EXISTS target_role    TEXT;
