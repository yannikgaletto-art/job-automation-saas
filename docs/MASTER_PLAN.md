# Pathly V2.0 - Complete Workflow Implementation Tasks

## 🎯 Goal
Implementierung des kompletten Workflows: Von **Trainingsdaten-Upload** bis **Cover Letter Generation**, mit allen Frontend-, Backend- und API-Integrationen.

---

## Phase 1: Datenerfassung & User Onboarding

### [x] 1.1 DSGVO Consent Screen (Frontend)
- [x] Consent-Komponente mit Checkboxen erstellen
- [x] Validation mit Zod Schema
- [x] Integration in Onboarding-Flow
- [x] API Route für Consent-Speicherung

### [/] 1.2 Document Upload System (Frontend + Backend)
- [x] File Upload Komponente (CV + 2-3 Cover Letters)
- [x] Frontend Validation (max 5MB, PDF/DOCX)
- [/] Supabase Storage Integration (encrypted buckets)
- [x] Progress Indicator für Upload
- [x] Design an Dashboard angepasst (Light Mode)

### [x] 1.3 Document Processing Pipeline (Backend)
- [x] PDF/DOCX Text Extraction Service
- [x] PII Extraction (name, email, phone, address)
- [x] PII Encryption with AES-256-GCM (node crypto)
- [x] CV Metadata Extraction (skills, years_experience)
- [ ] Writing Style Embedding Generation (Phase 5)
- [x] Speicherung in `documents` table

### [x] 1.4 CV Template Selection (Frontend)
- [x] Template Gallery Komponente
- [x] Live Preview mit extrahierten Daten
- [x] Template Speicherung in `user_profiles`

### [x] 1.5 Profile Confirmation (Steckbrief)
- [x] Profile Display Komponente
- [x] Edit Mode für Korrekturen
- [x] Validation \u0026 Speicherung

---

## Phase 2: Job Discovery \u0026 Scraping

### [x] 2.1 Phase 2 — Job Input (Paste Description)
- [x] Job URL Eingabefeld mit Validation (Deprecated)
- [x] Manual Job Entry Formular (Paste Tab)
- [x] Job Queue Display

### [x] 2.2 Automated Scraping
- Status: ❌ Discontinued (MVP)
- Begründung: "Replaced by Paste-first input. Scraping complexity outweighs MVP value. Revisit in V3."

### [x] 2.3 Job Data Extraction
- [x] Structured Data Parser
- [x] Requirements Extraction (JSONB)
- [x] Salary Range Parser
- [x] Location Normalization
- [x] Job Queue INSERT mit Status `pending`

### [x] 2.4 Double-Apply Prevention
- [x] URL Hash Verification
- [x] Company Slug Matching
- [x] Fuzzy Title Matching (pg_trgm)
- [x] User Notification bei Duplicate

---

## Phase 3: Company Intelligence Enrichment

### [x] 3.1 Company Research Service (Backend)
- [x] Service: `lib/services/company-enrichment.ts` (✅ EXISTS)
- [x] Cache Check in `company_research` table
- [x] Perplexity Sonar Pro Integration
- [x] Research Prompt Engineering
  - [x] Company values \u0026 mission
  - [x] Recent news (last 3 months)
  - [x] LinkedIn activity
  - [x] Vision \u0026 strategic goals

### [x] 3.2 Quote Suggestion System
- [x] Quote Discovery via Perplexity
- [x] Relevance Scoring (0-1) with OpenAI Embeddings
- [x] Quote-Company Value Mapping
- [x] Speicherung in `suggested_quotes` JSONB

### [x] 3.3 Company Research Display (Frontend)
- [x] Company Intel Card Komponente
- [x] Quote Selection Interface
- [x] Recent News Display
- [x] Custom Quote Input Option

### [x] 3.4 Cache Management
- [x] 7-Day TTL Implementation
- [x] Cache Hit Rate Monitoring (in-memory)
- [x] Automatic Cleanup via pg_cron
- [x] Exposed in Admin Cost Report API

---

## Phase 4: CV Optimization (Optional für MVP)

### [ ] 4.1 CV Optimization Service
- [ ] API Route: `/api/cv/optimize`
- [ ] Claude Sonnet 4.5 Integration
- [ ] ATS-Gap Analysis
- [ ] Bullet Point Rewriting
- [ ] Skills Section Optimization

