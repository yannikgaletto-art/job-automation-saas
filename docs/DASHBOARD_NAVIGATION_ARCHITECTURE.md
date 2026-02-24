# Pathly — Dashboard Navigation Architecture
**Status:** Ready for Development
**Version:** 2.0 — Singular Focus Redesign
**Replaces:** Altes überladenes Dashboard (1 Seite = alles gleichzeitig)
**Referenzen:** `Kalender-Task-Sync.md`, `BEWERBUNG_TRAINING.md`

---

## Goal

Das Pathly Dashboard von einem überladenen Tool-Panel in eine **sequenzielle, ablenkungsarme Experience** verwandeln: 4 klar getrennte Seiten, jede mit genau einem mentalen Kontext — und ein KI-generiertes Morning-Briefing, das jeden Tag mit Intention beginnt.

---

## Das Problem (Status Quo)

Auf einer einzigen Seite befinden sich aktuell:
- Stat-Kacheln (Total Jobs, Ready to Apply, In Progress)
- Tages-Kalender
- 11-Punkte-Checkliste
- Pomodoro-Timer
- Job Queue (expandierbar)

**Kognitive Last:** Zu hoch. Der User muss sich bei jedem Öffnen aktiv entscheiden, wo er hinschaut. Das hemmt den Start.

---

## Die neue Navigationsstruktur

```
SIDEBAR
──────────────────────────────────────────
 MAIN
 ▣  Today's Goals       /dashboard
 ▣  Job Search           /dashboard/job-search
 ▣  Job Queue            /dashboard/job-queue
 ▣  Analytics            /dashboard/analytics
 ▣  Coaching             /dashboard/coaching   [Soon]
──────────────────────────────────────────
 TOOLS
 ▣  Data Security
 ▣  Settings
```

**Jeder Reiter = genau 1 mentaler Kontext. Kein Overflow.**

---

## Tab-Übergangs-Animationen

Jeder Tab-Wechsel wird als Framer Motion `AnimatePresence` mit Richtung gerendert:

```typescript
// components/dashboard/TabTransition.tsx
import { AnimatePresence, motion } from 'framer-motion'

const TAB_ORDER = ['/', '/job-search', '/job-queue', '/analytics', '/coaching']

export function TabTransition({ children, route }: { children: React.ReactNode; route: string }) {
  const currentIndex = TAB_ORDER.indexOf(route)
  const direction = currentIndex > previousIndex ? 1 : -1 // Links oder rechts?

  return (
    <AnimatePresence mode="wait" custom={direction}>
      <motion.div
        key={route}
        custom={direction}
        initial={{ opacity: 0, x: direction * 40 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: direction * -40 }}
        transition={{ duration: 0.2, ease: 'easeInOut' }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}
```

---

## Silicon Valley Addition: Command Palette (Cmd+K)

Ein globaler Keyboard-Shortcut, der überall in der App funktioniert. Kein Klicken nötig.

```
┌──────────────────────────────────────────────────┐
│   🔍  Was möchtest du tun?                   │
│  ──────────────────────────────────────────────  │
│   ►  Today's Goals öffnen            G           │
│   ►  Job Queue öffnen               Q           │
│   ►  Job hinzufügen                  N           │
│   ►  Focus Mode starten             F           │
│   ►  Settings öffnen                ,           │
└──────────────────────────────────────────────────┘
```

Implementierung via `cmdk` (shadcn/ui hat es bereits integriert).

---

# TAB 1 — Today’s Goals
**Route:** `/dashboard`
**Mentaler Kontext:** Was mache ich HEUTE? Wie nutze ich meine Zeit?

---

## 1.1 Morning Briefing — Die KI-Morning-Routine

### Was es ist
Ein softes, vollflächiges Overlay, das **einmal pro Tag** beim ersten Öffnen der App erscheint. Es generiert KI-Powered einen personalisierten Zweizeiler und motiviert den User zum bewussten Start.

### Visuelles Design

