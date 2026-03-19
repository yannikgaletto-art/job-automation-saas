-- ============================================
-- DSGVO Phase 1 — Migration 2: Automatische Retention Policies via pg_cron
--
-- Zweck: Sensible Raw-Daten werden nach definierten Fristen 
--         automatisch anonymisiert oder gelöscht.
--
-- Jobs:
--   1. anonymize-coaching-daily  (03:00 UTC) — 90d anonymize, 180d delete
--   2. cleanup-serpapi-weekly    (04:00 UTC Mo) — 30d serpapi_raw NULL
--   3. cleanup-firecrawl-weekly  (05:00 UTC Di) — 14d firecrawl_markdown NULL
--
-- Sicherheitsprinzipien:
--   - Nur Terminal-States (submitted/rejected/archived) werden berührt
--   - active-Sessions werden NIEMALS angefasst
--   - Alle Jobs sind idempotent: prüft cron.job-Tabelle vor unschedule
--   - pg_cron läuft mit Superuser-Rechten (RLS-Bypass) — notwendig für 
--     cross-user Cleanup. Alle SQL-Statements sind hardcodiert, kein 
--     dynamischer Input = kein Injection-Risiko.
--
-- QA-Fix 2026-03-19:
--   1. cron.unschedule() wirft ERROR wenn Job nicht existiert.
--      Lösung: DO $$ Block prüft cron.job-Tabelle vor unschedule().
--   2. PERFORM ist nur in PL/pgSQL gültig, nicht auf SQL top-level.
--      Lösung: Alle schedule/unschedule Calls in DO $$ ... $$ Blöcke.
-- ============================================

-- ┌──────────────────────────────────────────────────────────────────────┐
-- │  Job 1: Coaching Session Anonymisierung + Löschung                  │
-- └──────────────────────────────────────────────────────────────────────┘

CREATE OR REPLACE FUNCTION anonymize_expired_coaching()
RETURNS void AS $$
BEGIN
    -- Stufe 1: 90 Tage — Inhalt anonymisieren, Metadaten behalten
    UPDATE coaching_sessions
    SET conversation_history = '[]'::jsonb,
        coaching_dossier = NULL
    WHERE session_status IN ('completed', 'abandoned')
      AND conversation_history != '[]'::jsonb  -- Nur wenn noch nicht anonymisiert
      AND (
          completed_at < NOW() - INTERVAL '90 days'
          OR (completed_at IS NULL AND created_at < NOW() - INTERVAL '90 days')
      );

    -- Stufe 2: 180 Tage — Vollständige Löschung
    DELETE FROM coaching_sessions
    WHERE session_status IN ('completed', 'abandoned')
      AND (
          completed_at < NOW() - INTERVAL '180 days'
          OR (completed_at IS NULL AND created_at < NOW() - INTERVAL '180 days')
      );
END;
$$ LANGUAGE plpgsql;

-- Idempotent schedule (unschedule nur wenn Job bereits existiert)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'anonymize-coaching-daily') THEN
        PERFORM cron.unschedule('anonymize-coaching-daily');
    END IF;
    PERFORM cron.schedule(
        'anonymize-coaching-daily',
        '0 3 * * *',
        'SELECT anonymize_expired_coaching()'
    );
    RAISE NOTICE 'Cron job anonymize-coaching-daily registriert.';
END;
$$;

-- ┌──────────────────────────────────────────────────────────────────────┐
-- │  Job 2: SerpAPI Raw-Data Cleanup (30 Tage, nur Terminal-States)     │
-- └──────────────────────────────────────────────────────────────────────┘

CREATE OR REPLACE FUNCTION cleanup_serpapi_raw()
RETURNS void AS $$
BEGIN
    UPDATE job_queue
    SET serpapi_raw = NULL
    WHERE serpapi_raw IS NOT NULL
      AND status IN ('submitted', 'rejected', 'archived')
      AND created_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-serpapi-weekly') THEN
        PERFORM cron.unschedule('cleanup-serpapi-weekly');
    END IF;
    PERFORM cron.schedule(
        'cleanup-serpapi-weekly',
        '0 4 * * 1',  -- Montags 04:00 UTC
        'SELECT cleanup_serpapi_raw()'
    );
    RAISE NOTICE 'Cron job cleanup-serpapi-weekly registriert.';
END;
$$;

-- ┌──────────────────────────────────────────────────────────────────────┐
-- │  Job 3: Firecrawl Markdown Cleanup (14 Tage, nur Terminal-States)   │
-- └──────────────────────────────────────────────────────────────────────┘

CREATE OR REPLACE FUNCTION cleanup_firecrawl_markdown()
RETURNS void AS $$
BEGIN
    UPDATE job_queue
    SET firecrawl_markdown = NULL
    WHERE firecrawl_markdown IS NOT NULL
      AND status IN ('submitted', 'rejected', 'archived')
      AND created_at < NOW() - INTERVAL '14 days';
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-firecrawl-weekly') THEN
        PERFORM cron.unschedule('cleanup-firecrawl-weekly');
    END IF;
    PERFORM cron.schedule(
        'cleanup-firecrawl-weekly',
        '0 5 * * 2',  -- Dienstags 05:00 UTC
        'SELECT cleanup_firecrawl_markdown()'
    );
    RAISE NOTICE 'Cron job cleanup-firecrawl-weekly registriert.';
END;
$$;
