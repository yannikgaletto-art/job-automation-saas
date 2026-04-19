-- ============================================================
-- Migration: 20260419_video_bucket_and_update_policy.sql
--
-- Fixes:
--   1. Ensure 'videos' storage bucket exists (idempotent)
--   2. Add missing UPDATE policy for re-record/upsert flows
--      (Supabase signed URLs use PUT which is an upsert — 
--       the existing INSERT-only policy blocks re-uploads)
-- ============================================================

-- §1: Create 'videos' bucket if it doesn't exist yet.
-- private=true: files are NOT publicly accessible by URL.
-- Access is only via signed URLs generated server-side (admin client).
-- file_size_limit: 100MB per file (1min@1.5 Mbps ≈ 11MB, very generous)
-- allowed_mime_types: allow both webm (Chrome/FF) and mp4 (Safari/iOS)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'videos',
  'videos',
  false,
  104857600, -- 100 MB
  ARRAY['video/webm', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=h264', 'video/webm;codecs=vp8']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types,
  public = false; -- Ensure bucket stays private

-- §2: Add UPDATE policy (missing — causes re-record PUT to fail)
-- Signed URLs use PUT which becomes an upsert internally.
-- Without UPDATE policy, Supabase RLS blocks any overwrite.
DROP POLICY IF EXISTS "Users can update own videos" ON storage.objects;
CREATE POLICY "Users can update own videos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'videos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'videos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Note: Signed upload URLs (created by service_role admin client) BYPASS RLS.
-- The primary upload flow works without these policies.
-- These RLS policies exist for:
--   1. Defense-in-depth (if someone uploads via client library directly)
--   2. Audit clarity (explicit contract of who can do what)
--   3. Re-record flows where client-direct operations might occur