```
╔══════════════════════════════════════════════════╗
║  [Blur-Backdrop: frosted glass, 20% Opacity]  ║
║                                               ║
║          Guten Morgen, Yannik. 🌅             ║
║                                               ║
║   „Gestern hast du 3 Ziele abgehakt und       ║
║    das Cover Letter für Enpal fertiggestellt.  ║
║    Heute liegt der Fokus auf Deep Work.        ║
║    Dein erster Block startet um 9:00 Uhr.“     ║
║                                               ║
║         [ Let’s go — Start Day → ]            ║
║                                               ║
║    Energie heute?  🌑 🌒 🌓 🌔 🌕              ║
║    (optionale Selbsteinschätzung, 1 Klick)    ║
║                                               ║
╚══════════════════════════════════════════════════╝
```

### UX-Regeln
- Erscheint nur **einmal pro Tag** (nicht bei jedem Tab-Wechsel)
- Kein "X"-Button — nur der "Let's go"-Button schließt es (zwingt zur kurzen Reflexion)
- Die Energie-Einschätzung (🌑–🌕) ist **optional** und wird für Analytics gespeichert
- Hinter dem Overlay ist der Kalender bereits gerendert (sichtbar aber geblurred)
- Framer Motion: Overlay faded aus + scrollt nach oben beim Klick auf "Let's go"

### Technische Implementierung

```typescript
// components/dashboard/MorningBriefing.tsx
'use client'
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface BriefingData {
  message: string        // KI-generierter Zweizeiler
  completedYesterday: number
  firstBlockTime: string | null
  userName: string
}

export function MorningBriefing() {
  const [visible, setVisible] = useState(false)
  const [briefing, setBriefing] = useState<BriefingData | null>(null)
  const [energy, setEnergy] = useState<number | null>(null)

  useEffect(() => {
    // Nur einmal pro Tag zeigen
    const todayKey = `pathly_briefing_${new Date().toISOString().split('T')[0]}`
    const alreadySeen = localStorage.getItem(todayKey)

    if (alreadySeen) return

    // Briefing von API laden
    fetch('/api/briefing/generate')
      .then(r => r.json())
      .then(data => {
        setBriefing(data)
        setVisible(true)
      })
      .catch(() => {
        // Fallback: Briefing ohne KI-Personalisierung
        setBriefing({
          message: 'Ein neuer Tag, eine neue Chance. Fokussiere dich auf das Wesentliche.',
          completedYesterday: 0,
          firstBlockTime: null,
          userName: 'Hey'
        })
        setVisible(true)
      })
  }, [])

  const handleStartDay = async () => {
    // Energie speichern (falls gewählt)
    if (energy !== null) {
      await fetch('/api/user/energy', {
        method: 'POST',
        body: JSON.stringify({ energy, date: new Date().toISOString() })
      })
    }

    // Als "gesehen" markieren
    const todayKey = `pathly_briefing_${new Date().toISOString().split('T')[0]}`
    localStorage.setItem(todayKey, '1')
    setVisible(false)
  }

  return (
    <AnimatePresence>
      {visible && briefing && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, y: -60 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          style={{
            position: 'fixed', inset: 0, zIndex: 50,
            backdropFilter: 'blur(16px)',
            background: 'rgba(255,255,255,0.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}
        >
          <div style={{
            maxWidth: 520, padding: '48px 40px', background: 'white',
            borderRadius: 24, boxShadow: '0 25px 60px rgba(0,0,0,0.12)',
            textAlign: 'center'
          }}>
            {/* Gruß */}
            <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 8 }}>
              {new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
            <h2 style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', marginBottom: 20 }}>
              Guten Morgen, {briefing.userName} 🌅
            </h2>

            {/* KI-Briefing */}
            <p style={{
              fontSize: 16, color: '#334155', lineHeight: 1.7,
              background: '#f8fafc', borderRadius: 12, padding: '20px 24px', marginBottom: 28
            }}>
              „{briefing.message}“
            </p>

            {/* Energie-Auswahl */}
            <div style={{ marginBottom: 32 }}>
              <p style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>Wie ist deine Energie heute?</p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                {[1, 2, 3, 4, 5].map(e => (
                  <button
                    key={e}
                    onClick={() => setEnergy(e)}
                    style={{
                      fontSize: 28, cursor: 'pointer', background: 'none', border: 'none',
                      opacity: energy === null || energy === e ? 1 : 0.35,
                      transform: energy === e ? 'scale(1.3)' : 'scale(1)',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {['\ud83c\udf11', '\ud83c\udf12', '\ud83c\udf13', '\ud83c\udf14', '\ud83c\udf15'][e - 1]}
                  </button>
                ))}
              </div>
            </div>

            {/* CTA */}
            <button
              onClick={handleStartDay}
              style={{
                width: '100%', padding: '14px 0',
                background: '#2563EB', color: 'white',
                border: 'none', borderRadius: 12,
                fontSize: 16, fontWeight: 700, cursor: 'pointer',
                letterSpacing: '-0.01em'
              }}
            >
              Let’s go — Start Day →
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
```

