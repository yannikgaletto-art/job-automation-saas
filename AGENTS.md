# Pathly V2.0 - AGENT OPERATING SYSTEM

**Project:** Pathly V2.0  
**Version:** 4.0  
**Last Updated:** 2026-03-16  
**Status:** Active  

---

## 0. IDENTITY & MISSION

**Core Principle:**
> "AI assists, humans decide. Every application must pass through user review."

---

## 1. IMPLEMENTED AGENTS / PIPELINES

| Feature | Entry Point | Key Files |
|---------|------------|-----------|
| **Job Ingest** | `app/api/jobs/ingest/route.ts` | Firecrawl scrape → Claude Haiku extract → DB insert → Inngest trigger |
| **Job Extract (Inngest)** | `lib/inngest/extract-job-pipeline.ts` | Event `job/extract` — deep Claude re-extraction background job |
| **Company Research** | `lib/services/company-enrichment.ts` | Perplexity Sonar Pro, 7-day cache in `company_research` |
| **Cover Letter** | `lib/services/cover-letter-generator.ts` | Claude Sonnet, writing style, Inngest polish pipeline |
| **Cover Letter Polish** | `lib/inngest/cover-letter-polish.ts` | Post-generation audit, quote injection, critique |
| **CV Optimization** | `app/api/cv/optimize/route.ts` | Azure Document Intelligence + Claude Haiku, Valley/Tech templates |
| **Video Script Studio** | `app/api/video/scripts/generate/route.ts` | Claude Haiku keyword categorization + block generation, `video_scripts` table |
| **Coaching** | `lib/services/coaching-service.ts` | 3-round mock interview, gap analysis, PREP/3-2-1/CCC frameworks |
| **Coaching Report** | `lib/inngest/coaching-report-pipeline.ts` | Async report generation after session complete |
| **QR Code** | Consent dialog → CV templates | QR generated client-side with consent, embedded in PDF templates |
| **Avatar Picker** | `components/motion/sidebar.tsx` | Animal avatar stored in `user_profiles.avatar_animal`, Pathly brand colors |

---

## 2. DATA SCHEMA

Authoritative source: **`supabase/migrations/`** (not `database/schema.sql` — that is a reference snapshot).

**Key Tables:**
| Table | Purpose |
|-------|---------|
| `job_queue` | State machine: `pending → ready_for_review → ready_to_apply → submitted` |
| `company_research` | Perplexity cache (7-day TTL) |
| `documents` | Generated cover letters, CVs |
| `video_scripts` | Video Script Studio content (blocks, keywords) |
| `script_block_templates` | System + user-defined script block templates |
| `generation_logs` | AI audit trail (tokens, cost, model) |
| `user_profiles` | Profile, writing style, avatar, target role |

---

## 3. MODEL ROUTING

See `lib/ai/model-router.ts` — single source of truth.

| Task Type | Model |
|-----------|-------|
| `parse_html`, `extract_job_fields` | Claude Haiku 4.5 |
| `summarize`, `detect_ats_system` | GPT-4o-mini |
| `write_cover_letter`, `optimize_cv` | Claude Sonnet 4.5 |
| `cv_match`, `cv_parse` | Claude Haiku 4.5 |
| `document_extraction` (PRIMARY) | Azure Document Intelligence (EU) |

---

**Status:** ✅ ACTIVE
