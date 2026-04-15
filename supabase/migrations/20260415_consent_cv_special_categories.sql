-- ============================================
-- CONSENT: Add cv_special_categories type
-- DSGVO Art. 9: Besondere Kategorien personenbezogener Daten
-- Date: 2026-04-15
-- ============================================
-- IMPORTANT: This migration MUST be deployed BEFORE the frontend code
-- that sends cv_special_categories consent records!

ALTER TABLE consent_history DROP CONSTRAINT IF EXISTS consent_history_document_type_check;
ALTER TABLE consent_history ADD CONSTRAINT consent_history_document_type_check
  CHECK (document_type IN (
    'privacy_policy', 'terms_of_service', 'ai_processing',
    'cookies', 'coaching_ai', 'cv_special_categories'
  ));