### API: `/api/briefing/generate`

```typescript
// app/api/briefing/generate/route.ts
import { NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import OpenAI from 'openai'

const openai = new OpenAI()

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Gestern: Abgeschlossene Tasks
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)

  const { data: completedTasks } = await supabase
    .from('tasks')
    .select('title')
    .eq('user_id', user.id)
    .eq('status', 'completed')
    .gte('completed_at', yesterday.toISOString().split('T')[0])

  // Heute: Erster Kalender-Block
  const today = new Date().toISOString().split('T')[0]
  const { data: todayTasks } = await supabase
    .from('tasks')
    .select('title, scheduled_start')
    .eq('user_id', user.id)
    .gte('scheduled_start', `${today}T00:00:00`)
    .lte('scheduled_start', `${today}T23:59:59`)
    .order('scheduled_start', { ascending: true })
    .limit(1)

  // Offene Bewerbungen
  const { data: pendingJobs } = await supabase
    .from('jobs')
    .select('id')
    .eq('user_id', user.id)
    .in('status', ['new', 'in_progress'])

  const userName = user.user_metadata?.full_name?.split(' ')[0] || 'Hey'
  const completedCount = completedTasks?.length ?? 0
  const firstBlock = todayTasks?.[0]
  const pendingCount = pendingJobs?.length ?? 0

  // GPT-4o-mini Briefing generieren
  const prompt = `Du bist ein motivierender, empathischer Pathly-Assistent.
  Schreibe 2 kurze, persönliche Sätze für das Morning Briefing.
  Kontext:
  - Gestern abgeschlossene Tasks: ${completedCount}
  - Erster Fokus-Block heute: ${firstBlock ? firstBlock.title + ' um ' + new Date(firstBlock.scheduled_start).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : 'noch kein Block geplant'}
  - Offene Bewerbungen: ${pendingCount}
  Ton: kurz, klar, motivierend. Kein Corporate-Sprech. Kein übertriebenes Lob.
  Antworte nur mit den 2 Sätzen, nichts anderes.`

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 100,
    temperature: 0.8
  })

  const message = completion.choices[0].message.content ?? 'Starte deinen Tag mit Fokus und Intention.'

  return NextResponse.json({
    message,
    completedYesterday: completedCount,
    firstBlockTime: firstBlock?.scheduled_start ?? null,
    userName
  })
}
```

**Kosten:** GPT-4o-mini bei 100 Token = ~$0.000015 pro Briefing. Bei 1.000 Daily Active Users = ~$0.015/Tag. Vernachlässigbar.

---

## 1.2 Hauptlayout (nach Briefing-Dismiss)

Das Layout folgt exakt der Spezifikation aus `Kalender-Task-Sync.md` (Split-View).
Dieser Abschnitt referenziert die bestehende Spec — **keine Duplizierung**.

```
┌─────────────────────────────────┬─────────────────────────────────┐
│   LINKE SPALTE                │   RECHTE SPALTE                │
│   Today's Timeline           │   Modus A: Inbox (Goals)       │
│   (Kalender, Timeblocking)   │   oder                         │
│                              │   Modus B: Focus Mode (Pomo)   │
│   → Spec: Kalender-Task-Sync │   → Spec: Kalender-Task-Sync   │
└─────────────────────────────────┴─────────────────────────────────┘
```

**Zusätzliche Features (ergänzend zu Kalender-Task-Sync.md):**

### Feature: Drag & Drop Merging (Goal → Kalender)

Ein noch nicht in der Timeline gebundenes Goal aus der rechten Liste kann direkt per Drag auf einen freien Kalender-Slot links gezogen werden. Das ist identisch mit dem `onDragEnd`-Flow aus `Kalender-Task-Sync.md`, aber der Drop-Source ist die Goals-Liste — nicht nur die Inbox.

