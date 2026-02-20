-- Migration 012: Update documents.pii_encrypted from BYTEA to JSONB

-- Drop the column and recreate as jsonb to safely handle the transition without hex/byte encoding errors
ALTER TABLE documents
ALTER COLUMN pii_encrypted TYPE jsonb USING '{}'::jsonb;
