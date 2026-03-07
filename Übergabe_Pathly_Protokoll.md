# 🚀 Übergabe & Onboarding Protokoll: Pathly V2.0

**Ziel:** Dieses Dokument dient als initialer Einstiegspunkt (Handover) für einen neuen KI-Agenten, der das Pathly-Projekt in einer frischen IDE übernimmt. Es enthält die essenzielle Architektur, wichtige Dateipfade und die fundamentalen Direktiven, um sofort produktiv arbeiten zu können.

---

## 🛑 SCHRITT 1: MUST-READ DOKUMENTE
Bevor du (![Agent]) mit dem Coden, Refactoren oder Debuggen beginnst, **MUSST** du zwingend die folgenden drei Dokumente über das Tool `view_file` vollständig lesen:

1. **`CLAUDE.md`** 
   *Enthält die visuellen "Extreme Clean" UI-Standards, Tailwind-Patterns und die UX-Philosophie (Notion/Linear-Style).*
2. **`Architektur.md`**
   *Beschreibt das Zusammenspiel von Frontend (Next.js), Backend (Inngest) und der Datenbank (Supabase).*
3. **`Sicherheitsarchitektur.md`**
   *Definiert die strengen DSGVO/Data-Privacy-Regeln, RLS-Policies in der Datenbank und wie User-Kontext sicher extrahiert wird.*

---

## 🛠 Tech Stack & Core Frameworks
- **Framework:** Next.js 15 (App Router)
- **Styling & Animation:** Tailwind CSS, Framer Motion, Radix UI Primitives, Lucide Icons
- **State Management:** Zustand (z.B. `store/use-calendar-store.ts`)
- **Datenbank & Auth:** Supabase (PostgreSQL, Row Level Security)
- **Background Jobs / Queues:** Inngest (für langlaufende AI-Tasks, z.B. Coaching-Pipelines)
- **AI Integration:** Vercel AI SDK, Anthropic (Claude), MCP (Model Context Protocol)

---

## 📁 Repository-Struktur & Navigations-Guide

### 1. Frontend (UI & Components)
- `app/dashboard/`: Enthält die gesamte geschützte Hauptanwendung (Layout, Pages).
  - `app/dashboard/components/`: Wiederverwendbare UI-Komponenten. Achte hier auf *Drag & Drop* Funktionalitäten (`@dnd-kit`).
- **Styling-Regel:** Verwende `#FAFAF9` als Base-Background, `#E7E7E5` für Borders. Keine grellen Farben.

### 2. Backend (APIs & Middleware)
- `app/api/`: Next.js Route Handlers. 
  - **Wichtig:** Jeder Endpunkt muss das Profil des Users über Supabase Server-Clients verifizieren (`getUser()`). Verlasse dich **niemals** auf Client-Payloads für die `user_id`.
- `middleware.ts`: Schützt das gesamte `/dashboard` Routing. Leitet unauthentifizierte User auf den Login (`/auth`) um.

### 3. Asynchrone Prozesse (Inngest)
- `lib/inngest/`: Hier laufen alle zeitaufwändigen Tasks (LLM-Aufrufe, PDF-Parsing, Report-Generierung).
- *Reduce Complexity:* Halte APIs im App-Router schlank. Schweres Lifting passiert *immer* asynchron via Inngest.

### 4. Datenbank (Supabase)
- `supabase/migrations/`: Alle Änderungen am Datenbankschema finden hier per `.sql`-Migrationen statt. 
- *Wichtig:* Nach neuen Migrationen **immer** `npx supabase db push` überlegen/anstoßen und lokal in Typen (`npx supabase gen types typescript --local > types/supabase.ts`) gießen.

### 5. AI & MCP (Model Context Protocol)
- Pathly nutzt MCP für dynamischen Datenabruf (z.B. Context7). 
- Anstatt statische URLs oder Fakten zu halluzinieren, generieren die LLMs Such-Queries (z.B. für YouTube-Links) oder rufen externe Tools über MCP auf.

---

## 🧠 Core Directives & Implementierungs-Regeln

**1. REDUCE COMPLEXITY (Keep it Simple)**
- Bevorzugte State-Lösung: Lokal (`useState`) < Global (`Zustand`) < Server (`Supabase`). Nutze Server-State nur, wenn Persistenz zwingend nötig ist.
- Verkompliziere keine Backend-Calls. Nutze optimistische UI-Updates für schnelle Reaktionen (siehe `CalendarTask`-Aktionen im `use-calendar-store.ts`).

**2. NO HALLUCINATION / ZERO FAKE DATA**
- Erfinde keine URLs, Firmen oder Links. Wenn etwas dynamisch sein muss, baue Such-Queries (z.B. `https://www.youtube.com/results?search_query=...`).

**3. FEATURE SILOS (Blast Radius minimieren)**
- Wenn du ein neues Feature baust (z.B. "Volunteering" oder "Coaching"), kapsel es. Vermeide es, globale Core-Router (`model-router.ts`) unnötig aufzublähen, wenn eine dedizierte API den Job besser und isolierter macht.

**4. SECURITY FIRST**
- *Never trust the client.* Jede API Route (`route.ts`) muss die Autorisierung selbständig prüfen.
- Logs dürfen keine PII (Personal Identifiable Information) wie Namen, Email oder genaue Standorte enthalten.

---
**📍 Letzter Check für den neuen Agenten:**
Hast du das System verstanden? 
1. `git pull` ausführen (falls relevant).
2. Lies die 3 MUST-READ MDs.
3. Schau in die `package.json` für die verwendeten Paket-Versionen.
4. Starte mit der Problemanalyse.