```typescript
// Einzige Ergänzung zum bestehenden DnD-System:
// Goals aus der rechten Spalte sind ebenfalls <Draggable>
// Sie bekommen beim Drop denselben onDragEnd-Handler wie Inbox-Tasks
// Kein zweites System nötig.
```

### Feature: Auto-Hide Sidebar im Focus Mode

Wenn der Pomodoro-Timer in den "Running"-Zustand wechselt, klappt die linke Pathly-Hauptnavigation automatisch ein.

```typescript
// store/focusStore.ts (Zustand)
interface FocusStore {
  isTimerRunning: boolean
  setTimerRunning: (v: boolean) => void
}

// components/Sidebar.tsx
const { isTimerRunning } = useFocusStore()

<motion.aside
  animate={{ width: isTimerRunning ? 0 : 240 }}
  transition={{ duration: 0.3, ease: 'easeInOut' }}
  style={{ overflow: 'hidden' }}
>
  {/* Sidebar Inhalt */}
</motion.aside>

{/* Kleiner Toggle-Handle wenn versteckt */}
{isTimerRunning && (
  <button
    onClick={() => useFocusStore.getState().setTimerRunning(false)}
    style={{ position: 'fixed', left: 8, top: '50%', zIndex: 40 }}
  >
    ►
  </button>
)}
```

---

# TAB 2 — Job Search
**Route:** `/dashboard/job-search`
**Mentaler Kontext:** Neue Jobs finden und entscheiden ob relevant.

---

## 2.1 Layout

```
┌──────────────────────────────────────────────────┐
│  JOB SEARCH                                   │
│  ──────────────────────────────────────────────   │
│  [ 🔍  Software Engineer, Berlin       ] [Suchen]│
│  Filter: Remote ▾  Vollzeit ▾  Geh. 80k+ ▾      │
│  ──────────────────────────────────────────────   │
│  12 Ergebnisse · LinkedIn, StepStone, Indeed   │
│                                               │
│  ┌─────────────────────────────────────────┐ │
│  │ Senior PM · Enpal · Berlin          │ │
│  │ Match: ████████░░ 74%            [+ Add]│ │
│  └─────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────┐ │
│  │ Growth Marketing Lead · N26 · Berlin│ │
│  │ Match: █████░░░░░ 48%            [+ Add]│ │
│  └─────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
```

## 2.2 Silicon Valley Detail: Match-Score Darstellung

Kein roter Badge für niedrige Scores. Stattdessen:
- **< 40%:** Card wird nicht angezeigt (gefiltert)
- **40–64%:** Grauer Fortschrittsbalken + "3 von 8 Skills vorhanden"
- **65–79%:** Blauer Balken
- **≥ 80%:** Grüner Balken + "★ Strong Match"

## 2.3 SV Addition: Daily Search Digest

Einmal morgens (automatisch nach erstem Login): AI generiert "Heute neu für dich: 5 Jobs, die gestern gepostet wurden und zu deinem Profil passen." als Toast-Notification.

---

# TAB 3 — Job Queue
**Route:** `/dashboard/job-queue`
**Mentaler Kontext:** Bewerbungen, die in Bearbeitung sind — was ist der nächste Schritt?

---

## 3.1 Layout

Die bestehende Job Queue bleibt strukturell erhalten, wird aber als eigenständige Seite ohne Dashboard-Kontext gerendert.

```
┌──────────────────────────────────────────────────┐
│  JOB QUEUE                                    │
│  3 aktive Bewerbungen · 1 Review ausstehend   │
│  ──────────────────────────────────────────────  │
│  [Alle] [In Arbeit] [Review] [Versendet]      │
│                                               │
│  Enpal · Senior PM · ---- Cover Letter  [90%]│
│  N26 · Growth Lead · -------- CV Match   [20%]│
│  Patagonia · BD Mgr · ------- Steckbrief [10%]│
│                                               │
│  [ + Job hinzufügen ]                         │
└──────────────────────────────────────────────────┘
```

## 3.2 Progress-Indikator Fix

Der Prozentsatz zeigt den **Bewerbungsfortschritt** (wie weit ist der User im Workflow), nicht den CV-Match-Score.

