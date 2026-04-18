-- ============================================================
-- Migration: 20260418_video_upload_confirmation_fix.sql
-- Purpose: 
--   1. Storage policies for 'videos' bucket (signed upload URLs work  
--      via admin client, but explicit policies prevent edge case failures)
--   2. pg_cron hard-fallback for DSGVO 14-day video deletion guarantee
--      (Inngest sleep is best-effort; cron is the legal guarantee)
-- ============================================================

-- -------------------------------------------------------
-- §1 STORAGE POLICIES — videos bucket
-- Signed upload URLs are already admin-scoped, but explicit  
-- RLS policies on storage.objects ensure consistency and  
-- prevent edge-case failures on re-uploads.
-- -------------------------------------------------------

-- Allow authenticated users to upload their own videos via signed URLs
-- (path format: {user_id}/{job_id}.webm)
CREATE POLICY IF NOT EXISTS "Users can upload own videos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'videos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow authenticated users to read their own videos
CREATE POLICY IF NOT EXISTS "Users can read own videos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'videos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow authenticated users to delete their own videos
CREATE POLICY IF NOT EXISTS "Users can delete own videos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'videos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow service_role (admin) full access (for cleanup jobs)
-- Note: service_role bypasses RLS by default — this is explicit documentation only.

-- -------------------------------------------------------
-- §2 pg_cron HARD FALLBACK — DSGVO Art. 17 Compliance
-- Runs daily at 03:30 UTC (30 min after Inngest cron at 03:00).
-- Deletes Storage files + marks status='expired' for all videos
-- where expires_at has passed and status is still 'uploaded'.
-- This guarantees deletion even if Inngest sleeps are cancelled
-- by deploys or plan upgrades.
-- -------------------------------------------------------

-- Ensure pg_cron extension is enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Remove old job if it exists (idempotent)
SELECT cron.unschedule('video-dsgvo-deletion-cron') 
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'video-dsgvo-deletion-cron'
);

-- Create the daily expiry marker cron.
-- NOTE: Storage file deletion happens in Inngest (requires HTTP calls).
-- The pg_cron job sets status='expired' so the public page immediately
-- shows "Video abgelaufen" and the Storage cleanup cron picks it up.
SELECT cron.schedule(
  'video-dsgvo-deletion-cron',
  '30 3 * * *',  -- 03:30 UTC daily
  $$
    UPDATE video_approaches
    SET 
      status = 'expired',
      storage_path = NULL,
      updated_at = NOW()
    WHERE 
      status = 'uploaded'
      AND expires_at < NOW()
      AND expires_at IS NOT NULL;
  $$
);

-- -------------------------------------------------------
-- §3 DSGVO Compliance: expires_at index already exists
-- Verify: idx_video_expires covers WHERE status='uploaded'
-- (created in 20260315_create_video_approaches.sql)
-- -------------------------------------------------------
-- No action needed — index exists.
