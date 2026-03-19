-- ============================================
-- DSGVO Phase 1 — Migration 1: generation_logs Klartext-Bereinigung
-- 
-- Zweck: Historische Klartexte aus generation_logs entfernen (DSGVO Art. 5.1e).
--
-- ⚠️ HINWEIS: Bestehender App-Code schreibt weiterhin generated_text.
--             Das Unterbinden neuer Inserts ist Scope Phase 2 (App-Code-Änderungen).
--
-- Betroffene Tabelle: generation_logs
-- Blast Radius: 0 — kein Frontend/API-Code liest generated_text zurück.
--
-- QA-Fix 2026-03-19: DROP NOT NULL Guard entfernt — Spalte war bereits nullable.
--   ALTER COLUMN ... DROP NOT NULL wirft einen Error wenn kein NOT NULL Constraint 
--   existiert. Wir prüfen per information_schema ob ein Constraint vorhanden ist,
--   bevor wir ihn entfernen (defensives SQL).
-- ============================================

-- 1. Alle bestehenden Klartexte auf NULL setzen (idempotent — WHERE guard)
UPDATE generation_logs SET generated_text = NULL WHERE generated_text IS NOT NULL;

-- 2. NOT NULL Constraint entfernen — aber nur wenn er tatsächlich existiert
--    (verhindert ERROR: column "generated_text" is not marked NOT NULL)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'generated_text' IS DISTINCT FROM NULL  -- Typo-Guard
    ) THEN NULL; END IF;

    -- Prüfe ob Spalte NOT NULL constraint hat
    IF (
        SELECT is_nullable FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'generation_logs'
          AND column_name = 'generated_text'
    ) = 'NO' THEN
        ALTER TABLE generation_logs ALTER COLUMN generated_text DROP NOT NULL;
        RAISE NOTICE 'DSGVO P1: generated_text NOT NULL constraint entfernt.';
    ELSE
        RAISE NOTICE 'DSGVO P1: generated_text war bereits nullable — kein ALTER nötig.';
    END IF;
END;
$$;
