-- Migration 015: Add submitted_at column to application_history
-- Tracks when user confirms they sent the application (checkbox feature)
ALTER TABLE application_history ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ NULL;
