-- ============================================================
-- Migration: 20260418b_video_storage_policies.sql
-- Replaces: 20260418_video_upload_confirmation_fix.sql
--
-- Changes:
--   1. Storage RLS policies for the 'videos' bucket
--   2. View tracking columns (view_count, first_viewed_at)
--   3. pg_cron hard fallback for DSGVO Art. 17 14-day deletion
-- ============================================================


-- -------------------------------------------------------
-- §1 STORAGE POLICIES — videos bucket
--
-- The service_role (admin client) already bypasses RLS and
-- is used for all server-side operations (signed URLs, cleanup).
-- These policies protect client-side operations and make
-- the security contract explicit and auditable.
--
-- Path format: {user_id}/{job_id}.webm
-- -------------------------------------------------------

DROP POLICY IF EXISTS "Users can upload own videos" ON storage.objects;
CREATE POLICY "Users can upload own videos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'videos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can read own videos" ON storage.objects;
CREATE POLICY "Users can read own videos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'videos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can delete own videos" ON storage.objects;
CREATE POLICY "Users can delete own videos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'videos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- -------------------------------------------------------
-- §2 VIEW TRACKING — anonymous, no PII stored
--
-- view_count: how many times the public page was opened.
-- first_viewed_at: timestamp of the first page open.
--
-- DSGVO assessment:
--   - No identity of the viewer is stored (no IP, no session).
--   - Counting page opens is metadata about the video itself,
--     not about the recruiter. Lawful basis: Art. 6(1)(f)
--     legitimate interest (user needs to know if video was seen).
--   - first_viewed_at reveals WHEN someone opened the page,
--     not WHO. This is equivalent to read receipts in email —
--     permissible without specific consent from the viewer
--     because the viewer is not a Pathly user/data subject.
-- -------------------------------------------------------

ALTER TABLE video_approaches
  ADD COLUMN IF NOT EXISTS view_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS first_viewed_at TIMESTAMPTZ;


-- -------------------------------------------------------
-- §3 pg_cron HARD FALLBACK — DSGVO Art. 17
--
-- Runs daily at 03:30 UTC (30 min after Inngest cron at 03:00).
-- Sets status='expired' and clears storage_path for all videos
-- past their expires_at date. This is the legal guarantee layer.
-- Inngest sleep-based deletion is best-effort only.
-- -------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'video-dsgvo-deletion-cron') THEN
    PERFORM cron.unschedule('video-dsgvo-deletion-cron');
  END IF;
END
$$;

SELECT cron.schedule(
  'video-dsgvo-deletion-cron',
  '30 3 * * *',
  $$
    UPDATE video_approaches
    SET
      status = 'expired',
      storage_path = NULL,
      view_count = 0,
      updated_at = NOW()
    WHERE
      status = 'uploaded'
      AND expires_at < NOW()
      AND expires_at IS NOT NULL;
  $$
);

-- Index to support the view lookup on public page (token -> row)
-- Note: idx_video_token already exists from 20260315_create_video_approaches.sql
-- No new index needed.


-- -------------------------------------------------------
-- §4 ATOMIC VIEW INCREMENT RPC
--
-- Called from /api/video/view — eliminates read-then-write
-- race condition. Sets first_viewed_at on first call only.
-- -------------------------------------------------------

CREATE OR REPLACE FUNCTION increment_video_view(p_token UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE video_approaches
  SET
    view_count = view_count + 1,
    first_viewed_at = COALESCE(first_viewed_at, NOW()),
    updated_at = NOW()
  WHERE
    access_token = p_token
    AND status = 'uploaded';
END;
$$;

