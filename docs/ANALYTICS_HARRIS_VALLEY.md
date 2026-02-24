# Pathly — Analytics: Flow State & Human Performance

> **Status:** Spec · Stand: Feb 2026
> **Scope:** Analytics Page (`/dashboard/analytics`) · Pomodoro Session Tracking · Flow State Heatmap · Energy Resonance Check-in · Application Momentum Score · Bewerbungs-Funnel · Golden Hours Radial Clock
> **Philosophie:** Silicon Valley Daten-Präzision × Lee Harris Human-Energy-Awareness. Kein Dashboard für das Ego — ein Spiegel für den eigenen Rhythmus.
> **Template:** Orientiert sich am `Master_Prompt_Template.md` aus [`dev-playbook/directives/`](https://github.com/yannikgaletto-art/dev-playbook/tree/main/directives)

---

## Goal

Eine Analytics-Seite für Pathly implementieren, die Pomodoro-Sessions mit Uhrzeit, Wochentag und Energielevel verknüpft — sodass der User nicht nur sieht, wie viel er getan hat, sondern **wann** und **in welchem Zustand** er am tiefsten in den Flow gelangt. Kombiniert mit dem Bewerbungs-Funnel entsteht ein vollständiges Bild: Wo verliere ich Energie, wo verliere ich Bewerbungen?

---

## Philosophie: Warum dieser Ansatz?

Der Standard-Ansatz für Produktivitäts-Analytics: Streak-Counter und „Du hast heute 4 Pomodoros gemacht. 🎉". Das ist Gamification ohne Substanz.

**Silicon Valley-Prinzip:** Wenn Oura, Whoop und Notion das machen, sollte Pathly es für die Jobsuche tun: Muster aus Rohdaten extrahieren und in Sprache übersetzen, die zu einer konkreten Entscheidung führt. *„Dein Dienstag-Vormittag ist dein stärkster Zeitblock — blockiere ihn."*

**Lee Harris-Prinzip:** Energie ist kein konstanter Faktor. Joblsuchende durchleben Hochs und Tiefs — Ablehnungen, Hoffnung, Erschöpfung, Wiederaufstieg. Das System soll das nicht ignorieren, sondern **sichtbar und nutzbar machen**. Ein Energielevel-Check-in vor jeder Session kostet 2 Sekunden und gibt nach 3 Wochen die wertvollsten Daten des gesamten Dashboards.

---

## Inputs (getrackte Events)

| Event | Trigger | Pflichtfeld | Gespeicherter Datenpunkt |
|---|---|---|---|
| Pomodoro gestartet | User klickt „Start" in `PomodoroCard` | ✅ | `started_at` (Timestamp) |
| Pomodoro abgeschlossen | Timer läuft auf 0 (Focus-Phase) | ✅ | `completed = true`, `completed_at` |
| Pomodoro abgebrochen | User klickt „Skip" während Focus | ❌ Optional | `completed = false`, `aborted_at_pct` (0–100%) |
| Energielevel gewählt | Pre-Session Check-in (5 Icons) | ❌ Optional | `energy_level` (1–5) |
| Session-Dauer | 25min oder 50min Toggle | ✅ | `duration_min` |
| Bewerbung Status-Änderung | Existing `job_queue` Workflow | ✅ | Bereits in `jobs.status` vorhanden |

---

## Data Sources (was bereits im Codebase existiert)

| Quelle | Datei | Vorhandene Daten | Für Analytics nutzbar |
|---|---|---|---|
| `PomodoroCard` | `app/dashboard/components/pomodoro-card.tsx` | `sessions` Counter, `mode`, `focusDuration`, `isActive` | ✅ Nach Persistierung sofort |
| `ApplicationHistory` | `app/dashboard/components/application-history.tsx` | `appliedAt`, `applicationMethod`, Pagination | ✅ Sofort (API bereits vorhanden) |
| `jobs` Tabelle | Supabase | `status`, `workflowStep`, `matchScore`, `created_at` | ✅ Sofort |
| `DailyGoalsChecklist` | `app/dashboard/components/daily-goals-checklist.tsx` | Abgehakte Goals, Completion State | 🟡 Nach Persistierung |
| `TimeBlockingCalendar` | `app/dashboard/components/time-blocking-calendar.tsx` | Geblockte Zeitfenster | 🟡 Zukunft |

**Fehlender Datenpunkt:** `PomodoroCard` speichert Sessions aktuell nur in React State — sie sind nach Reload weg. Das ist die **erste und wichtigste Implementierungsaufgabe** dieser Spec.

---

## Tools / Services

| Tool | Rolle | Kosten |
|---|---|---|
| **Supabase** | Session-Persistenz, Query-Aggregation | Bestehend |
| **Recharts** | Momentum Sparkline, Funnel, Energy Timeline | `npm i recharts` — kostenlos, MIT |
| **Framer Motion** | Card-Transitions, CountUp-Animationen | Bereits installiert |
| **Web Audio API** | Klangschale-Sound bei Pomodoro-Ende | Kein Paket, nativ im Browser |
| **SVG (React)** | Heatmap-Grid, Golden Hours Radial Clock | Kein Paket — reines React/SVG |
| **shadcn/ui** | Cards, Badges, Tooltips | Bereits installiert |

**Kein externes Analytics-Tool (Mixpanel, Amplitude, PostHog):** Alle Daten bleiben in Supabase. DSGVO-konform by design. Der User sieht sein eigenes Profil — nicht Aggregate.

---

## 1. Datenbank

### 1.1 Neue Tabelle: `pomodoro_sessions`

```sql
-- supabase/migrations/20260224_pomodoro_sessions.sql

CREATE TABLE pomodoro_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- Timing
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  duration_min    SMALLINT NOT NULL CHECK (duration_min IN (25, 50)),

  -- Outcome
  completed       BOOLEAN NOT NULL DEFAULT FALSE,
  aborted_at_pct  SMALLINT CHECK (aborted_at_pct BETWEEN 0 AND 100),
  -- Beispiel: User bricht bei 60% ab → aborted_at_pct = 60

  -- Energy (Lee Harris Layer)
  energy_level    SMALLINT CHECK (energy_level BETWEEN 1 AND 5),
  -- 1 = 🌑 sehr niedrig, 2 = 🌒, 3 = 🌓, 4 = 🌔, 5 = 🌕 sehr hoch

  -- Kontext (optional, Zukunft)
  linked_job_id   UUID REFERENCES jobs(id) ON DELETE SET NULL,
  -- Für: „Diese Session war für Patagonia-Bewerbung"

  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Performance-Index für Heatmap-Queries (user + Zeitraum)
CREATE INDEX idx_pomodoro_sessions_user_time
  ON pomodoro_sessions (user_id, started_at);

-- RLS: User sieht nur eigene Sessions
ALTER TABLE pomodoro_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "User owns sessions" ON pomodoro_sessions
  FOR ALL USING (auth.uid() = user_id);
```

### 1.2 View für Heatmap-Query (Performance-Optimierung)

```sql
-- Aggregiert Pomodoro-Sessions nach Wochentag + Stunde
-- ISODOW: 1 = Montag, 7 = Sonntag
CREATE OR REPLACE VIEW pomodoro_heatmap AS
SELECT
  user_id,
  EXTRACT(ISODOW FROM started_at)::INT  AS day_of_week,  -- 1 (Mo) bis 7 (So)
  EXTRACT(HOUR FROM started_at)::INT    AS hour_of_day,  -- 0 bis 23
  COUNT(*)                              AS session_count,
  COUNT(*) FILTER (WHERE completed)     AS completed_count,
  ROUND(AVG(energy_level))              AS avg_energy
FROM pomodoro_sessions
GROUP BY user_id, day_of_week, hour_of_day;
```

### 1.3 Keine Änderung an `jobs`-Tabelle erforderlich

Der Bewerbungs-Funnel liest ausschließlich aus der bestehenden `jobs`-Tabelle (`status`, `created_at`, `match_score_overall`). Keine Migration nötig.

---

## 2. API Routes

### 2.1 `POST /api/pomodoro/complete`

Wird direkt in `handleTimerComplete()` von `PomodoroCard` aufgerufen.

```typescript
// app/api/pomodoro/complete/route.ts
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { started_at, duration_min, completed, aborted_at_pct, energy_level } = body;

  const { error } = await supabase.from('pomodoro_sessions').insert({
    user_id:        user.id,
    started_at:     started_at,
    completed_at:   completed ? new Date().toISOString() : null,
    duration_min:   duration_min,
    completed:      completed,
    aborted_at_pct: aborted_at_pct ?? null,
    energy_level:   energy_level ?? null,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
```

### 2.2 `GET /api/analytics/flow`

Liefert alle Daten für die Analytics-Page in einem einzigen Call.

```typescript
// app/api/analytics/flow/route.ts
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const days = parseInt(searchParams.get('days') ?? '30');
  const since = new Date(Date.now() - days * 86400000).toISOString();

  // 1. Heatmap-Daten
  const { data: heatmap } = await supabase
    .from('pomodoro_heatmap')
    .select('day_of_week, hour_of_day, session_count, completed_count, avg_energy')
    .eq('user_id', user.id);

  // 2. Momentum (Sessions pro Tag, letzte 30 Tage)
  const { data: momentum } = await supabase
    .from('pomodoro_sessions')
    .select('started_at, completed, duration_min, energy_level')
    .eq('user_id', user.id)
    .gte('started_at', since)
    .order('started_at', { ascending: true });

  // 3. Funnel (Bewerbungs-Status-Verteilung)
  const { data: funnelRaw } = await supabase
    .from('jobs')
    .select('status, match_score_overall')
    .eq('user_id', user.id);

  // 4. Energie-Timeline (letzte 30 Sessions mit Energielevel)
  const { data: energyTimeline } = await supabase
    .from('pomodoro_sessions')
    .select('started_at, energy_level, completed')
    .eq('user_id', user.id)
    .not('energy_level', 'is', null)
    .gte('started_at', since)
    .order('started_at', { ascending: true })
    .limit(60);

  return NextResponse.json({
    heatmap:       heatmap ?? [],
    momentum:      momentum ?? [],
    funnel:        funnelRaw ?? [],
    energyTimeline: energyTimeline ?? [],
  });
}
```

---

## 3. UI: Analytics Page

### 3.1 Navigation

Der `/dashboard/analytics` Link ist bereits in `sidebar.tsx` eingetragen. Kein Änderungsbedarf.

```
[ Dashboard ] [ Job Queue ] [ Analytics* ] [ Data Security ] [ Settings ]
                                  ↑
                        Dieser Link existiert bereits.
                        Nur die page.tsx fehlt noch.
```

### 3.2 Seiten-Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│  ⚡ FLOW STATE & PERFORMANCE                                            │
│  Deine Muster. Dein Rhythmus. Deine Golden Hours.                      │
│                                                   [7 Tage ▼]           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                 │
│  │  Sessions    │  │ Completion   │  │ Ø Energie    │                 │
│  │    47        │  │   81%        │  │   🌔 3.8     │                 │
│  └──────────────┘  └──────────────┘  └──────────────┘                 │
│                                                                         │
│  ── FLOW STATE HEATMAP ─────────────────────────────────────────────── │
│  Wann bist du am schärfsten?                                           │
│                                                                         │
│       0  1  2  3  4  5  6  7  8  9  10 11 12 13 14 15 16 17 18 19 20 │
│  Mo  ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ██ ██ ██ ░░ ░░ ▒▒ ░░ ░░ ░░ ░░ ░░ ░░ ░░ │
│  Di  ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ██ ██ ██ ██ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ │
│  Mi  ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ▒▒ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ▒▒ ░░ ░░ ░░ ░░ │
│  Do  ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ▒▒ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ │
│  Fr  ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ▒▒ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ │
│  Sa  ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ │
│  So  ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ │
│                                                                         │
│  💡 Du bist dienstags zwischen 09:00 und 12:00 am produktivsten.      │
│     3× mehr Sessions als dein Wochendurchschnitt.                     │
│                                                                         │
│  ── GOLDEN HOURS RADIAL CLOCK ──────────────────────────────────────── │
│                    ┌─────────┐                                         │
│                    │   12    │                                         │
│               9 ── │  (   ) │ ── 3                                    │
│                    │   6    │                                         │
│                    └─────────┘                                         │
│          Segmente leuchten warm wo deine Energie am höchsten ist.     │
│          ✨ Golden Hours: 09:00 – 11:00 Uhr                           │
│                                                                         │
│  ── ENERGIE RESONANZ ───────────────────────────────────────────────── │
│  Deine Energie × Completion Rate                                       │
│                                                                         │
│  🌑 (1)  ████░░░░░░░░  34%                                            │
│  🌒 (2)  ██████░░░░░░  51%                                            │
│  🌓 (3)  ████████░░░░  67%                                            │
│  🌔 (4)  ██████████░░  85%                                            │
│  🌕 (5)  ████████████  94%                                            │
│                                                                         │
│  💡 An 🌕-Tagen schließt du 2.8× mehr Sessions ab als an 🌑-Tagen.  │
│                                                                         │
│  ── APPLICATION MOMENTUM ───────────────────────────────────────────── │
│                                                                         │
│  MOMENTUM SCORE                                                        │
│       87                                                               │
│  [Sparkline: 30 Tage]  ▁▂▄▃▅▇█▆▄▂▁▃▅▆▇█                             │
│                                                                         │
│  ── BEWERBUNGS-FUNNEL ───────────────────────────────────────────────── │
│                                                                         │
│  Jobs hinzugefügt    ████████████████████████████████  100%  (32)     │
│  Analysiert          ████████████████████████████░░░░   83%  (27)     │
│  CV optimiert        ████████████████████████░░░░░░░░   62%  (20)     │
│  CL generiert        ████████████████████░░░░░░░░░░░░   50%  (16)     │
│  Beworben            ████████████████░░░░░░░░░░░░░░░░   37%  (12)     │
│                                                                         │
│  ⚠️  Du verlierst 12% zwischen CV-Optimierung und CL-Generierung.    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Komponenten-Struktur

```
app/dashboard/analytics/
  page.tsx                          ← Server Component: fetcht /api/analytics/flow
  components/
    analytics-header.tsx            ← Titel + Zeitraum-Selector (7/30/90 Tage)
    stats-row.tsx                   ← 3 Stat-Cards: Sessions, Completion %, Ø Energie
    flow-heatmap.tsx                ← Wochentag × Uhrzeit Grid (reines SVG/CSS)
    golden-hours-clock.tsx          ← 24h Radial SVG Clock
    energy-resonance-chart.tsx      ← Energie-Level vs. Completion Rate (Recharts)
    momentum-score.tsx              ← CountUp Number + Recharts Sparkline
    application-funnel.tsx          ← Horizontaler Funnel (Recharts BarChart)
    insight-box.tsx                 ← Auto-generierter Insight-Text (pure TS Logik)

components/mindful/                 ← Aus vorheriger Spec (Mindful Transitions)
  mindful-break-overlay.tsx
  sine-wave-animation.tsx           ← Portiert aus nudgeme-welcome

hooks/
  use-pomodoro.ts                   ← Timer + Persistierung (erweiterte Version)
  use-analytics.ts                  ← Fetcht und cached analytics/flow Daten

lib/
  analytics/
    insights.ts                     ← Insight-Text-Generator (pure Funktionen)
    heatmap-utils.ts                ← Grid-Berechnung, Peak-Finder
    funnel-utils.ts                 ← Funnel-Aggregation aus jobs[]
```

---

## 5. Implementierung

### 5.1 Flow State Heatmap

Die Heatmap ist ein 7×24-Grid (Wochentage × Stunden). Keine externe Library — nur CSS-Grid und berechnete `rgba`-Farben.

```typescript
// lib/analytics/heatmap-utils.ts

export type HeatmapCell = {
  day: number;   // 1 (Mo) bis 7 (So)
  hour: number;  // 0 bis 23
  count: number;
  completedCount: number;
  avgEnergy: number | null;
};

export function buildHeatmapGrid(cells: HeatmapCell[]): number[][] {
  // grid[day-1][hour] = count  (0-indexed: Mo=0, So=6)
  const grid: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));
  cells.forEach(c => {
    grid[c.day - 1][c.hour] = c.count;
  });
  return grid;
}

export function findPeakWindow(
  grid: number[][],
  windowHours = 3
): { day: number; startHour: number; count: number } {
  let best = { day: 0, startHour: 0, count: 0 };
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h <= 24 - windowHours; h++) {
      const sum = grid[d].slice(h, h + windowHours).reduce((a, b) => a + b, 0);
      if (sum > best.count) best = { day: d, startHour: h, count: sum };
    }
  }
  return best;
}
```

```tsx
// app/dashboard/analytics/components/flow-heatmap.tsx
'use client';
import { useMemo } from 'react';
import { buildHeatmapGrid, findPeakWindow, type HeatmapCell } from '@/lib/analytics/heatmap-utils';

const DAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function FlowHeatmap({ cells }: { cells: HeatmapCell[] }) {
  const grid = useMemo(() => buildHeatmapGrid(cells), [cells]);
  const max  = useMemo(() => Math.max(...grid.flat(), 1), [grid]);
  const peak = useMemo(() => findPeakWindow(grid, 3), [grid]);

  const toColor = (count: number) =>
    count === 0
      ? '#f4f4f0'
      : `rgba(0, 46, 122, ${0.12 + (count / max) * 0.88})`;

  return (
    <div className="space-y-3">
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `28px repeat(24, 1fr)` }}
      >
        {/* Stunden-Labels */}
        <div />
        {HOURS.map(h => (
          <div key={h} className="text-[9px] text-center text-stone-400 leading-none">
            {h % 6 === 0 ? `${h}h` : ''}
          </div>
        ))}

        {/* Zeilen pro Wochentag */}
        {DAYS.map((day, di) => (
          <>
            <div key={day} className="text-[11px] text-stone-500 flex items-center font-medium">
              {day}
            </div>
            {HOURS.map(h => {
              const count = grid[di][h];
              const isPeak = di === peak.day && h >= peak.startHour && h < peak.startHour + 3;
              return (
                <div
                  key={`${di}-${h}`}
                  title={`${DAYS[di]} ${h}:00 — ${count} Session${count !== 1 ? 's' : ''}`}
                  className={`aspect-square rounded-sm transition-all duration-200 cursor-default
                    ${isPeak ? 'ring-1 ring-offset-0 ring-[#002e7a]/40' : ''}`}
                  style={{ backgroundColor: toColor(count) }}
                />
              );
            })}
          </>
        ))}
      </div>

      {/* Legende */}
      <div className="flex items-center gap-3 text-[10px] text-stone-400">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm bg-[#f4f4f0] border border-stone-200" />
          <span>0</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'rgba(0,46,122,0.25)' }} />
          <span>niedrig</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'rgba(0,46,122,0.65)' }} />
          <span>mittel</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm bg-[#002e7a]" />
          <span>peak</span>
        </div>
      </div>
    </div>
  );
}
```

### 5.2 Golden Hours Radial Clock

Ein 24h-Kreisdiagramm — reines SVG, keine Library. Segmente leuchten proportional zur historischen Pomodoro-Dichte.

```tsx
// app/dashboard/analytics/components/golden-hours-clock.tsx
'use client';
import { useMemo } from 'react';

interface Props {
  cells: { hour: number; count: number }[];
}

export function GoldenHoursClock({ cells }: Props) {
  const max = useMemo(() => Math.max(...cells.map(c => c.count), 1), [cells]);
  const hourCounts = useMemo(() => {
    const map = new Array(24).fill(0);
    cells.forEach(c => { map[c.hour] = (map[c.hour] ?? 0) + c.count; });
    return map;
  }, [cells]);

  const peakHour = hourCounts.indexOf(Math.max(...hourCounts));

  // Jedes Segment: 360/24 = 15° pro Stunde
  const cx = 100, cy = 100, r_inner = 40, r_outer = 85;

  const segmentPath = (hour: number, intensity: number) => {
    const startAngle = (hour / 24) * 2 * Math.PI - Math.PI / 2;
    const endAngle   = ((hour + 1) / 24) * 2 * Math.PI - Math.PI / 2;
    const r = r_inner + intensity * (r_outer - r_inner);

    const x1 = cx + r_inner * Math.cos(startAngle);
    const y1 = cy + r_inner * Math.sin(startAngle);
    const x2 = cx + r        * Math.cos(startAngle);
    const y2 = cy + r        * Math.sin(startAngle);
    const x3 = cx + r        * Math.cos(endAngle);
    const y3 = cy + r        * Math.sin(endAngle);
    const x4 = cx + r_inner * Math.cos(endAngle);
    const y4 = cy + r_inner * Math.sin(endAngle);

    return `M ${x1} ${y1} L ${x2} ${y2} A ${r} ${r} 0 0 1 ${x3} ${y3} L ${x4} ${y4} A ${r_inner} ${r_inner} 0 0 0 ${x1} ${y1} Z`;
  };

  const labelAngle = (hour: number) => (hour / 24) * 2 * Math.PI - Math.PI / 2;
  const labelRadius = 93;

  return (
    <div className="flex flex-col items-center gap-2">
      <svg viewBox="0 0 200 200" className="w-48 h-48">
        {/* Hintergrundring */}
        <circle cx={cx} cy={cy} r={r_outer} fill="none" stroke="#f0ede8" strokeWidth="1" />
        <circle cx={cx} cy={cy} r={r_inner} fill="none" stroke="#f0ede8" strokeWidth="1" />

        {/* Segmente */}
        {hourCounts.map((count, hour) => {
          const intensity = count / max;
          const isPeak = hour === peakHour;
          return (
            <path
              key={hour}
              d={segmentPath(hour, intensity)}
              fill={
                isPeak
                  ? '#f59e0b'
                  : intensity === 0
                    ? '#f4f4f0'
                    : `rgba(0, 46, 122, ${0.1 + intensity * 0.9})`
              }
              stroke="white"
              strokeWidth="0.5"
            />
          );
        })}

        {/* Stunden-Labels (nur 0, 6, 12, 18) */}
        {[0, 6, 12, 18].map(h => {
          const a = labelAngle(h);
          const lx = cx + labelRadius * Math.cos(a);
          const ly = cy + labelRadius * Math.sin(a);
          return (
            <text
              key={h}
              x={lx} y={ly}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="8"
              fill="#73726E"
              fontFamily="sans-serif"
            >
              {h}h
            </text>
          );
        })}

        {/* Zentrum */}
        <circle cx={cx} cy={cy} r={r_inner - 2} fill="white" />
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize="9" fill="#73726E" fontFamily="sans-serif">
          Golden
        </text>
        <text x={cx} y={cy + 6} textAnchor="middle" fontSize="9" fill="#73726E" fontFamily="sans-serif">
          Hours
        </text>
      </svg>
      <p className="text-xs text-stone-500 text-center">
        ✨ Peak: <strong className="text-[#002e7a]">{peakHour}:00 – {(peakHour + 2) % 24}:00 Uhr</strong>
      </p>
    </div>
  );
}
```

### 5.3 Energy Resonance Chart

Verbindet Energielevel (1–5) mit Completion Rate. Nutzt Recharts `BarChart`.

```tsx
// app/dashboard/analytics/components/energy-resonance-chart.tsx
'use client';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const MOON_LABELS = ['', '🌑', '🌒', '🌓', '🌔', '🌕'];

interface Session { energy_level: number | null; completed: boolean; }

export function EnergyResonanceChart({ sessions }: { sessions: Session[] }) {
  const data = [1, 2, 3, 4, 5].map(level => {
    const atLevel  = sessions.filter(s => s.energy_level === level);
    const rate     = atLevel.length > 0
      ? Math.round((atLevel.filter(s => s.completed).length / atLevel.length) * 100)
      : 0;
    return { level: MOON_LABELS[level], rate, count: atLevel.length };
  });

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div className="bg-white border border-[#d6d6d6] rounded-lg p-2 text-xs shadow-sm">
        <p className="font-medium">{d.level} Energie-Level</p>
        <p className="text-[#002e7a]">{d.rate}% Completion Rate</p>
        <p className="text-stone-400">{d.count} Session{d.count !== 1 ? 's' : ''}</p>
      </div>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data} barSize={32} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
        <XAxis dataKey="level" axisLine={false} tickLine={false} tick={{ fontSize: 16 }} />
        <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 10, fill: '#73726E' }} />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f4f4f0' }} />
        <Bar dataKey="rate" radius={[4, 4, 0, 0]}>
          {data.map((_, i) => (
            <Cell
              key={i}
              fill={i < 2 ? '#d6d6d6' : i < 3 ? '#93c5fd' : i < 4 ? '#3385FF' : '#002e7a'}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
```

### 5.4 Momentum Score

```typescript
// lib/analytics/insights.ts

interface PomodoroSession {
  started_at: string;
  completed: boolean;
  duration_min: number;
  energy_level: number | null;
}

interface Job {
  status: string;
  match_score_overall: number | null;
}

// Rollierender 7-Tage Momentum Score (0–100)
// Gewichtet: Completion × Match Score × Energie
export function calcMomentumScore(sessions: PomodoroSession[], jobs: Job[]): number {
  const last7 = sessions.filter(s => {
    const age = (Date.now() - new Date(s.started_at).getTime()) / 86400000;
    return age <= 7;
  });

  if (last7.length === 0) return 0;

  const completionRate  = last7.filter(s => s.completed).length / last7.length;
  const avgEnergy       = last7
    .filter(s => s.energy_level !== null)
    .reduce((sum, s) => sum + (s.energy_level ?? 0), 0) / (last7.filter(s => s.energy_level !== null).length || 1);

  const appliedRecently = jobs.filter(j => j.status === 'submitted').length;
  const avgMatch        = jobs
    .filter(j => j.match_score_overall !== null)
    .reduce((sum, j) => sum + (j.match_score_overall ?? 0), 0) /
    (jobs.filter(j => j.match_score_overall !== null).length || 1);

  const score = Math.round(
    completionRate * 40 +        // 40% Gewichtung: Sessions abschließen
    (avgEnergy / 5) * 25 +      // 25% Gewichtung: Energielevel
    Math.min(appliedRecently / 5, 1) * 20 + // 20%: Aktive Bewerbungen
    (avgMatch / 100) * 15       // 15%: Match-Score-Qualität
  );

  return Math.min(score, 100);
}

// Generiert den Insight-Text unter der Heatmap
export function generatePeakInsight(
  peak: { day: number; startHour: number; count: number },
  totalSessions: number
): string {
  const days = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
  const dayAvg = totalSessions / 7;
  const factor = dayAvg > 0 ? (peak.count / dayAvg).toFixed(1) : '—';

  return `Du bist ${days[peak.day]}s zwischen ${peak.startHour}:00 und ${peak.startHour + 3}:00 Uhr am produktivsten. ` +
    `${factor}× mehr Sessions als dein Wochendurchschnitt.`;
}

// Generiert den Energie-Insight
export function generateEnergyInsight(sessions: PomodoroSession[]): string | null {
  const highEnergy = sessions.filter(s => (s.energy_level ?? 0) >= 4);
  const lowEnergy  = sessions.filter(s => (s.energy_level ?? 0) <= 2 && s.energy_level !== null);

  if (highEnergy.length < 3 || lowEnergy.length < 3) return null;

  const highRate = highEnergy.filter(s => s.completed).length / highEnergy.length;
  const lowRate  = lowEnergy.filter(s => s.completed).length / lowEnergy.length;
  const factor   = lowRate > 0 ? (highRate / lowRate).toFixed(1) : '—';

  return `An 🌕-Tagen schließt du ${factor}× mehr Sessions ab als an 🌑-Tagen.`;
}

// Generiert den Funnel-Bottleneck-Insight
export function generateFunnelInsight(jobs: Job[]): string | null {
  const STATUS_ORDER = ['pending', 'processing', 'ready_for_review', 'ready_to_apply', 'submitted'];
  const counts = STATUS_ORDER.map(s => jobs.filter(j => j.status === s).length);
  const total  = counts[0];
  if (total < 5) return null;

  let biggestDropStep = 1;
  let biggestDrop = 0;
  for (let i = 1; i < counts.length; i++) {
    const drop = counts[i - 1] > 0 ? (counts[i - 1] - counts[i]) / counts[i - 1] : 0;
    if (drop > biggestDrop) { biggestDrop = drop; biggestDropStep = i; }
  }

  const LABELS = ['Analysierung', 'CV-Optimierung', 'CL-Generierung', 'Bewerbung'];
  return `Du verlierst ${Math.round(biggestDrop * 100)}% zwischen ${LABELS[biggestDropStep - 1]} und ${LABELS[biggestDropStep]}. Hier liegt dein Bottleneck.`;
}
```

### 5.5 Bewerbungs-Funnel

```tsx
// app/dashboard/analytics/components/application-funnel.tsx
'use client';

interface Job { status: string; }

const STAGES = [
  { key: 'pending',          label: 'Hinzugefügt' },
  { key: 'processing',       label: 'Analysiert' },
  { key: 'ready_for_review', label: 'CV optimiert' },
  { key: 'ready_to_apply',   label: 'CL generiert' },
  { key: 'submitted',        label: 'Beworben' },
];

export function ApplicationFunnel({ jobs }: { jobs: Job[] }) {
  const counts = STAGES.map(s => jobs.filter(j => j.status === s.key).length);
  const max    = counts[0] || 1;

  return (
    <div className="space-y-2">
      {STAGES.map((stage, i) => {
        const pct = Math.round((counts[i] / max) * 100);
        return (
          <div key={stage.key} className="flex items-center gap-3">
            <span className="text-xs text-stone-500 w-28 text-right shrink-0">
              {stage.label}
            </span>
            <div className="flex-1 h-7 bg-[#f4f4f0] rounded-md overflow-hidden">
              <div
                className="h-full rounded-md transition-all duration-500 flex items-center px-2"
                style={{
                  width: `${pct}%`,
                  backgroundColor: `rgba(0, 46, 122, ${0.25 + (pct / 100) * 0.75})`,
                  minWidth: counts[i] > 0 ? '2rem' : '0'
                }}
              >
                {counts[i] > 0 && (
                  <span className="text-white text-[10px] font-medium whitespace-nowrap">
                    {counts[i]}
                  </span>
                )}
              </div>
            </div>
            <span className="text-xs font-medium text-[#002e7a] w-10 text-right shrink-0">
              {pct}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
```

### 5.6 Energy Check-in vor Pomodoro-Start

Ein 5-Symbol-Picker direkt in der `PomodoroCard`, sichtbar bevor der User auf „Start" klickt.

```tsx
// Ergänzung in app/dashboard/components/pomodoro-card.tsx
// Füge nach dem Duration Selector ein:

const ENERGY_ICONS = ['🌑', '🌒', '🌓', '🌔', '🌕'];
const [energyLevel, setEnergyLevel] = useState<number | null>(null);

// Vor dem Start-Button:
{!isActive && mode === 'focus' && (
  <div className="flex justify-center gap-2 mb-3">
    <span className="text-xs text-[#002e7a]/60 self-center mr-1">Energie?</span>
    {ENERGY_ICONS.map((icon, i) => (
      <button
        key={i}
        onClick={() => setEnergyLevel(i + 1)}
        className={`text-lg leading-none transition-all ${
          energyLevel === i + 1 ? 'scale-125 opacity-100' : 'opacity-40 hover:opacity-70'
        }`}
        title={`Energielevel ${i + 1}/5`}
      >
        {icon}
      </button>
    ))}
  </div>
)}
```

Der `energyLevel`-State wird dann in `handleTimerComplete()` an `/api/pomodoro/complete` übergeben.

### 5.7 Analytics Page (Zusammenbau)

```tsx
// app/dashboard/analytics/page.tsx
import { createClient } from '@/lib/supabase/server';
import { FlowHeatmap }           from './components/flow-heatmap';
import { GoldenHoursClock }      from './components/golden-hours-clock';
import { EnergyResonanceChart }  from './components/energy-resonance-chart';
import { MomentumScore }         from './components/momentum-score';
import { ApplicationFunnel }     from './components/application-funnel';
import { InsightBox }            from './components/insight-box';
import { StatsRow }              from './components/stats-row';
import {
  generatePeakInsight,
  generateEnergyInsight,
  generateFunnelInsight,
  calcMomentumScore,
} from '@/lib/analytics/insights';
import { buildHeatmapGrid, findPeakWindow } from '@/lib/analytics/heatmap-utils';

export default async function AnalyticsPage() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/analytics/flow?days=30`, {
    cache: 'no-store',
    headers: { Cookie: '' } // Server-side: Auth via Supabase SSR
  });
  const { heatmap, momentum, funnel, energyTimeline } = await res.json();

  const grid      = buildHeatmapGrid(heatmap);
  const peak      = findPeakWindow(grid);
  const peakText  = generatePeakInsight(peak, momentum.length);
  const energyTxt = generateEnergyInsight(energyTimeline);
  const funnelTxt = generateFunnelInsight(funnel);
  const momentum7 = calcMomentumScore(momentum, funnel);

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-semibold text-[#37352F]">Flow State & Performance</h1>
        <p className="text-[#73726E] mt-1">Deine Muster. Dein Rhythmus. Deine Golden Hours.</p>
      </div>

      {/* Stat Cards */}
      <StatsRow sessions={momentum} />

      {/* Heatmap + Clock nebeneinander */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl border border-[#d6d6d6] p-6 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold text-[#002e7a] uppercase tracking-wider">
            Flow State Heatmap
          </h2>
          <FlowHeatmap cells={heatmap} />
          {peakText && <InsightBox text={peakText} icon="💡" />}
        </div>
        <div className="bg-white rounded-xl border border-[#d6d6d6] p-6 shadow-sm flex flex-col items-center justify-center gap-4">
          <h2 className="text-sm font-semibold text-[#002e7a] uppercase tracking-wider self-start">
            Golden Hours
          </h2>
          <GoldenHoursClock cells={heatmap} />
        </div>
      </div>

      {/* Energie Resonanz */}
      <div className="bg-white rounded-xl border border-[#d6d6d6] p-6 shadow-sm space-y-4">
        <h2 className="text-sm font-semibold text-[#002e7a] uppercase tracking-wider">
          Energie Resonanz
        </h2>
        <p className="text-xs text-[#73726E]">Dein Energielevel × Completion Rate der Sessions</p>
        <EnergyResonanceChart sessions={energyTimeline} />
        {energyTxt && <InsightBox text={energyTxt} icon="⚡" />}
      </div>

      {/* Momentum + Funnel nebeneinander */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-[#d6d6d6] p-6 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold text-[#002e7a] uppercase tracking-wider">
            Bewerbungs-Momentum
          </h2>
          <MomentumScore score={momentum7} sessions={momentum} />
        </div>
        <div className="bg-white rounded-xl border border-[#d6d6d6] p-6 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold text-[#002e7a] uppercase tracking-wider">
            Bewerbungs-Funnel
          </h2>
          <ApplicationFunnel jobs={funnel} />
          {funnelTxt && <InsightBox text={funnelTxt} icon="⚠️" />}
        </div>
      </div>
    </div>
  );
}
```

---

## 6. Insight Engine

Der `InsightBox`-Component bekommt einen generierten Text — keine KI, reine Logik in `lib/analytics/insights.ts`. Das hält die Kosten bei $0 und die Latenz bei 0ms.

| Insight | Logik | Beispiel-Output |
|---|---|---|
| Peak-Fenster | `findPeakWindow(grid, 3)` → Top 3-Stunden-Block | *„Du bist dienstags zwischen 09–12 Uhr am produktivsten."* |
| Energie-Faktor | `highRate / lowRate` über alle Sessions | *„An 🌕-Tagen schließt du 2.8× mehr ab als an 🌑-Tagen."* |
| Funnel-Bottleneck | Größter Drop zwischen zwei aufeinanderfolgenden Status | *„Du verlierst 38% zwischen CV-Optimierung und CL-Generierung."* |
| Konsistenz-Streak | Tage in Folge mit ≥ 1 abgeschlossener Session | *„5-Tage-Streak 🔥 — dein bisher längster."* |
| Momentum-Trend | Letzter 7-Tage-Score vs. vorherige 7 Tage | *„Dein Momentum ist diese Woche +23% gestiegen."* |

---

## 7. Edge Cases

- **Keine Sessions vorhanden:** Alle Charts zeigen einen leeren State mit dem Text „Starte deine erste Pomodoro-Session, um Daten zu sehen." Kein Fehler, kein Loader-Loop.
- **energy_level = null:** Energie-Chart überspringt diese Sessions bei der Rate-Berechnung. Insight-Box erscheint nicht, wenn < 3 Sessions mit Energie-Level vorhanden.
- **User bricht alle Sessions ab:** Completion Rate = 0%. Momentum Score = 0. Kein Crash, aber prominente Nudge: *„Versuch, eine Session vollständig abzuschließen — auch wenn es nur 10 Minuten sind."*
- **jobs-Tabelle leer:** Funnel zeigt leeren State. Momentum Score berechnet sich nur aus Sessions (Energie + Completion Rate).
- **Timezone-Problem:** Alle `started_at`-Timestamps werden in UTC gespeichert. Heatmap-Query auf Server-Seite nutzt `AT TIME ZONE` mit dem User-Profil-Timezone. Default: `Europe/Berlin`.
- **Mehr als 1.000 Sessions:** Query-View ist indiziert. Heatmap-Query aggregiert auf DB-Seite — kein Performance-Problem.
- **Zeitraum-Selektor (7/30/90 Tage):** Heatmap und Golden Hours Clock nutzen immer den vollen Datensatz (bessere Muster-Erkennung). Sparkline und Energy Chart filtern nach gewähltem Zeitraum.

---

## 8. Error Handling

### 8.1 API-Fehler

```typescript
// hooks/use-analytics.ts
import { useState, useEffect } from 'react';

export function useAnalytics(days = 30) {
  const [data, setData]     = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    fetch(`/api/analytics/flow?days=${days}`, { signal: controller.signal })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(setData)
      .catch(err => {
        if (err.name !== 'AbortError') setError(err.message);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [days]);

  return { data, loading, error };
}
```

### 8.2 Pomodoro-Persistierung schlägt fehl

Der Timer-Flow darf **niemals** durch einen fehlschlagenden API-Call blockiert werden. Fire-and-forget:

```typescript
// In handleTimerComplete() in PomodoroCard:
// ⚠️ Kein await — Timer-UI bleibt immer responsiv
fetch('/api/pomodoro/complete', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ started_at, duration_min, completed: true, energy_level })
}).catch(err => {
  console.warn('⚠️ Pomodoro session could not be saved:', err);
  // Kein Toast — User soll nicht gestört werden
});
```

### 8.3 Supabase Query-Fehler

```typescript
// In API Route:
const { data, error } = await supabase.from('pomodoro_heatmap').select(...);
if (error) {
  console.error('[analytics/flow] Supabase error:', error);
  return NextResponse.json({
    heatmap: [],
    momentum: [],
    funnel: [],
    energyTimeline: [],
    _error: 'Partial data — check server logs'
  }, { status: 200 }); // 200 statt 500: Frontend zeigt leere Charts, nicht Error Screen
}
```

---

## 9. Testing Protocol

### 9.1 Unit Tests

```bash
# Insight-Generator testen
jest tests/unit/analytics/insights.test.ts

# Erwartetes Ergebnis:
# ✅ calcMomentumScore: 0 Sessions → Score 0
# ✅ calcMomentumScore: 7 completed Sessions + 3 jobs submitted → Score > 60
# ✅ generatePeakInsight: Peak Di 9–12 → enthält "Dienstag" und "09:00"
# ✅ generateEnergyInsight: < 3 Sessions → null
# ✅ generateFunnelInsight: < 5 Jobs → null
# ✅ findPeakWindow: Korrekte Peak-Erkennung in 7×24 Grid
```

```typescript
// tests/unit/analytics/insights.test.ts (Beispiel)
import { calcMomentumScore, generateEnergyInsight } from '@/lib/analytics/insights';

test('momentum score is 0 with no sessions', () => {
  expect(calcMomentumScore([], [])).toBe(0);
});

test('energy insight returns null with < 3 high/low sessions', () => {
  const sessions = [
    { energy_level: 5, completed: true, started_at: new Date().toISOString(), duration_min: 25 },
    { energy_level: 1, completed: false, started_at: new Date().toISOString(), duration_min: 25 },
  ];
  expect(generateEnergyInsight(sessions)).toBeNull();
});

test('energy insight returns string with enough data', () => {
  const high = Array(5).fill({ energy_level: 5, completed: true,  started_at: new Date().toISOString(), duration_min: 25 });
  const low  = Array(5).fill({ energy_level: 1, completed: false, started_at: new Date().toISOString(), duration_min: 25 });
  expect(typeof generateEnergyInsight([...high, ...low])).toBe('string');
});
```

### 9.2 Integrations-Test

```bash
# API Routes testen (mit Supabase Test-DB)
jest tests/integration/analytics.test.ts

# Erwartetes Ergebnis:
# ✅ POST /api/pomodoro/complete: 201, Session in DB
# ✅ GET /api/analytics/flow: 200, alle 4 Arrays vorhanden
# ✅ GET /api/analytics/flow?days=7: Momentum-Array enthält nur Sessions < 7 Tage alt
# ✅ Unauthenticated Request: 401
```

### 9.3 Heatmap Render-Test

```typescript
// tests/unit/components/flow-heatmap.test.tsx
import { render, screen } from '@testing-library/react';
import { FlowHeatmap } from '@/app/dashboard/analytics/components/flow-heatmap';

test('renders 7×24 = 168 cells', () => {
  const cells = [{ day: 2, hour: 10, count: 5, completedCount: 4, avgEnergy: 4 }];
  const { container } = render(<FlowHeatmap cells={cells} />);
  // 7 Tage × 24 Stunden = 168 Zellen + 7 Day-Labels + 1 Empty + 24 Hour-Labels = 200 DOM-Elemente
  const cellDivs = container.querySelectorAll('[title]');
  expect(cellDivs.length).toBe(168);
});
```

### 9.4 End-to-End Test (manuell)

```
1. Pomodoro starten (25min, Energielevel 🌔 setzen)
2. Auf "Skip" klicken (abgebrochen) → Session mit completed=false geprüft
3. Neuen Pomodoro starten → Timer läuft auf 0 → completed=true geprüft
4. /dashboard/analytics öffnen
5. Heatmap: Heutige Uhrzeit muss eine gefärbte Zelle haben
6. Golden Hours Clock: Heutiger Stunde-Segment muss hervorgehoben sein
7. Energy Resonance: Energie 4 (🌔) mit 1 completed Session → Bar vorhanden
8. Funnel: Alle bestehenden Jobs im korrekten Status-Step
9. Momentum Score: > 0 wenn ≥ 1 Session abgeschlossen
10. Zeitraum-Toggle 7/30/90 Tage → Sparkline ändert sich
```

---

## Outputs (Deliverables)

- **`/dashboard/analytics` Page** mit allen 5 Charts: Heatmap, Radial Clock, Energy Resonance, Momentum, Funnel
- **`pomodoro_sessions` Tabelle** in Supabase mit RLS
- **`pomodoro_heatmap` View** in Supabase (aggregiert, performant)
- **`POST /api/pomodoro/complete`** Route (Fire-and-forget, blockiert niemals UI)
- **`GET /api/analytics/flow`** Route (Single Call für alle Analytics-Daten)
- **`lib/analytics/insights.ts`** — reine Logik, keine KI, 0 Kosten, 0ms Latenz
- **Energy Check-in** in `PomodoroCard` (5 Moon-Emojis, optional, nie erzwungen)
- **`InsightBox`-Component** — auto-generierte Texte unter jedem Chart

---

## Master Prompt Template Compliance

Dieses Dokument orientiert sich am `Master_Prompt_Template.md` aus [`dev-playbook/directives/`](https://github.com/yannikgaletto-art/dev-playbook/tree/main/directives).

### ✅ Sections Included:

1. **Goal** — Klares, einzeiliges Ziel ✅
2. **Inputs** — Alle getrackte Events mit Typ, Pflichtfeld, Datenpunkt ✅
3. **Tools/Services** — Vollständige Dependency-Liste ✅
4. **Process** — Schritt-für-Schritt mit Code, SQL, UI-Mockup ✅
5. **Outputs (Deliverables)** — Klar markiert ✅
6. **Edge Cases** — Timezone, leere States, Abort, Performance ✅
7. **Error Handling** — Fire-and-forget, Partial Data, Supabase Fehler ✅
8. **Testing Protocol** — Unit, Integration, Render, E2E ✅

### ✅ Design-Prinzipien:

- **Kein externes Analytics-Tool:** Alle Daten in Supabase — DSGVO-konform by design ✅
- **Energie ist optional, nie erzwungen:** Der User bestimmt, wann er eincheckt ✅
- **Insight aus Logik, nicht aus KI:** 0 Token-Kosten für jeden generierten Text ✅
- **Charts ohne externe Mapping-Library:** Heatmap + Radial Clock = reines SVG ✅
- **Timer-UI nie blockiert:** Persistierung ist immer Fire-and-forget ✅
- **Silicon Valley-Prinzip:** Jeder Chart trägt eine konkrete Handlungsempfehlung ✅
- **Lee Harris-Prinzip:** Energie-Tracking ist sanft, nicht gamifiziert ✅

---

*Letzte Aktualisierung: Feb 2026 · Yannik Galetto*