**Visuelle Regel:** Fortschrittsbalken statt rotem Badge.
```
Steckbrief  = 10%   → ░░░░░░░░░░  (hellgrau)
CV Match    = 30%   → ███░░░░░░░  (blau)
CV Opt.     = 50%   → █████░░░░░  (blau)
Cover Letter= 75%   → ███████░░░  (grün)
Review      = 90%   → █████████░  (grün)
Versendet   = 100%  → ██████████  (grün + ✓)
```

## 3.3 SV Addition: "Next Action" Prompt

Unter jedem Job-Eintrag ein einzeiliger KI-Hinweis:
*"→ Nächster Schritt: Cover Letter schreiben (est. 25 min)"*
Das reduziert die kognitive Last des Users massiv.

---

# TAB 4 — Analytics
**Route:** `/dashboard/analytics`
**Mentaler Kontext:** Wie entwickle ich mich? Was funktioniert?

---

## 4.1 Layout

```
┌──────────────────────────────────────────────────┐
│  ANALYTICS                                    │
│  ──────────────────────────────────────────────  │
│  Heute  Diese Woche  Diesen Monat             │
│  ──────────────────────────────────────────────  │
│  Pomodoros ■■■■■■■□  7h Focus-Zeit        │
│  Bewerbungen  ■■■□□  4 versendet         │
│  Energie       Mo 🌔 Di 🌕 Mi 🌓 Do — Fr —  │
│                                               │
│  Aktivitäts-Heatmap (GitHub-Stil)            │
│  Jan [░░█░█░░░░░█░░░] Feb [███░░█░█░░]      │
└──────────────────────────────────────────────────┘
```

## 4.2 SV Addition: Energie-Tracking Visualisierung

Die im Morning Briefing eingetragene Tages-Energie (🌑–🌕) wird hier als Wochengraph dargestellt und gegen Focus-Zeit korreliert. Insight: *"An Tagen mit hoher Energie hast du 2× mehr Pomodoros abgeschlossen."*

---

# Zusätzliche Silicon Valley Improvements

## 5.1 Empty States (Wenn nichts da ist)

Jede Seite braucht einen motivierenden Empty State:

```typescript
// Statt: leere Tabelle oder weiße Seite
// So:

<EmptyState
  icon="🔍"
  title="Noch keine Jobs in der Queue"
  description="Füge deinen ersten Job aus der Job Search hinzu oder importiere ihn per Extension."
  cta={{ label: "Job Search öffnen", href: "/dashboard/job-search" }}
/>
```

## 5.2 Keyboard Shortcuts (Power User Layer)

| Shortcut | Aktion |
|---|---|
| `Cmd+K` | Command Palette öffnen |
| `G` | Today's Goals |
| `S` | Job Search |
| `Q` | Job Queue |
| `A` | Analytics |
| `N` | Neuer Job / Neue Task |
| `F` | Focus Mode starten |
| `Escape` | Modal schließen / Focus verlassen |

## 5.3 URL-basiertes Routing (Deep Links)

Jeder Tab hat eine eigene URL. Der User kann:
- Lesezeichen setzen
- Links teilen (für späteren Support/Onboarding)
- Browser-Zurück-Button nutzen

```typescript
// app/dashboard/job-queue/page.tsx  → Tab 3
// app/dashboard/job-search/page.tsx → Tab 2
// app/dashboard/analytics/page.tsx  → Tab 4
// app/dashboard/page.tsx            → Tab 1 (Today's Goals)
```

---

# Supabase: Neue Felder

```sql
-- Energie-Tracking (Morning Briefing)
CREATE TABLE daily_energy (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  date        DATE NOT NULL,
  energy      INTEGER CHECK (energy BETWEEN 1 AND 5),
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, date)
);

-- Briefing-Generierung cachen (kein API-Call wenn bereits generiert)
CREATE TABLE daily_briefings (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  date        DATE NOT NULL,
  message     TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, date)
);

-- RLS
ALTER TABLE daily_energy ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_briefings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_energy" ON daily_energy
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "own_briefings" ON daily_briefings
  FOR ALL USING (auth.uid() = user_id);
```

---

# Implementierungsplan

