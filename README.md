# 🚀 Pathly V2.0 - Intelligent Job Application SaaS

**DSGVO & NIS2 Compliant | AI-Powered | Chrome Extension Hybrid**

---

## 🎯 Vision

Pathly automatisiert die Jobsuche und Bewerbung unter **strikter Einhaltung** von:
- ✅ DSGVO Art. 22 (keine vollautomatischen Entscheidungen ohne menschliche Kontrolle)
- ✅ NIS2 (Cyber-Resilienz)
- ✅ Ethical AI (Human-in-the-Loop)

---

## 🏗️ Architektur-Paradigma

### The Hybrid Model

```
┌─────────────────────────────────────┐
│  CLOUD (Backend)                    │
│  - Job Discovery (Cron)             │
│  - Company Research (Perplexity)    │
│  - AI Generation (Claude Sonnet)    │
│  - Status: ready_for_review         │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│  DASHBOARD (Next.js)                │
│  - User reviews & approves          │
│  - Edits cover letters              │
│  - Status: ready_to_apply           │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│  CHROME EXTENSION (Plasmo)          │
│  - Fills forms automatically        │
│  - User clicks Submit (Compliance!) │
│  - Status: submitted                │
└─────────────────────────────────────┘
```

**Warum kein vollautomatisches System?**
1. **Rechtlich:** DSGVO Art. 22 verbietet automatisierte Entscheidungen ohne menschliche Kontrolle
2. **Technisch:** Captchas, 2FA, individuelle Formulare
3. **Qualität:** Halluzinationen müssen verhindert werden

---

## ✨ Features

### Phase 1: Manuelle Bewerbung ✅
- 📄 CV & Cover Letter Upload
- 🎨 Template Auswahl (Notion-Style, Classic, ATS-Optimized)
- 🔍 Job Scraping (StepStone, LinkedIn, Indeed)
- 🤖 AI-Powered Cover Letter (mit Schreibstil-Analyse)
- 🏢 Company Research (Perplexity API)
- 💬 Quote Generator (3 relevante Zitate zur Auswahl)
- ✅ **Manual Application Tracking** (schöne Tabelle)

### Phase 2: Automatische Bewerbung 🚧
- ⏰ Daily Job Scout (mit Jitter gegen Rate Limits)
- 🧠 Smart Filtering (Blacklist, Skill Match)
- 🤖 Chrome Extension (Plasmo Framework)
- 📊 Inbox-Style Dashboard
- 🔐 Human-in-the-Loop Enforcement

---

## 🛠️ Tech Stack v3.1

| Layer | Technology | Purpose |
|-------|-----------|----------|
| **Frontend** | Next.js 15 + React 19 | Dashboard & Landing |
| **UI** | Tailwind + shadcn/ui | Beautiful Components |
| **State** | Zustand + React Query | Client vs Server State |
| **Validation** | Zod + React Hook Form | Type-Safe Forms |
| **Backend** | Supabase (PostgreSQL) | Database + Auth + Storage |
| **AI Generation** | Claude Sonnet 4.5 | Cover Letter Generation |
| **AI Judge** | Claude Haiku 4 | Quality Scoring |
| **AI Controller** | GPT-4o-mini | Job Routing & Classification |
| **Embeddings** | OpenAI text-embedding-3-small | Writing Style Similarity |
| **Research** | Perplexity Sonar Pro | Company Intelligence |
| **Scraping Tier 1** | Firecrawl | JS-heavy sites (LinkedIn, Greenhouse) |
| **Scraping Tier 2** | SerpAPI | Google Jobs aggregator |
| **Scraping Tier 3** | ScraperAPI | Anti-bot bypass |
| **Scraping Fallback** | Playwright | Local, always works |
| **Email** | Resend | Transactional Emails |
| **Extension** | Plasmo Framework | Chrome Extension |
| **Deploy** | Vercel | Hosting |

### 🔄 Smart Scraping System

Pathly uses an **intelligent 5-tier fallback system**:

```
Firecrawl (Modern, JS-heavy) → SerpAPI (Google Jobs) → 
ScraperAPI (Anti-bot) → BrightData (LinkedIn) → Playwright (Local)
```

**See [docs/SCRAPING_STRATEGY.md](./docs/SCRAPING_STRATEGY.md) for complete details.**

---

## 📂 Repository Structure

```
job-automation-saas/
├── docs/
│   ├── ARCHITECTURE.md          # Complete System Design
│   ├── SCRAPING_STRATEGY.md     # Smart Fallback Logic ✨ NEW
│   ├── WORKFLOWS.md             # Step-by-Step Processes
│   └── API.md                   # API Documentation
├── database/
│   ├── schema.sql               # PostgreSQL Schema
│   ├── migrations/              # Supabase Migrations
│   └── seed.sql                 # Test Data
├── app/                         # Next.js App Router
│   ├── dashboard/
│   │   ├── manual-apply/        # Manual Application Flow
│   │   ├── auto-apply/          # Automated Inbox
│   │   └── history/             # Application History Table ✨ NEW
│   ├── api/
│   │   ├── jobs/scrape/
│   │   ├── research/company/
│   │   └── cover-letter/generate/
│   └── (landing)/               # Marketing Pages
├── components/
│   ├── ApplicationHistoryTable.tsx  # ✨ NEW
│   ├── CVTemplateSelector.tsx
│   └── QuoteSelector.tsx            # ✨ NEW
├── chrome-extension/            # Plasmo Extension
│   ├── background/
│   ├── content-script.tsx
│   └── popup.tsx
├── scripts/
│   ├── cron-job-scout.py        # Daily Job Discovery
│   └── worker-queue.py          # Background Processor
├── lib/
│   └── scrapers/                # Scraping implementations ✨ NEW
│       ├── firecrawl.ts
│       ├── serpapi.ts
│       ├── scraperapi.ts
│       └── playwright.ts
├── CLAUDE.md                    # Agent Instructions
└── .env.example
```

