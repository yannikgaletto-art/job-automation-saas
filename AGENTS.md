# Pathly V2.0 - AGENT OPERATING SYSTEM

**Project:** Pathly V2.0  
**Version:** 5.0  
**Last Updated:** 2026-03-21  
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
| **Mood Check-in V2** | `app/[locale]/dashboard/hooks/useMoodCheckIn.tsx` + `app/api/mood/checkin/route.ts` | Adaptive Tag/Nacht-Symbole, Progressive Reduction (5× Skip → auto-hide), `MoodCheckinContext`, `CheckinSettingsCard` in Settings, i18n (de/en/es), `lib/mood/mood-symbols.ts` |

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

## 4. PROJECT STRUCTURE — MULTI-REPO

Pathly besteht aus **zwei getrennten Projekten** die unabhängig deployt werden:

| Projekt | Pfad | Port (lokal) | Zweck |
|---------|------|-------------|-------|
| **Pathly SaaS** | `/Users/yannik/.gemini/antigravity/Pathly_SaaS/` | `3000` | Vollprodukt — App, DB, AI, Inngest |
| **Pathly Website** | `/Users/yannik/.gemini/antigravity/pathly-website/` | `3001` | Statische Marketing-Landing-Page |

**Verbindung:** Nur via `NEXT_PUBLIC_APP_URL` in der Website `.env.local` → zeigt auf die deployed SaaS-App.  
**Keine shared Code-Basis, keine shared DB, keine API-Verbindung** zwischen den beiden Projekten.

### Pathly Website — Tech Stack & Regeln

- **Framework:** Next.js 14 (App Router, TypeScript, Tailwind CSS)
- **Animation:** Framer Motion v12 — **ACHTUNG:** `initial={{ opacity: 0 }}` mit SSR verursacht Hydration-Flash. Für above-the-fold Content **immer CSS `@keyframes`** verwenden (Klassen `hero-fade-in` bis `hero-fade-in-delay-4` in `globals.css`).
- **Constants First (REGEL 7):** Alle Texte in `lib/constants.ts` — nie hardcoded in Komponenten.
- **Kein externes Icon-Package:** SVG inline oder Tailwind-Shapes.
- **SSG-Bug-Prävention:** `new Date()` niemals auf Modul-Level verwenden (friert bei Build-Time ein). Nur in `useEffect` oder Client-Komponenten.
- **Security Headers:** In `next.config.mjs` — X-Frame-Options, CSP, Referrer-Policy, Permissions-Policy.

### Pathly Website — Schlüssel-Dateien

| Datei | Zweck |
|-------|-------|
| `lib/constants.ts` | Single Source of Truth für alle Texte (REGEL 7) |
| `next.config.mjs` | Security Headers + `images.unoptimized: true` |
| `app/globals.css` | Design-Tokens, CSS-Variablen, hero-fade-in Keyframes |
| `tailwind.config.ts` | Design-System-Tokens (navy, muted, border etc.) |
| `DESIGN.md` | Design-System-Dokumentation |
| `components/layout/Navbar.tsx` | Sticky Nav, scroll-aware blur, hamburger inline SVG |
| `components/sections/Hero.tsx` | Hero ohne Framer Motion SSR-Abhängigkeit (CSS animations) |
| `components/ui/CountUp.tsx` | Native `IntersectionObserver` + `getBoundingClientRect` mount-check |

---

**Status:** ✅ ACTIVE