### [ ] 4.2 CV Optimization Display (Frontend)
- [ ] Side-by-Side Comparison
- [ ] Diff Highlighting
- [ ] Accept/Reject Changes
- [ ] Download Optimized CV

---

## Phase 5: Cover Letter Generation

### [x] 5.1 Cover Letter Generator (Backend)
- [x] Service: `lib/services/cover-letter-generator.ts` (✅ EXISTS)
- [x] API Route: `/api/cover-letter/generate` (✅ EXISTS)
- [x] API Route: `/api/cover-letter/setup-data` (✅ Phase 1)
- [x] System Prompt Engineering
  - [x] Writing Style Integration
  - [x] Conjunction Requirements ("Daher", "Deshalb")
  - [x] Company Intel Integration
  - [x] User Voice Matching

### [x] 5.2 3-Stage Generation Pipeline (Phase 1 — Wizard Context)
- [x] `CoverLetterSetupContext` Interface (`types/cover-letter-setup.ts`)
- [x] `useCoverLetterSetupStore` Zustand Store (`store/useCoverLetterSetupStore.ts`)
- [x] Setup Wizard — 3 Steps (Hook, Station, Tone)
  - [x] StepHookSelection — Perplexity News, Values, Quotes
  - [x] StepStationMapping — CV Erfahrung ↔ Job Requirements
  - [x] StepToneConfig — Preset + Language + Anti-GPT Callout
- [x] Auto-Fill Magic Button
- [x] Wizard State persisted in localStorage
- [x] Stage 2: Judge (Claude Haiku 4) - **Phase 2 ✅**
  - [x] Pass/Fail Hard Constraint Logic (Blacklist, Word Count, PingPong)
  - [x] Reduced Token Usage (~50% optimization)
- [x] Stage 3: Iteration Loop (max 3x) - **Phase 2 ✅**
  - [x] Loop break on `pass === true`
  - [x] Feedback Integration (weaknesses[] in next prompt)
  - [x] Generation Logs

### [x] 5.3 Cover Letter Validation
- [x] Word Count Check (250-350)
- [x] Generic Phrase Detection
- [x] Company Name Verification
- [x] Forbidden Phrases Check

### [x] 5.4 Cover Letter Display (Frontend) **(Phase 3 ✅)**
- [x] Cover Letter Preview Komponente
- [x] DEMO_MODE entfernt
- [x] Wizard als Pre-Generation Gate integriert
- [x] X-Ray Audit Trail (Explainability Cards)
- [x] Hiring Manager Simulator (Skepsis-Kritik & Auto-Fix)
- [x] Regenerate Option
- [x] Inline Editing & Targeted Paragraph Fixes
- [x] Download als PDF
- [x] Pipeline Close (Als beworben markieren)

### [x] 5.5 Generation Logs & Audit
- [x] Speicherung in `generation_logs` / `documents` API
- [x] Model & Token Tracking
- [x] Quality Scores Logging
- [x] Cost Calculation

---

## Phase 6: Manual Application Tracking

### [x] 6.1 Application History System (Backend)
- [x] Speicherung in `application_history` table
- [x] URL Hash Generation (md5)
- [x] Company Slug Normalization
- [x] Application Method Tracking

### [x] 6.2 Application History UI (Frontend)
- [x] Beautiful Table Komponente (shadcn/ui)
- [x] Company Logos via Clearbit API
- [x] Formatted Dates
- [x] Method Badges (Auto/Manual)
- [x] Quick Actions (Open URL, Download docs)

### [x] 6.3 Statistics Dashboard
- [x] Weekly Count
- [x] Monthly Count
- [x] Total Count
- [x] Success Rate (if tracking responses)

---

## Phase 7: API Routes \u0026 Integration

### [ ] 7.1 Document Upload API
- [ ] `POST /api/documents/upload`
- [ ] File Validation
- [ ] Text Extraction
- [ ] Storage \u0026 Encryption
- [ ] Response mit extracted data

### [ ] 7.2 Job Processing API
- [ ] `POST /api/jobs/scrape`
- [ ] `POST /api/jobs/process`
- [ ] Integration aller Services:
  - [ ] Scraping
  - [ ] Company Enrichment
  - [ ] CV Optimization (optional)
  - [ ] Cover Letter Generation