---

## 🚀 Getting Started

### Prerequisites
```bash
Node.js 20+
Python 3.11+
Supabase CLI
Chrome (for Extension)
```

### Installation
```bash
# Clone
git clone https://github.com/yannikgaletto-art/job-automation-saas.git
cd job-automation-saas

# Install Dependencies
npm install
pip install -r requirements.txt

# Setup Environment
cp .env.example .env.local
# Add your API keys (see .env.example for details)

# Setup Database
supabase db reset

# Run Dev Server
npm run dev
```

### Chrome Extension Dev
```bash
cd chrome-extension
npm install
npm run dev

# Load in Chrome:
# chrome://extensions -> Load unpacked -> ./chrome-extension/build/chrome-mv3-dev
```

---

## 📊 Database Schema Highlights

### Key Tables
- `user_profiles` - User data with encrypted PII
- `documents` - Uploaded CVs with style embeddings
- `job_queue` - Scraped jobs with status tracking
- `company_research` - Perplexity API cache ✨ NEW
- `application_history` - **Double-apply prevention** + visual table ✨ NEW
- `form_selectors` - Learning system for form filling
- `scraping_logs` - Performance tracking for all scrapers ✨ NEW

### Compliance Features
- ✅ Row Level Security (RLS) on all tables
- ✅ Encrypted PII (name, email, phone, address)
- ✅ Consent tracking with versioning
- ✅ Audit logs for all AI generations

---

## 🎨 Writing Style Analysis

Pathly uses a **3-stage generation process**:

1. **Generation** (Claude Sonnet 4.5)
   - Analyzes user's uploaded cover letters
   - Extracts: tone, sentence structure, vocabulary
   - Integrates company research
   - Uses conjunctions ("Daher", "Deshalb") for naturalness

2. **Judge** (Claude Haiku 4)
   - Scores: Naturalness, Style Match, Relevance, Individuality
   - Minimum score: 8/10
   - Max 3 iterations

3. **Human Review**
   - User edits in Notion-style editor
   - Auto-save every 2 seconds

---

## 💰 Pricing Model

| Tier | Price | Features |
|------|-------|----------|
| **Free** | €0/mo | 5 manual applications/mo |
| **Starter** | €29/mo | 50 auto applications/mo + research |
| **Pro** | €79/mo | Unlimited + priority support |

**Break-Even:** 5 users @ €29/mo = €145/mo (covers MVP costs)

---

## 🔐 Security & Compliance

### DSGVO Compliance
- ✅ Consent Management (versioned)
- ✅ Right to be Forgotten (cascade delete)
- ✅ Data Portability (JSON export)
- ✅ Encryption at Rest & Transit

### NIS2 Compliance
- ✅ Incident Response Plan
- ✅ Supply Chain Security (Vendor Audits)
- ✅ Backup & Recovery (Supabase Point-in-Time)

---

## 📈 Roadmap

### Q1 2026 (MVP)
- [x] Manual application flow
- [x] Application history tracking ✨ NEW
- [x] Smart scraping fallback system ✨ NEW
- [ ] Chrome Extension Beta
- [ ] 10 Beta Users

### Q2 2026 (Launch)
- [ ] Automated job scout
- [ ] Perplexity integration
- [ ] Public Launch
- [ ] 100 Paying Users

### Q3 2026 (Scale)
- [ ] Interview Prep AI
- [ ] Salary Negotiation Coach
- [ ] 1,000 Users

---

## 💸 Cost Breakdown

| Service | MVP (0-100 users) | Scale (100-1000 users) |
|---------|-------------------|------------------------|
| **Firecrawl** | €20/mo (500 req) | €99/mo (10k req) |
| **SerpAPI** | €50/mo (5k searches) | €50/mo |
| **OpenAI** | €5/mo | €50/mo |
| **Perplexity** | €20/mo (50 calls) | €200/mo (500 calls) |
| **Claude** | €100/mo | €500/mo |
| **ScraperAPI** | €0 (1k req free) | €49/mo |
| **Resend** | €0 (3k emails) | €0 (stays free) |
| **Supabase** | €0 (Free tier) | €25/mo (Pro) |
| **Vercel** | €0 (Hobby) | €20/mo (Pro) |
| **Monitoring** | €0 (Sentry Free) | €26/mo |
| **TOTAL** | **~€195/mo** | **~€1,019/mo** |

**Break-Even:**
- @ €29/mo subscription
- MVP: 7 paying users
- Scale: 36 paying users

---

## 🤝 Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md)

---

## 📄 License

MIT License - See [LICENSE](./LICENSE)

---

## 🙏 Credits

- **Architecture:** Yannik Galetto
- **AI Models:** Anthropic (Claude), OpenAI (GPT-4o-mini), Perplexity
- **Scraping:** Firecrawl, SerpAPI, ScraperAPI
- **Inspiration:** Vibecoding Manifesto by Jack Roberts

---

## 📚 Documentation

- **[ARCHITECTURE.md](./docs/ARCHITECTURE.md)** - Complete system design
- **[SCRAPING_STRATEGY.md](./docs/SCRAPING_STRATEGY.md)** - Smart fallback logic ✨ NEW
- **[CLAUDE.md](./CLAUDE.md)** - Agent instructions for AI-assisted development
- **[.env.example](./.env.example)** - Environment variables template

---

**Made with ❤️ in Berlin**

**Version:** 3.1  
**Last Updated:** 2026-02-07  
**Status:** ✅ Production-Ready Design
