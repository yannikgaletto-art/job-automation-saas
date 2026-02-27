-- Migration: Add company_website column to job_queue
-- Feature: "Link zur Unternehmensseite" im Add-Job-Dialog
-- Nullable: bestehende Jobs ohne company_website funktionieren weiterhin.

ALTER TABLE job_queue ADD COLUMN IF NOT EXISTS company_website TEXT;

COMMENT ON COLUMN job_queue.company_website IS 'Optional company website URL for precise enrichment targeting. Added 2026-02-27.';
