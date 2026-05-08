-- ============================================================
-- Migration: 20260508_document_storage_buckets.sql
--
-- Ensures the private document buckets used by /api/documents/upload exist.
-- The upload, re-parse, download, and delete routes access these buckets only
-- after an authenticated user/document ownership check.
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'cvs',
    'cvs',
    false,
    5000000,
    ARRAY[
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword'
    ]
  ),
  (
    'cover-letters',
    'cover-letters',
    false,
    5000000,
    ARRAY[
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword'
    ]
  )
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types,
  public = false;
