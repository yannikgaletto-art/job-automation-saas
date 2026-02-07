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

### Phase 1: Manuelle Bewerbung
- 📄 CV & Cover Letter Upload
- 🎨 Template Auswahl (Notion-Style, Classic, ATS-Optimized)
- 🔍 Job Scraping (StepStone, LinkedIn, Indeed)
- 🤖 AI-Powered Cover Letter (mit Schreibstil-Analyse)
- 🏢 Company Research (Perplexity API)
- 💬 Quote Generator (3 relevante Zitate zur Auswahl)
- ✅ **Manual Application Tracking** (schöne Tabelle)

### Phase 2: Automatische Bewerbung
- ⏰ Daily Job Scout (mit Jitter gegen Rate Limits)
- 🧠 Smart Filtering (Blacklist, Skill Match)
- 🤖 Chrome Extension (Plasmo Framework)
- 📊 Inbox-Style Dashboard
- 🔐 Human-in-the-Loop Enforcement

---

## 🛠️ Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|----------|
| **Frontend** | Next.js 15 + React 19 | Dashboard & Landing |
| **UI** | Tailwind + shadcn/ui | Beautiful Components |
| **State** | Zustand + React Query | Client vs Server State |
| **Validation** | Zod + React Hook Form | Type-Safe Forms |
| **Backend** | Supabase (PostgreSQL) | Database + Auth + Storage |
| **AI** | Claude Sonnet 4.5 | Cover Letter Generation |
| **AI** | Claude Haiku 4 | Quality Judge |
| **Research** | Perplexity API | Company Intelligence |
| **Scraping** | Playwright + ScraperAPI | Job Data Extraction |
| **Extension** | Plasmo Framework | Chrome Extension |
| **Deploy** | Vercel | Hosting |

---

## 📂 Repository Structure

```
job-automation-saas/
├── docs/
│   ├── ARCHITECTURE.md          # Complete System Design
│   ├── CLAUDE.md                # Agent Instructions
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
│   │   └── history/             # Application History Table
│   ├── api/
│   │   ├── jobs/scrape/
│   │   ├── research/company/
│   │   └── cover-letter/generate/
│   └── (landing)/               # Marketing Pages
├── components/
│   ├── ApplicationHistoryTable.tsx
│   ├── CVTemplateSelector.tsx
│   └── QuoteSelector.tsx
├── chrome-extension/            # Plasmo Extension
│   ├── background/
│   ├── content-script.tsx
│   └── popup.tsx
├── scripts/
│   ├── cron-job-scout.py        # Daily Job Discovery
│   └── worker-queue.py          # Background Processor
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
# Add your API keys (see docs/SETUP.md)

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
- `company_research` - Perplexity API cache
- `application_history` - **Double-apply prevention** + visual table
- `form_selectors` - Learning system for form filling

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
- [x] Application history tracking
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

## 🤝 Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md)

---

## 📄 License

MIT License - See [LICENSE](./LICENSE)

---

## 🙏 Credits

- **Architecture:** Yannik Galetto
- **AI Models:** Anthropic (Claude), Perplexity
- **Inspiration:** Vibecoding Manifesto by Jack Roberts

---

**Made with ❤️ in Berlin**
