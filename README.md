# 🚀 Pathly V2.0 - Intelligent Job Application SaaS

**DSGVO & NIS2 Compliant | AI-Powered | Chrome Extension Hybrid**

---

## 🎯 Vision

Pathly automatisiert die Jobsuche und Bewerbung unter **strikter Einhaltung** von:
- ✅ **Human-in-the-Loop:** Keine vollautomatischen Entscheidungen (DSGVO Art. 22)
- ✅ **Privacy First:** Verschlüsselte PII & lokale Kontrolle
- ✅ **Hybrid Architecture:** Cloud Research + Local Execution

---

## 🏗️ Architecture

```
┌─────────────────────────────────────┐
│  CLOUD (Backend)                    │
│  - Company Research (Perplexity)    │
│  - AI Generation (Claude)           │
│  - Status: ready_for_review         │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│  DASHBOARD (Next.js)                │
│  - Job Job Queue & Workflow         │
│  - User reviews & approves          │
│  - Status: ready_to_apply           │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│  CHROME EXTENSION (Plasmo)          │
│  - Auth & Token Sync                │
│  - Fills forms (Coming Soon)        │
└─────────────────────────────────────┘
```

---

## ✨ Features (Implemented)

- **Onboarding Flow:** DSGVO/NIS2 Consent, Document Upload, and CV Template Selection.
- **Split Dashboard Navigation:** Clear separation of context (Today's Goals, Job Search, Job Queue, Analytics).
- **Morning Briefing:** AI-powered daily focus overlay with energy tracking.
- **Kalender-Task-Sync (Today's Goals):** Integrated Timeblocking and Pomodoro focus cycles.
- **Job Queue & History:** Progressive Workflow (Job → CV → Optimize → Review) and Application History tracking.
- **Analytics & Human Performance:** Flow state heatmaps and momentum scoring.
- **Company Research:** Auto-enrichment via Perplexity (Values, News, Tech Stack).
- **Cover Letter Generation:** Claude 3.5 Sonnet pipeline with style matching.
- **Command Palette:** `Cmd+K` global navigation and quick actions.
- **Motion UI:** Fluid animations & transitions (Framer Motion).

---

## 🛠️ Tech Stack

| Layer | Technology | Status |
|-------|-----------|--------|
| **Frontend** | Next.js 15 + React 19 | ✅ Active |
| **UI** | Tailwind + Framer Motion | ✅ Active |
| **Backend** | Supabase (PostgreSQL) | ✅ Active |
| **AI** | Claude (Anthropic) + Perplexity | ✅ Active |
| **Queue** | Inngest | ✅ Active |
| **Auth** | Supabase Auth | ✅ Active |

---

## 📂 Repository Structure (Actual)

```
pathly-v2/
├── app/
│   ├── api/                     # Next.js API Routes (Jobs, Research, Generation)
│   ├── dashboard/               # Main App (Job Queue, Security)
│   └── components/              # UI & Motion Components
├── lib/
│   ├── services/                # Core Business Logic (Enrichment, Generation)
│   ├── perplexity/              # Research & Caching
│   ├── inngest/                 # Background Jobs
│   └── ai/                      # Model Routing
├── database/
│   ├── schema.sql               # Current Schema (v3.0)
│   └── migrations/              # Migration History
├── docs/                        # Architecture & Specs
└── chrome-extension/            # Plasmo Extension (Auth Sync)
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js 20+
- Supabase Project

### Installation
```bash
# Clone
git clone <repo>
cd pathly-v2

# Install
npm install

# Environment
cp .env.example .env.local
# Fill in keys (see .env.example)

# Run
npm run dev
```

---

## 📚 Documentation

- **[ARCHITECTURE.md](./docs/ARCHITECTURE.md)** - System Design
- **[AGENTS.md](./AGENTS.md)** - AI Agent Definitions
- **[DESIGN_SYSTEM.md](./docs/DESIGN_SYSTEM.md)** - UI/UX Guidelines

