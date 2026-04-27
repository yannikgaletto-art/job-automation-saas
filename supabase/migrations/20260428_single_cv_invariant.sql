-- Single-CV Invariant Migration
--
-- Goal: enforce 1 CV per user at the database level. Eliminates the four
-- parallel sync paths (documents-rows + user_profiles.cv_* + job_queue
-- snapshot + 2-stage resolver) by making "more than one CV" structurally
-- impossible.
--
-- Strategy (Plan A, see CTO analysis 2026-04-27):
--   1. Backup affected rows to recovery tables (rollback path).
--   2. Add cv_migration_seen_at column for the post-migration banner.
--   3. Drop every CV document that is NOT the user's current master
--      (master = file path stored in user_profiles.cv_original_file_path).
--   4. Add a partial unique index so a 2nd CV insert fails with 23505.
--
-- Wrapped in BEGIN/COMMIT explicitly: even if this file is run via the
-- Supabase SQL editor (which does not auto-wrap multi-statement scripts),
-- a mid-flight error rolls back every prior step. Removes the window where
-- the DELETE has run but the UNIQUE INDEX is not yet in place.
--
-- Note on CONCURRENTLY: skipped on purpose. The documents table currently
-- holds ~15 cv rows and the lock window is sub-millisecond. Atomic rollback
-- of backup+delete+index is more valuable here than non-blocking index
-- creation. CONCURRENTLY can be added later via a non-transactional
-- migration once the table grows.
--
-- Storage-file cleanup is intentionally NOT in SQL (Postgres cannot reach
-- Supabase Storage). Run scripts/_cleanup-orphan-cv-storage.ts after the
-- migration applies.
--
-- DSGVO note: the backup tables contain extracted_text + cv_structured_data
-- (PII). Drop them after the verification window passes (see DROP commands
-- at the bottom of this file, kept as comments).

BEGIN;

-- ─── Phase 0.5: Backup tables ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS documents_backup_pre_singlecv AS
    SELECT *, NOW() AS backup_at
    FROM documents
    WHERE document_type = 'cv';

CREATE TABLE IF NOT EXISTS user_profiles_cv_backup_pre_singlecv AS
    SELECT id,
           cv_structured_data,
           cv_original_file_path,
           NOW() AS backup_at
    FROM user_profiles;

-- Lock down the backup tables: enable RLS so authenticated/anon users
-- cannot read the PII inside them. Only service_role bypasses RLS, which
-- is what scripts/_cleanup-orphan-cv-storage.ts uses.
ALTER TABLE documents_backup_pre_singlecv ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles_cv_backup_pre_singlecv ENABLE ROW LEVEL SECURITY;

-- ─── Phase 11 prep: banner-seen tracker ──────────────────────────────
-- Strategy: existing non-impacted users + every future user is auto-seen
-- (cv_migration_seen_at = NOW()), so only the impacted users with >1 CV
-- pre-migration get a NULL value and see the banner.
ALTER TABLE user_profiles
    ADD COLUMN IF NOT EXISTS cv_migration_seen_at TIMESTAMPTZ;

-- Backfill all non-impacted users so they don't see the banner.
UPDATE user_profiles
SET cv_migration_seen_at = NOW()
WHERE cv_migration_seen_at IS NULL
  AND id NOT IN (
      SELECT user_id
      FROM documents_backup_pre_singlecv
      WHERE document_type = 'cv'
      GROUP BY user_id
      HAVING COUNT(*) > 1
  );

-- Future inserts auto-mark as seen (no banner).
ALTER TABLE user_profiles
    ALTER COLUMN cv_migration_seen_at SET DEFAULT NOW();

-- ─── Phase 1 core: drop non-master CV documents ──────────────────────
-- Defensive design: only delete rows for users whose master pointer
-- actually resolves to an existing CV. If the master pointer is NULL or
-- broken, keep ALL of that user's CVs untouched (they need manual
-- resolution; the audit script flagged 0 such users on prod).
DELETE FROM documents AS d
WHERE d.document_type = 'cv'
  AND EXISTS (
      SELECT 1
      FROM user_profiles AS p
      JOIN documents AS d_master
        ON d_master.user_id = p.id
       AND d_master.document_type = 'cv'
       AND d_master.file_url_encrypted = p.cv_original_file_path
      WHERE p.id = d.user_id
  )
  AND d.file_url_encrypted IS DISTINCT FROM (
      SELECT cv_original_file_path
      FROM user_profiles
      WHERE id = d.user_id
  );

-- ─── Phase 1 invariant: enforce 1 CV per user ────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS one_cv_per_user
    ON documents (user_id)
    WHERE document_type = 'cv';

COMMIT;

-- Smoke check: this query MUST return zero rows post-migration.
-- (Kept as a comment so it does not run, but documented for verification.)
-- SELECT user_id, COUNT(*)
-- FROM documents
-- WHERE document_type = 'cv'
-- GROUP BY user_id
-- HAVING COUNT(*) > 1;

-- ─── Cleanup AFTER verification window passes (run manually) ─────────
-- After 7-30 days of stable operation, drop the backup tables to free
-- DSGVO-relevant PII storage. Do not drop earlier — they are the only
-- rollback path.
--
--   DROP TABLE IF EXISTS documents_backup_pre_singlecv;
--   DROP TABLE IF EXISTS user_profiles_cv_backup_pre_singlecv;