### [ ] 7.3 User Profile API
- [ ] `GET /api/user/profile`
- [ ] `PATCH /api/user/profile`
- [ ] PII Decryption für Edit Mode
- [ ] Re-Encryption nach Update

### [ ] 7.4 Application History API
- [ ] `POST /api/applications/track`
- [ ] `GET /api/applications/history`
- [ ] `GET /api/applications/stats`

---

## Phase 8: Database Setup \u0026 Migration

### [ ] 8.1 Schema Deployment
- [ ] Run `database/schema.sql` (✅ EXISTS)
- [ ] Verify alle Tables created
- [ ] Verify RLS Policies active
- [ ] Verify Indexes created

### [ ] 8.2 Seed Data
- [ ] Form Selectors (Greenhouse, Lever, Workday, LinkedIn)
- [ ] Test User Profiles (optional)
- [ ] Sample Jobs (optional)

### [ ] 8.3 Cron Jobs Setup
- [ ] `cleanup_expired_research()` - 02:00 täglich
- [ ] `reset_daily_counts()` - 00:00 täglich
- [ ] Verify pg_cron Extension

---

## Phase 9: Security \u0026 Compliance

### [ ] 9.1 Encryption
- [ ] PII Encryption (Fernet/pgcrypto)
- [ ] Supabase Storage Encrypted Buckets
- [ ] Environment Variables Security
- [ ] API Key Rotation Strategy

### [ ] 9.2 Row Level Security (RLS)
- [ ] Verify `user_profiles` RLS
- [ ] Verify `documents` RLS
- [ ] Verify `job_queue` RLS
- [ ] Verify `application_history` RLS
- [ ] Verify `generation_logs` RLS

### [ ] 9.3 Consent Management
- [ ] `consent_history` Logging
- [ ] IP Address \u0026 User Agent Tracking
- [ ] Document Version Tracking
- [ ] Consent Withdrawal Flow

### [ ] 9.4 Audit Logging
- [ ] AI Generation Logs
- [ ] Scraping Logs
- [ ] User Actions Logs
- [ ] Cost Tracking Logs

---

## Phase 10: Testing \u0026 Verification

### [ ] 10.1 Unit Tests
- [ ] Document Processing Tests
- [ ] Scraper Tests (mock APIs)
- [ ] Company Enrichment Tests
- [ ] Cover Letter Generator Tests
- [ ] Validation Logic Tests

### [ ] 10.2 Integration Tests
- [ ] End-to-End Upload Flow
- [ ] Job Processing Pipeline
- [ ] Cover Letter Generation Flow
- [ ] Application Tracking Flow

### [ ] 10.3 Browser Tests
- [ ] Manual Upload Flow
- [ ] Job URL Input
- [ ] Cover Letter Preview \u0026 Edit
- [ ] Application History Display

### [ ] 10.4 API Tests
- [ ] All API Routes Response
- [ ] Error Handling
- [ ] Rate Limiting
- [ ] Authentication

---

## Phase 11: Performance \u0026 Monitoring

### [ ] 11.1 Performance Optimization
- [ ] Database Query Optimization
- [ ] Index Tuning
- [ ] Caching Strategy
- [ ] API Response Time

### [ ] 11.2 Monitoring Setup
- [ ] Cache Hit Rate Tracking
- [ ] API Cost per Job Tracking
- [ ] Generation Success Rate
- [ ] Average Response Times
- [ ] Error Rate Monitoring

### [ ] 11.3 Cost Management
- [ ] Model Router für Cost Tracking (✅ EXISTS in scripts)
- [ ] Monthly Cost Projections
- [ ] Per-User Cost Attribution
- [ ] Budget Alerts

---

## Phase 12: User Experience \u0026 Polish

### [x] 12.1 Loading States
- [x] Upload Progress
- [x] Processing Spinner
- [x] Generation Indicator
- [x] Optimistic Updates

### [x] 12.2 Error Messages
- [x] User-Friendly Error Messages
- [x] Retry Mechanisms
- [x] Fallback Content
- [x] Help Documentation

### [ ] 12.3 Notifications
- [ ] Success Toasts
- [ ] Error Alerts
- [ ] Processing Updates
- [ ] Email Notifications (optional)
