-- ============================================
-- DSGVO Phase 2 — Audit-Spalten für generation_logs
--
-- Zweck: content_hash und quality_summary ergänzen,
--        damit App-Code sie befüllen kann (Phase 2 PII-Sanitizer).
--
-- ⚠️ DEPLOY ZUERST — vor App-Code-Änderungen.
-- ============================================

ALTER TABLE generation_logs ADD COLUMN IF NOT EXISTS content_hash TEXT;
ALTER TABLE generation_logs ADD COLUMN IF NOT EXISTS quality_summary JSONB;
