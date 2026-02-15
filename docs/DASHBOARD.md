# Dashboard & Progressive Workflow

**Status:** Implemented ✅  
**Tech:** Next.js, Framer Motion, Tailwind (shadcn-compatible)

---

## 🏗️ Core Concept: Progressive Disclosure

The dashboard is designed as a **strictly linear workflow**. It guides the user step-by-step through the application process for each job, preventing overwhelm.

### The 5-Step Workflow
Every job moves through these exact states:

1.  **Job Analysis:** AI parses job description & requirements.
2.  **CV Match:** AI matches user profile vs. job, identifying gaps.
3.  **Optimize:** AI suggests changes to CV bullets to close gaps.
4.  **Cover Letter:** AI generates a tailored cover letter (Sonnet 3.5).
5.  **Review & Apply:** User reviews documents and hits "Apply".

---

## 🧩 Components

### 1. Job Queue Table (`job-queue-table.tsx`)
The central hub. Replaces the old "grid of cards" design.
- **Columns:** Company, Position, Match Score, Progress, Next Action.
- **Micro-Interaction:** Hovering a row reveals quick actions (Archive, View).
- **Expansion:** Clicking a row expands it to show the full **Progressive Workflow**.

### 2. Progress Workflow (`progress-workflow.tsx`)
Visualizes the 5 steps within an expanded job row.
- **State:** `completed` (green), `current` (pulsing blue), `pending` (gray).
- **Icons:** Uses Lucide icons for each step (FileText, UserCheck, Sparkles, etc.).

### 3. Pomodoro Timer (`pomodoro-card.tsx`)
A focus tool embedded in the sidebar.
- **Duration:** 25m (Focus) / 5m (Break).
- **Context:** Helps users commit to "Deep Work" blocks for applications.

---

## 📸 User Flow

1.  **Add Job:** User pastes URL → System scrapes → Added to Queue.
2.  **Auto-Enrich:** Agent 3 (Perplexity) fetches company data (Mission/News).
3.  **Review:** User opens row → Sees "Step 1: Analysis Done".
4.  **Action:** Clicks "Optimize CV" → Workflow moves to Step 3.
5.  **Finalize:** Once Step 5 is reached, the status becomes `READY_TO_APPLY`.

---

## 🔧 Implementation Details

- **File Path:** `app/dashboard/`
- **Data Source:** `job_queue` table (Supabase).
- **State Management:** Local React State (Demo) → TanStack Query (Future).
