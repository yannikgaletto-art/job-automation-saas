# KALENDER-TASK-SYNC.md — Pathly Focus & Timeblocking Engine

**Status:** In Development · Stand: Feb 2026
**Scope:** Daily Timeline (Drag & Drop) · Inbox Integration · Focus Mode (Pomodoro) · Phone Focus Nudge · **Fortschritt-Tracking (Optional)**
**Template:** Orientiert sich am [Master_Prompt_Template.md](https://github.com/yannikgaletto-art/dev-playbook/tree/main/directives)

---

## Goal

Ein nahtloses Timeblocking- und Fokus-System in das Pathly Dashboard integrieren, das es dem User ermöglicht, Aufgaben per Drag & Drop in eine tagesbasierte Timeline zu verschieben, automatisch Zeitblöcke zu berechnen, und mit einem Klick in einen kontext-gebundenen Pomodoro-Focus-Modus zu wechseln — inklusive Handy-Nudge für maximale Fokustiefe.

**Neu:** Im Kalender kann der User **optional** den Fortschritt eines Tasks eintragen (0–100 %). Tasks müssen nicht zwingend abgeschlossen werden — Teilfortschritt und Carry-Over auf den nächsten Tag sind vollwertige Outcomes, kein Fehlerfall.

---

## Inputs

| Parameter | Pflichtfeld | Typ | Beispielwert |
|---|---|---|---|
| `task.title` | ✅ Ja | String | "Anschreiben Patagonia" |
| `task.estimated_minutes` | ✅ Ja | Integer (Dropdown: 15, 30, 60, 120) | 60 |
| `task.scheduled_start` | ✅ Ja (nach Drop) | Timestamptz | `2026-02-24T10:00:00Z` |
| `task.scheduled_end` | Auto-berechnet | Timestamptz | `2026-02-24T11:00:00Z` |
| `task.status` | Auto | Enum | `inbox \| scheduled \| focus \| in_progress \| completed \| carry_over` |
| `task.pomodoros_completed` | Auto | Integer | 2 |
| `task.progress_percent` | ❌ Optional | Integer (0–100) | 50 |
| `task.progress_note` | ❌ Optional | Text (Autosave) | "Intro fertig, Body fehlt noch" |
| `task.notes` | ❌ Optional | Text (Autosave) | "Patagonia B-Corp Referenz einbauen" |
| `task.carry_over_to` | ❌ Optional (Auto bei Carry-Over) | Date | `2026-02-25` |
| `user.focus_mode_preference` | ❌ Optional | Boolean | true |

---

## Tools / Libraries

| Tool | Rolle | Warum |
|---|---|---|
| `@dnd-kit/core` | Drag & Drop Engine | Modern, accessible, Touch-Support, keine jQuery-Abhängigkeit |
| `@dnd-kit/utilities` | Drop-Koordinaten berechnen | Konvertiert Pixel-Position in Zeitslot (z.B. y=320px → 10:30 Uhr) |
| Framer Motion | Animationen (Inbox ↔ Focus Mode Übergang) | Silicon-Valley-Feel: keine harten Übergänge |
| Zustand | Client State (Optimistic UI) | Task-Status sofort im UI updaten, DB-Sync im Hintergrund |
| React `setInterval` | Pomodoro Timer | Native React Hook, kein externer Service nötig |
| Supabase Realtime | DB-Sync für `scheduled_start`, `status`, `progress_percent` | Persistiert Timer-Stand, Task-Status und Fortschritt |

---

## 1. Layout-Architektur

Das Dashboard nutzt ein dynamisches Zwei-Spalten-Layout. Die rechte Spalte ändert ihren Kontext kontextsensitiv — sie ist kein statisches Element, sondern reagiert auf den aktuellen Arbeitsmodus des Users.

```
┌─────────────────────────────────┬───────────────────────────────────┐
│  LINKE SPALTE                   │  RECHTE SPALTE                    │
│  "Today's Timeline"             │  "Context Panel"                  │
│                                 │                                   │
│  08:00 ──────────────────────── │  [MODUS A: Inbox]                 │
│  09:00 ┌──────────────────────┐ │  · Anschreiben Patagonia    [1h]  │
│        │ Meeting Kickoff      │ │  · Landing Page bauen       [2h]  │
│  10:00 ├──────────────────────┤ │  · SerpAPI anpassen         [30m] │
│        │ << drop task here >> │ │                                   │
│  11:00 ├──────────────────────┤ │  ── Scheduled ──────────────────  │
│        │ CV Pathly ░░░░░ 50%  │ │  ✓ CV Pathly update  10:00 ↗      │
│  12:00 ──────────────────────── │     ░░░░░░░░░░ 50%               │
│                                 │  [MODUS B: Focus Mode]            │
│  ⚡ 4h 30m Free Today           │  (wechselt bei Task-Klick)        │
└─────────────────────────────────┴───────────────────────────────────┘
```

> Blocks mit Teilfortschritt werden durch einen **horizontalen Fortschrittsbalken** am unteren Rand des Timeline-Blocks visualisiert (z.B. halb gefüllt bei 50%).

---

## 2. Modus A: Inbox & Drag & Drop (Planungsphase)

### 2.1 Inbox-Verhalten

Jeder Task in der rechten Inbox-Liste ist ein Draggable-Element mit folgendem Aufbau:

```
┌─────────────────────────────────────────────────────────┐
│  ⠿  Anschreiben Patagonia Berlin              [1h ▾]   │
│     Schätzung: 60 min · Status: Inbox                   │
└─────────────────────────────────────────────────────────┘
```

- Das `[1h ▾]` Dropdown ändert `task.estimated_minutes` (Optionen: 15m, 30m, 1h, 2h, 3h).
- Die visuelle Größe des Task-Blocks im Kalender errechnet sich automatisch aus `estimated_minutes`.
- **Carry-Over Tasks** erscheinen mit einem speziellen Badge `↩ Von gestern` oben in der Inbox.

### 2.2 Drag & Drop Logik

`onDragEnd` Event (Kernlogik):

```typescript
function onDragEnd(event: DragEndEvent) {
  const { active, over } = event;

  if (!over) return; // Außerhalb der Timeline fallen gelassen

  const task = getTaskById(active.id);
  const dropSlot = getTimeSlotFromDroppableId(over.id);
  // over.id ist z.B. "slot-10:00" → parsed zu heute 10:00 Uhr

  const scheduledStart = dropSlot;
  const scheduledEnd = addMinutes(scheduledStart, task.estimated_minutes);

  // 1. Optimistic UI Update (sofort, ohne DB-Warten)
  updateTaskInLocalState(task.id, {
    status: 'scheduled',
    scheduled_start: scheduledStart,
    scheduled_end: scheduledEnd,
  });

  // 2. DB Sync im Hintergrund
  supabase.from('tasks').update({
    status: 'scheduled',
    scheduled_start: scheduledStart.toISOString(),
    scheduled_end: scheduledEnd.toISOString(),
  }).eq('id', task.id);
}
```

### 2.3 Kollisions-Handling

- Wenn ein Task auf einen Slot gedroppt wird, der bereits belegt ist, verschiebt das UI den Konflikt automatisch nach unten (Best-Effort Push-Down).
- Überlappungen sind verboten. Visuelles Feedback: Roter Rand beim Hover über einen belegten Slot.
- Toast: „10:00–11:00 ist bereits belegt. Auf 11:00 verschoben."

---

## 3. Modus B: Focus Mode (Ausführungsphase)

### 3.1 Trigger & Übergang

Der Focus Mode wird auf zwei Wegen ausgelöst:

- **Trigger A (Manuell):** User klickt auf einen geplanten Task-Block in der linken Timeline.
- **Trigger B (Automatisch/Optional):** Die aktuelle Uhrzeit überschneidet sich mit `task.scheduled_start`. Das System erkennt: „Dein Block für 'Anschreiben Patagonia' startet jetzt."

### 3.2 Focus Mode Confirmation Modal

> ⚠️ Vor dem Eintritt in den Focus Mode wird der User **immer** gefragt.

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│  🎯  Bereit für Deep Work?                                   │
│                                                              │
│  Du wirst gleich starten mit:                                │
│  „Anschreiben Patagonia Berlin"                              │
│  Geplante Zeit: 10:00 – 11:00 Uhr (60 min · 2 Pomodoros)   │
│                                                              │
│  ─────────────────────────────────────────────────────────  │
│                                                              │
│  📵  Empfehlung:                                             │
│  Lege dein Handy in den Fokus-Modus (DND / Focus Mode),     │
│  damit Benachrichtigungen dich nicht aus dem Flow reißen.   │
│                                                              │
│  iOS:     Einstellungen → Fokus → Nicht stören              │
│  Android: Schnelleinstellungen → Bitte nicht stören         │
│                                                              │
│  ─────────────────────────────────────────────────────────  │
│                                                              │
│  [Ich bin bereit – Focus starten ✓]  [Später erinnern]      │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**UX-Regeln für das Modal:**
- Das Modal erscheint nie mehr als 1× pro Task-Session (kein Spam bei Klick-Wiederholung).
- Der „Später erinnern"-Button schließt das Modal ohne Konsequenz.
- Die Handy-Empfehlung ist dezent, nicht lehrerhaft — ein einzelner Satz mit praktischer Kurzanleitung, kein Aufsatz.
- `user.focus_mode_preference = true` kann das Modal dauerhaft auf "Direkt starten" setzen (Checkbox: „Nicht mehr fragen").

### 3.3 Focus Mode UI

Nach Bestätigung wechselt die rechte Spalte zu einem minimalen, ablenkungsarmen Focus-Panel:

```
┌──────────────────────────────────────────────────────────────┐
│  Anschreiben Patagonia Berlin                                │
│  10:00 – 11:00 · 🍅 🍅                                       │
│                                                              │
│              ┌─────────────────┐                            │
│              │    25:00        │                            │
│              │   ▶  START      │                            │
│              └─────────────────┘                            │
│                                                              │
│  Pomodoro 1 von 2                                            │
│  ● ○                                                         │
│                                                              │
│  Notizen zu dieser Session:                                  │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Patagonia B-Corp Referenz einbauen...                  │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  [✓ Goal erledigt]  [⏸ Pause / Fortschritt]  [↩ Inbox]     │
└──────────────────────────────────────────────────────────────┘
```

> **Neu:** Der Button `[⏸ Pause / Fortschritt]` öffnet das optionale **Fortschritts-Mini-Panel** (Abschnitt 3.6). Statt einen Task einfach zu verlassen, kann der User bewusst entscheiden — muss aber nichts eintragen.

### 3.4 Pomodoro-Logik

```typescript
const POMODORO_DURATION = 25 * 60; // 25 Minuten in Sekunden
const BREAK_DURATION = 5 * 60;     // 5 Minuten Pause

function usePomodoroTimer(task: Task) {
  const [secondsLeft, setSecondsLeft] = useState(POMODORO_DURATION);
  const [isRunning, setIsRunning] = useState(false);
  const [isBreak, setIsBreak] = useState(false);

  useEffect(() => {
    if (!isRunning) return;

    const interval = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          playDingSound(); // Kurzes Audio-Signal am Ende

          if (!isBreak) {
            // Pomodoro abgeschlossen → DB updaten
            supabase.from('tasks').update({
              pomodoros_completed: task.pomodoros_completed + 1
            }).eq('id', task.id);

            setIsBreak(true);
            return BREAK_DURATION; // Pause starten
          } else {
            setIsBreak(false);
            return POMODORO_DURATION; // Neuer Pomodoro
          }
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning, isBreak]);

  return { secondsLeft, isRunning, isBreak, setIsRunning };
}
```

**Pomodoro-Verteilung nach Schätzung:**

| `estimated_minutes` | Pomodoros | Darstellung |
|---|---|---|
| 15–30 min | 1 | 🍅 |
| 31–60 min | 2 | 🍅 🍅 |
| 61–90 min | 3 | 🍅 🍅 🍅 |
| 91–120 min | 4 | 🍅 🍅 🍅 🍅 |

---

## 3.5 Goal Completed — Abschluss-Ritual

Wenn der User auf „✓ Goal erledigt" klickt:

1. **Animation:** Kurze Confetti-Animation (via `canvas-confetti`, 1.5 Sekunden).
2. **Timeline:** Der Block auf der linken Seite wechselt seine Farbe auf Grün mit einem ✓-Icon.
3. **DB Update:** `task.status = 'completed'`, `task.progress_percent = 100`, `task.completed_at = now()`.
4. **Rechte Spalte:** Springt mit Framer Motion Slide-Animation zurück zur Inbox.
5. **Inbox-Header:** Counter aktualisiert sich: „2 von 5 Zielen heute erledigt 🔥"

---

## 3.6 Fortschritts-Tracking — Optional, Kein Zwang

> **Designprinzip:** Der User wird nie gezwungen, einen Fortschritt einzutragen. Kein Pflichtfeld, kein Blocking-Modal. Tasks können einfach enden, ohne dokumentiert zu werden. Das System behandelt das respektvoll — kein „Du hast XY nicht erledigt"-Schuldgefühl.

### Fortschritts-Mini-Panel

Aufrufbar über `[⏸ Pause / Fortschritt]` oder nach Ablauf des geplanten Zeitblocks (sofern der Task nicht abgeschlossen ist):

```
┌──────────────────────────────────────────────────────────────┐
│  ⏸  Wo stehst du gerade?                                    │
│  „Anschreiben Patagonia Berlin"                              │
│                                                              │
│  Fortschritt (optional):                                     │
│  ○──────────────────────● ─────────────  [ 50% ]            │
│  (Slider oder freies Eingabefeld, 0–100)                     │
│                                                              │
│  Kurze Notiz (optional):                                     │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Intro fertig, Body fehlt noch...                       │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  Was möchtest du tun?                                        │
│                                                              │
│  [▶ Weiter fokussieren]  [↩ Auf morgen]  [✓ Fertig]        │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**Verhalten der Buttons:**

| Aktion | Status danach | DB-Update |
|---|---|---|
| `▶ Weiter fokussieren` | `focus` (bleibt) | `progress_percent` gespeichert, falls eingegeben |
| `↩ Auf morgen` | `carry_over` | `carry_over_to = tomorrow`, `progress_percent` optional |
| `✓ Fertig` | `completed` | `progress_percent = 100` (override), `completed_at = now()` |

> Wenn der User das Panel einfach schließt (X / Escape), passiert **nichts**. Kein Status-Wechsel, keine Toast-Meldung.

### Visuelle Darstellung im Kalender-Block

Ein Task mit eingetragenem Teilfortschritt zeigt am unteren Rand des Timeline-Blocks einen **dünnen Fortschrittsbalken**:

```
┌──────────────────────────────────────────┐
│  Anschreiben Patagonia                   │
│  10:00 – 11:00                           │
│  ████████████░░░░░░░░ 60%               │
└──────────────────────────────────────────┘
```

| Zustand | Balken | Farbe |
|---|---|---|
| `progress_percent = null` / 0% | Unsichtbar — kein visueller Noise | — |
| 1–99% | Teilweise gefüllt | Orange/Amber |
| 100% / `completed` | Voll + ✓-Icon | Grün |

### Carry-Over: Task auf den nächsten Tag verschieben

Wenn der User `↩ Auf morgen` wählt:

```typescript
async function carryOverTask(taskId: string, progressPercent?: number, note?: string) {
  const tomorrow = addDays(new Date(), 1);

  updateTaskInLocalState(taskId, {
    status: 'carry_over',
    carry_over_to: tomorrow,
    progress_percent: progressPercent ?? undefined,
    progress_note: note ?? undefined,
  });

  await supabase.from('tasks').update({
    status: 'carry_over',
    carry_over_to: tomorrow.toISOString().split('T')[0],
    progress_percent: progressPercent ?? null,
    progress_note: note ?? null,
  }).eq('id', taskId);

  toast.success(`„${taskTitle}" auf morgen verschoben. Erscheint morgen oben in der Inbox.`);
}
```

**Carry-Over Badge in der Inbox (am nächsten Tag):**

```
┌─────────────────────────────────────────────────────────┐
│  ↩  Anschreiben Patagonia Berlin     [Von gestern · 50%]│
│     Schätzung: 60 min · Noch ~30 min offen              │
└─────────────────────────────────────────────────────────┘
```

> „Noch ~30 min offen" berechnet sich aus `estimated_minutes * (1 - progress_percent / 100)`.

---

## 4. Supabase Datenbankschema

Ergänzung zur bestehenden Tasks/Goals-Tabelle:

```sql
-- Neue Spalten für Timeblocking, Focus Mode & optionales Fortschritts-Tracking
ALTER TABLE tasks
  ADD COLUMN estimated_minutes    INTEGER DEFAULT 60,
  ADD COLUMN status               TEXT DEFAULT 'inbox',
  -- Status-Flow: inbox → scheduled → focus → in_progress → completed
  --                                                      ↘ carry_over
  ADD COLUMN scheduled_start      TIMESTAMPTZ,
  ADD COLUMN scheduled_end        TIMESTAMPTZ,
  ADD COLUMN pomodoros_completed  INTEGER DEFAULT 0,
  ADD COLUMN notes                TEXT,
  ADD COLUMN completed_at         TIMESTAMPTZ,
  -- Optionales Fortschritts-Tracking
  ADD COLUMN progress_percent     INTEGER CHECK (progress_percent BETWEEN 0 AND 100),
  ADD COLUMN progress_note        TEXT,
  ADD COLUMN carry_over_to        DATE;

-- User-Präferenz für Focus Modal
ALTER TABLE user_settings
  ADD COLUMN skip_focus_confirmation BOOLEAN DEFAULT false;

-- Index für Tages-Ansicht Performance
CREATE INDEX idx_tasks_scheduled_start
  ON tasks (user_id, scheduled_start)
  WHERE status IN ('scheduled', 'focus', 'in_progress');

-- Index für Carry-Over Inbox
CREATE INDEX idx_tasks_carry_over
  ON tasks (user_id, carry_over_to)
  WHERE status = 'carry_over';
```

---

## 5. Implementierungsplan (Phasen)

| Phase | Aufgabe | Dauer (est.) |
|---|---|---|
| 1 | Statisches UI: Timeline-Grid (CSS Grid, 8–20h) + Inbox-Liste | 1 Tag |
| 2 | `@dnd-kit` Integration: Drag von Inbox, Drop auf Timeline-Slots | 2 Tage |
| 3 | Optimistic UI + Supabase Sync (`onDragEnd` Handler) | 1 Tag |
| 4 | Kollisions-Handling + Resize-Handle (unterer Rand des Blocks) | 1 Tag |
| 5 | Focus Mode UI (Timer, Notizen, Pomodoro-Dots) | 1 Tag |
| 6 | Confirmation Modal + Phone Focus Nudge | 0.5 Tage |
| 7 | **Fortschritts-Mini-Panel** (Slider, Carry-Over, Partial-State) | **1 Tag** |
| 8 | Abschluss-Ritual (Confetti, Green-State, Inbox-Counter) | 0.5 Tage |
| 9 | Framer Motion Übergänge + UX-Polish | 1 Tag |
| **Gesamt** | | **~9 Tage** |

---

## 6. Edge Cases

| Szenario | Verhalten |
|---|---|
| Task ohne `estimated_minutes` | Standardwert 60 Minuten. Toast: „Dauer nicht gesetzt — 1h als Standard verwendet." |
| Overlap beim Drop | Push-Down-Logik. Wenn kein freier Slot bis 20:00 → Toast: „Kein freier Slot. Task bleibt in der Inbox." |
| Browser-Tab wechseln während Pomodoro | Timer läuft im Hintergrund weiter (via `setInterval`) |
| User klickt „Später erinnern" im Modal | Task bleibt `scheduled`, Focus Mode startet nicht |
| Task dauert länger als geplant | Resize-Handle nach unten → updated `scheduled_end` und `estimated_minutes` live |
| Fortschritts-Panel wird **nicht** ausgefüllt | Kein Fehler, kein Blocking. `progress_percent` bleibt `null`. User wählt trotzdem eine Aktion (Weiter / Morgen / Fertig) |
| User schließt Fortschritts-Panel ohne Auswahl | Kein Status-Wechsel, keine Toast-Meldung. Task bleibt wie er war. |
| User klickt weder „Fertig" noch „Auf morgen" | Block bleibt im Kalender stehen (kein Auto-Carry-Over). Am nächsten Tag erscheint ein subtiles Banner: „Gestern offengeblieben: Anschreiben Patagonia — Was möchtest du tun?" |
| Carry-Over Task wird mehrfach verschoben | Jedes Carry-Over überschreibt `carry_over_to`. Kein Stack. Badge zeigt immer „Von [Datum]". |
| Handy-Nudge iOS vs. Android | Beide mit Kurzanleitung im Modal — kein technischer Hook, nur Text |

---

## 7. Error Handling

```typescript
// Optimistic Rollback bei DB-Fehler (gilt auch für Fortschritts-Updates)
async function updateTaskProgress(
  taskId: string,
  progressPercent: number | null,
  progressNote: string | null
) {
  const previousState = getTaskFromLocalState(taskId);

  updateTaskInLocalState(taskId, {
    progress_percent: progressPercent,
    progress_note: progressNote,
  });

  try {
    await supabase.from('tasks').update({
      progress_percent: progressPercent,
      progress_note: progressNote,
    }).eq('id', taskId);
  } catch (error) {
    updateTaskInLocalState(taskId, previousState);
    toast.error('Fortschritt konnte nicht gespeichert werden. Bitte erneut versuchen.');
  }
}

// Optimistic Rollback für scheduleTask
async function scheduleTask(taskId: string, start: Date, end: Date) {
  const previousState = getTaskFromLocalState(taskId);
  updateTaskInLocalState(taskId, { status: 'scheduled', scheduled_start: start });

  try {
    await supabase.from('tasks').update({
      status: 'scheduled',
      scheduled_start: start.toISOString(),
      scheduled_end: end.toISOString(),
    }).eq('id', taskId);
  } catch (error) {
    updateTaskInLocalState(taskId, previousState);
    toast.error('Zeitblock konnte nicht gespeichert werden. Bitte erneut versuchen.');
  }
}
```

---

## 8. Testing Protocol

### 8.1 Unit Tests

```bash
jest tests/unit/pomodoro-timer.test.ts          # Timer-Logik (25min → Pause → reset)
jest tests/unit/drag-drop-logic.test.ts         # Zeitslot-Berechnung aus Pixel-Position
jest tests/unit/collision-handler.test.ts       # Push-Down bei Overlap
jest tests/unit/progress-tracker.test.ts        # Fortschritt: null-Safe, 0–100 Validierung
jest tests/unit/carry-over-logic.test.ts        # carry_over_to Berechnung, Badge-Text
```

### 8.2 Integrations-Test

```bash
jest tests/integration/timeblocking-flow.test.ts
# Erwartet:
# ✅ Task in Inbox → drag → drop auf 10:00 → erscheint als Block 10:00–11:00
# ✅ Supabase: scheduled_start = 10:00, status = 'scheduled'
# ✅ Inbox: Task zeigt 'Scheduled for 10:00'
# ✅ Fortschritt 50% eintragen → Balken sichtbar, progress_percent = 50 in DB
# ✅ Carry-Over → Task verschwindet aus heutigem Kalender, erscheint morgen in Inbox mit Badge
# ✅ Fortschritts-Panel schließen ohne Eingabe → kein Status-Wechsel, kein DB-Write
```

### 8.3 Focus Mode & Fortschritt E2E (manuell)

```
1.  Task anlegen (Titel: "Test Task", Dauer: 30 Min)
2.  Auf 10:00 in Timeline droppen
3.  Auf Task-Block klicken → Confirmation Modal erscheint
4.  "Ich bin bereit" klicken
5.  Focus Mode öffnet sich (Timer 25:00)
6.  Start klicken → Timer läuft
7.  "⏸ Pause / Fortschritt" klicken
8.  Fortschritts-Panel erscheint → Slider auf 50% ziehen
9.  Kurze Notiz eingeben (optional)
10. "↩ Auf morgen" klicken
11. Toast erscheint: „Auf morgen verschoben"
12. Supabase prüfen: status = 'carry_over', progress_percent = 50, carry_over_to = morgen
13. Morgen: Task erscheint oben in Inbox mit Badge „↩ Von gestern · 50%"
--- Zweiter Durchlauf ---
14. Task erneut in Timeline droppen, Focus starten
15. "✓ Goal erledigt" klicken → Confetti, Block wird grün
16. Supabase: status = 'completed', progress_percent = 100
--- Panel ohne Eingabe schließen ---
17. Focus starten → "⏸ Pause / Fortschritt" klicken
18. Panel erscheint → ohne Eingabe per Escape schließen
19. Erwartung: kein Toast, kein DB-Write, Timer läuft weiter
```

---

## Outputs (Deliverables)

- Timeline-Komponente in Pathly Dashboard (linke Spalte, heute)
- Inbox mit Drag & Drop (rechte Spalte, Modus A) inkl. Carry-Over Badge
- Focus Mode mit Pomodoro-Timer (rechte Spalte, Modus B)
- **Fortschritts-Mini-Panel** (optional aufrufbar, kein Pflichtfeld)
- **Fortschrittsbalken** im Timeline-Block (0% = unsichtbar, 1–99% = Orange, 100% = Grün)
- **Carry-Over-Flow** (`status = carry_over`, `carry_over_to`, Badge am nächsten Tag)
- Confirmation Modal mit Phone-Focus-Empfehlung (dezent, einmalig pro Session)
- Supabase Schema erweitert (10 neue Felder)

---

## Master Prompt Template Compliance

Orientiert sich am [Master_Prompt_Template.md](https://github.com/yannikgaletto-art/dev-playbook/tree/main/directives).

**✅ Sections Included:**
- Goal — Klares, einzeiliges Ziel ✅
- Inputs — Alle Parameter mit Typ, Pflichtfeld, Beispiel ✅
- Tools/Libraries — Vollständige Dependency-Liste mit Begründung ✅
- Process — UI-Flow, Drag & Drop, Focus Mode, Fortschritt, Pomodoro mit Code ✅
- Outputs (Deliverables) — Klar markiert ✅
- Edge Cases — Browser-Tab, Overlap, Resize, Handy-Nudge, Carry-Over ✅
- Error Handling — Optimistic Rollback, Toast-Feedback ✅
- Testing Protocol — Unit, Integration, E2E ✅

**✅ Qualitätsprinzipien:**
- Human-in-the-Loop: Kein automatischer Einstieg in Focus Mode ohne User-Bestätigung ✅
- **Fortschritt ist Optional:** Kein Pflichtfeld, kein Blocking bei Auslassen ✅
- **Carry-Over ohne Schuldgefühl:** Task „auf morgen" ist ein valider Workflow, kein Fehlerfall ✅
- Phone Focus Nudge: Dezent, praktisch, nicht lehrerhaft ✅
- No External Dependencies für Timer: Nur `setInterval`, kein Drittdienst ✅
- Optimistic UI: User merkt nie eine Ladezeit beim Drag & Drop oder Fortschritts-Update ✅
