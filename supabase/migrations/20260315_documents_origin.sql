-- Batch 2: Data Hygiene — Separate user uploads from AI-generated drafts
-- This column enables filtering in cover-letter setup-data and prevents AI drafts
-- from polluting the style doc picker.

ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS origin TEXT DEFAULT 'upload' 
CHECK (origin IN ('upload', 'generated', 'template'));

-- Create index for efficient filtering by origin
CREATE INDEX IF NOT EXISTS idx_documents_origin ON documents(origin);

-- Backfill: Mark existing AI-generated cover letter drafts
UPDATE documents 
SET origin = 'generated' 
WHERE document_type = 'cover_letter' 
  AND (metadata->>'status' = 'draft' OR metadata->>'generation_id' IS NOT NULL);