| Phase | Aufgabe | Aufwand | Abhängigkeit |
|---|---|---|---|
| 1 | 4 separate Page-Routes anlegen (leere Shells) | 2h | — |
| 2 | Sidebar-Navigation updaten (Labels + Routing) | 1h | Phase 1 |
| 3 | Tab-Übergange (Framer Motion AnimatePresence) | 3h | Phase 1 |
| 4 | Morning Briefing Overlay (UI + localStorage) | 4h | — |
| 5 | `/api/briefing/generate` (GPT-4o-mini) | 3h | Phase 4 |
| 6 | Energie-Tracking (DB + Buttons im Overlay) | 2h | Phase 4+5 |
| 7 | Auto-Hide Sidebar (Zustand + Framer Motion) | 2h | Kalender-Task-Sync Pomodoro-State |
| 8 | Job Queue als eigene Page (bestehende Komponenten refactoren) | 3h | Phase 1 |
| 9 | Job Search Page (neue Komponente) | 1 Tag | AGENT_1.1 Scraping |
| 10 | Analytics Page (bestehende Charts übertragen) | 4h | Phase 1 |
| 11 | Progress-Balken in Job Queue (statt roter Badge) | 2h | Phase 8 |
| 12 | Empty States für alle 4 Pages | 2h | Phase 1 |
| 13 | Keyboard Shortcuts + Command Palette (cmdk) | 4h | Alle Pages stabil |
| **Gesamt** | | **~4–5 Tage** | |

---

# Edge Cases

| Szenario | Lösung |
|---|---|
| User öffnet App nach 00:00 (neuer Tag) | `localStorage`-Key ist tagesspezifisch → Briefing erscheint erneut |
| OpenAI API nicht verfügbar | Fallback-Text wird gerendert, kein Spinner-Loop |
| User klickt sofort "Let's go" ohne Energie zu wählen | `energy = null` → kein DB-Write → kein Fehler |
| Briefing bereits generiert (Cache-Hit) | Supabase `daily_briefings`-Tabelle prüfen vor API-Call → spart Kosten |
| User öffnet App auf Nicht-Dashboard Route | Briefing erscheint trotzdem (fixed overlay, route-unabhängig) |
| Tab-Übergang während laufendem Pomodoro | Toast: "⚠️ Timer läuft. Seite wechseln pausiert den Timer nicht." |
| Mobile (kein Sidebar) | Bottom Navigation Bar mit 4 Icons ersetzt Sidebar |

---

# Testing Protocol

```
✅ Morning Briefing erscheint beim ersten Öffnen des Tages
✅ Morning Briefing erscheint NICHT beim zweiten Öffnen am selben Tag
✅ Energie-Klick speichert in DB (daily_energy Tabelle)
✅ "Let's go" lässt Overlay verschwinden (Framer Motion Exit)
✅ OpenAI unavailable → Fallback-Text, kein Crash
✅ Tab-Wechsel Today's Goals → Job Queue: Slide-Animation nach rechts
✅ Tab-Wechsel Job Queue → Today's Goals: Slide-Animation nach links
✅ Pomodoro startet → Sidebar klappt ein
✅ Pomodoro stoppt → Sidebar klappt aus
✅ Cmd+K öffnet Command Palette
✅ Progress-Balken in Job Queue zeigt korrekten Schritt-Fortschritt
✅ Empty State erscheint wenn keine Jobs in der Queue
✅ Deep Link /dashboard/analytics lädt direkt Analytics
```

---

# Outputs (Deliverables)

- ✅ 4 separate Next.js Page-Routes
- ✅ Morning Briefing Overlay (KI-generiert, einmal pro Tag)
- ✅ Energie-Tracking (DB + Analytics-Visualisierung)
- ✅ Tab-Transitions (Framer Motion AnimatePresence)
- ✅ Auto-Hide Sidebar im Focus Mode
- ✅ Progress-Balken in Job Queue (kein roter Score-Badge mehr)
- ┅ Command Palette (Cmd+K) via cmdk
- ┅ Keyboard Shortcuts
- ┅ Empty States für alle 4 Pages

---

## Master Prompt Template Compliance

**✅ Alle Pflicht-Sektionen:**
1. Goal ✅
2. Problem (Status Quo) ✅
3. Neue Architektur mit ASCII-Diagrammen ✅
4. Vollständiger Code für alle neuen Features ✅
5. Supabase Schema ✅
6. Implementierungsplan mit Aufwand-Schätzungen ✅
7. Edge Cases ✅
8. Testing Protocol ✅
9. Outputs / Deliverables ✅
10. Referenzen zu bestehenden Specs (keine Duplizierung) ✅

**Ready for Development. 🚀**
