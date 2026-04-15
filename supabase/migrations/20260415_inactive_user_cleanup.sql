-- ============================================
-- Inactive User Data Cleanup (pg_cron)
-- DSGVO Art. 5(1)(e): Speicherbegrenzung
-- Date: 2026-04-15
-- ============================================
-- Deletes data for users inactive > 12 months.
-- PRESERVES: user_settings, consent_history, credit_events (audit trail).
-- Does NOT delete the auth user — only application data.

CREATE OR REPLACE FUNCTION cleanup_inactive_user_data()
RETURNS void AS $$
DECLARE
  inactive_threshold INTERVAL := '12 months';
  r RECORD;
  deleted_count INTEGER := 0;
BEGIN
  FOR r IN
    SELECT user_id FROM user_settings
    WHERE last_active_at < now() - inactive_threshold
      AND last_active_at IS NOT NULL
  LOOP
    -- Delete in dependency order (leaf tables first)
    DELETE FROM generation_logs WHERE user_id = r.user_id;
    DELETE FROM validation_logs WHERE user_id = r.user_id;
    DELETE FROM coaching_sessions WHERE user_id = r.user_id;
    DELETE FROM job_certificates WHERE user_id = r.user_id;
    DELETE FROM video_scripts WHERE user_id = r.user_id;
    DELETE FROM video_approaches WHERE user_id = r.user_id;
    DELETE FROM script_block_templates WHERE user_id = r.user_id;
    DELETE FROM mood_checkins WHERE user_id = r.user_id;
    DELETE FROM daily_energy WHERE user_id = r.user_id;
    DELETE FROM daily_briefings WHERE user_id = r.user_id;
    DELETE FROM pomodoro_sessions WHERE user_id = r.user_id;
    DELETE FROM tasks WHERE user_id = r.user_id;
    DELETE FROM community_upvotes WHERE user_id = r.user_id;
    DELETE FROM community_comments WHERE user_id = r.user_id;
    DELETE FROM community_posts WHERE user_id = r.user_id;
    DELETE FROM volunteering_bookmarks WHERE user_id = r.user_id;
    DELETE FROM volunteering_votes WHERE user_id = r.user_id;
    DELETE FROM application_history WHERE user_id = r.user_id;
    DELETE FROM company_research WHERE user_id = r.user_id;
    DELETE FROM saved_job_searches WHERE user_id = r.user_id;
    DELETE FROM job_queue WHERE user_id = r.user_id;
    DELETE FROM documents WHERE user_id = r.user_id;

    -- NOTE: We intentionally keep:
    -- - user_settings (needed for the last_active_at check itself)
    -- - consent_history (DSGVO Art. 7 audit trail)
    -- - credit_events (DSGVO Art. 15 audit trail)
    -- - user_credits (billing state)
    -- - user_profiles (minimal, needed for account)

    deleted_count := deleted_count + 1;
  END LOOP;

  IF deleted_count > 0 THEN
    RAISE NOTICE '[cleanup_inactive_user_data] Cleaned % inactive user(s)', deleted_count;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule: Every Sunday at 04:00 UTC
-- pg_cron must be enabled in Supabase Dashboard → Database → Extensions
SELECT cron.schedule(
  'cleanup-inactive-users-weekly',
  '0 4 * * 0',
  'SELECT cleanup_inactive_user_data()'
);
