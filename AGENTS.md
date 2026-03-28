# Pathly V2.0 - AGENT OPERATING SYSTEM

**Project:** Pathly V2.0  
**Version:** 5.2  
**Last Updated:** 2026-03-24  
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
| **Pathly SaaS** | `/Users/yannik/.gemini/antigravity/Pathly_SaaS/` | `3000` | Vollprodukt — App, DB, AI, Inngest (requires `npx inngest-cli dev -u http://localhost:3000/api/inngest`) |
| **Pathly Website** | `/Users/yannik/.gemini/antigravity/pathly-website/` | `3001` | Statische Marketing-Landing-Page |

**Verbindung:** Nur via `NEXT_PUBLIC_APP_URL` in der Website `.env.local` → zeigt auf die deployed SaaS-App.  
**Keine shared Code-Basis, keine shared DB, keine API-Verbindung** zwischen den beiden Projekten.

### Pathly Website — Tech Stack & Regeln

- **Framework:** Next.js 14 (App Router, TypeScript, Tailwind CSS)
- **Animation — KRITISCH:** Framer Motion `initial={{ opacity: 0 }}` mit SSR verursacht Hydration-Flash UND triggert nicht für above-the-fold Elemente. Für jede Animation gilt:
  - **Above-the-fold (Hero):** Immer **pure CSS `@keyframes`** in `globals.css` (Klassen `hero-fade-in` bis `hero-fade-in-delay-4`, `marker-highlight`, `marker-badge`, `animate-fade-in`).
  - **Interaktive Client-Elemente:** Framer Motion OK (Navbar Mobile Menu, PhoneCarousel). `useInView` / `getBoundingClientRect` / `requestAnimationFrame` sind NICHT zuverlässig für above-the-fold SSR-Content.
  - **Tab-Übergänge:** CSS `animate-fade-in` Klasse.
- **Constants First (REGEL 7):** Alle Texte in `lib/constants.ts` — nie hardcoded in Komponenten.
- **Kein externes Icon-Package:** SVG inline oder Tailwind-Shapes.
- **SSG-Bug-Prävention:** `new Date()` niemals auf Modul-Level verwenden. Nur in Render-Funktionen oder `useEffect`.
- **Security Headers:** In `next.config.mjs` — X-Frame-Options, CSP (inkl. `https://tally.so` in `script-src`), Referrer-Policy, Permissions-Policy.
- **Server Components by Default:** Sections sind Server Components (kein `"use client"`) — nur UI-Elemente mit State/Events brauchen Client-Direktive.
- **Scroll-Driven Sections (GSAP):** Sections die `ScrollTrigger` nutzen, werden als `"use client"` Client Components implementiert. Muster: `400vh` äußerer Container + `sticky top-0 h-screen` innerer Wrapper → Viewport bleibt während Animation gelockt. Referenz-Implementation: `ScrollSection.tsx`, `Comparison.tsx`.

### Pathly Website — Schlüssel-Dateien

| Datei | Zweck |
|-------|
| `lib/constants.ts` | Single Source of Truth für alle Texte (REGEL 7) |
| `next.config.mjs` | Security Headers + CSP (Tally.so erlaubt) |
| `app/globals.css` | Design-Tokens, CSS-Variablen, hero-fade-in + marker + `typewriter-cursor` + `cursor-blink-7` Keyframes |
| `tailwind.config.ts` | Design-System-Tokens (navy, muted, border etc.) |
| `DESIGN.md` | Design-System-Dokumentation |
| `public/og-image.png` | Open Graph / Twitter Card Bild (1200×630) |
| `components/layout/Navbar.tsx` | Sticky Nav, scroll-aware blur, hamburger inline SVG |
| `components/layout/Footer.tsx` | Logo, Impressum/Datenschutz Links, Copyright runtime |
| `components/sections/Hero.tsx` | Fullscreen Headline (100svh), below-fold CTAs/Phone/Stats |
| `components/sections/ScrollSection.tsx` | Hero scroll-driven typewriter (400vh sticky, GSAP ScrollTrigger) |
| `components/sections/Comparison.tsx` | Vorher/Nachher Vergleich (400vh sticky, sequentielle Animation links→rechts, `data-flipper` Wrapper für Flip-Animation, transparente Container) |
| `components/ui/HighlightText.tsx` | Marker-Highlight-Animation via CSS @keyframes (marker-highlight + marker-badge Klassen) |
| `components/ui/CountUp.tsx` | Zahlen-Animation via native `getBoundingClientRect` mount-check |
| `components/ui/PhoneCarousel.tsx` | Auto-cycling Screenshots, prefers-reduced-motion Fallback |
| `components/ui/FeatureCardStack.tsx` | Interaktiver 3D Card-Stack für Feature-Screenshots (drag, swipe, zoom-on-hover) |
| `components/ui/ShimmerButton.tsx` | Primary CTA, unterstützt `data-tally-*` Attribute |
| `components/ui/FeatureChip.tsx` | Floating Hero-Chips mit CSS Animation |
| `components/sections/Testimonials.tsx` | Animated Photo-Stack Testimonials (Framer Motion, Autoplay, Inline SVGs) |
| `components/sections/FAQ.tsx` | Server Component mit JSON-LD Schema (SEO) |
| `components/ui/FAQCarousel.tsx` | Horizontales Client-Carousel via `framer-motion` layout constraints |
| `components/sections/FinalCTA.tsx` | Inline-Email Warteliste (kein Tally), 3 States (idle/submitting/done) |
| `app/impressum/page.tsx` | Static Impressum rendert dynamisch aus `lib/constants.ts` (IMPRESSUM) |

### Pathly Website — Offene Punkte (User-Action)

- **Impressum vervollständigen:** In `lib/constants.ts` unter `IMPRESSUM.sections` müssen `[Straße und Hausnummer]`, `[PLZ] [Ort]` und `[Telefonnummer eintragen]` überschrieben werden (rechtlich erforderlich vor Go-Live). Die DEV-only Warnung auf der Page verschwindet dann.
- **Warteliste-Endpoint:** In `FinalCTA.tsx` den simulierten Submit (`setTimeout`) durch einen echten API-Call (z.B. Resend/Supabase) ersetzen.

---

**Status:** ✅ ACTIVE
