# AGENT PROMPT: PHASE 10.2 — MAGIC QUEUE PULSE-RING ANIMATION

---
Version: 1.0.0
Last Updated: 2026-03-03
Status: AKTIV
---

## MISSION
Add a satisfying "Pulse Ring + Morph" micro-animation to the `AddToQueueButton`
when a job is added to the queue. Additionally, display a live badge counter on
the sidebar's "Job Queue" NavItem that increments with a spring bounce.

**The existing AddToQueueButton logic and all other UI elements MUST remain
100% functional and unchanged. This is purely additive visual enhancement.**

**WICHTIG: KEINE Confetti-Animation verwenden — Confetti ist bereits für andere
Features reserviert. Stattdessen: Pulse Ring + Morph (siehe Details unten).**

## PREREQUISITES — READ FIRST!

1. **`CLAUDE.md`** — "Reduce Complexity!" + Visual Standards + Vibecoding
2. **`docs/SICHERHEITSARCHITEKTUR.md`** — Safety Contracts
3. **`directives/FEATURE_IMPACT_ANALYSIS.md`** — Impact Map is pre-approved
4. **`directives/FEATURE_COMPAT_MATRIX.md`** §0.1 — Forbidden Files check (NONE touched here)
5. **`docs/MOTION_PRINCIPLES.md`** — Framer Motion Pflichtlektüre
6. **`app/dashboard/job-search/page.tsx`** — READ `AddToQueueButton` (lines 708-766)
7. **`components/motion/sidebar.tsx`** — READ `NavItem` with `badge` prop (lines 59-132)
8. **`app/dashboard/layout.tsx`** — READ how NavItem is rendered (72 lines)
9. **`store/`** — Understand existing Zustand store patterns

## CURRENT STATE
- ✅ `AddToQueueButton` exists (lines 708-766) with `adding` + `added` states
- ✅ On success: button changes to green "In der Queue" `<span>` (static, no animation)
- ✅ `NavItem` in sidebar already supports `badge?: number` prop
- ✅ Framer Motion is already imported in `page.tsx`
- ✅ `components/motion/count-up.tsx` exists for number animations
- ✅ `Badge` component exists in `components/motion/badge.tsx`
- ⚠️ No animation on success state transition
- ⚠️ No live badge counter on sidebar Job Queue NavItem
- ⚠️ No Zustand store for queue count

## YOUR TASK

### 10.2.1: Zustand Store — Queue Count
**Goal:** Create a simple Zustand store for the sidebar badge counter.

**Implementation — `store/use-job-queue-count.ts`:**
```typescript
import { create } from 'zustand';

interface JobQueueCountStore {
    count: number;
    setCount: (n: number) => void;
    increment: () => void;
}

export const useJobQueueCount = create<JobQueueCountStore>((set) => ({
    count: 0,
    setCount: (n) => set({ count: n }),
    increment: () => set((state) => ({ count: state.count + 1 })),
}));
```

### 10.2.2: Sidebar Badge Integration
**Goal:** Show a live badge on the "Job Queue" NavItem in the sidebar.

**Implementation in `app/dashboard/layout.tsx`:**
1. Import `useJobQueueCount` store
2. On mount: fetch `/api/jobs/list` (existing endpoint) to get initial count. If `/api/jobs/list` does not exist or does not return an array, gracefully fall back to `0`. (Do not create a new route if one doesn't exist, just initialize to 0 and let it increment from there).
3. Pass `badge={count}` to the "Job Queue" `NavItem`
4. Example:
   ```tsx
   const { count: queueCount, setCount } = useJobQueueCount();
   
   useEffect(() => {
       fetch('/api/jobs/list')
           .then(r => r.json())
           .then(data => {
               if (data.jobs && Array.isArray(data.jobs)) {
                   setCount(data.jobs.length);
               }
           })
           .catch(() => {}); // Silent — badge is nice-to-have
   }, [setCount]);
   
   // In JSX:
   <NavItem icon={Inbox} label="Job Queue" href="/dashboard/job-queue"
       shortcut="Q" badge={queueCount > 0 ? queueCount : undefined} />
   ```

### 10.2.3: Sidebar Badge Bounce Animation
**Goal:** When the badge number changes, it should bounce with a spring animation.

**Implementation in `components/motion/sidebar.tsx`:**
1. Wrap the existing `Badge` rendering in `NavItem` with `AnimatePresence` + `motion.div`
2. Use `key={badge}` to trigger re-mount animation on number change:
   ```tsx
   {badge && badge > 0 && (
       <AnimatePresence mode="wait">
           <motion.div
               key={badge}
               initial={{ scale: 1.5, opacity: 0 }}
               animate={{ scale: 1, opacity: 1 }}
               transition={{ type: 'spring', stiffness: 500, damping: 15 }}
           >
               <Badge variant="primary" interactive>
                   {badge}
               </Badge>
           </motion.div>
       </AnimatePresence>
   )}
   ```

### 10.2.4: AddToQueueButton — Pulse Ring + Morph Animation
**Goal:** When add is successful, play a satisfying micro-animation.

**Die Animation hat 3 Phasen (alle via Framer Motion):**

**Phase 1 — Button Morph (0ms–300ms):**
- Der blaue "Hinzufügen"-Button morpht in einen grünen Kreis mit Checkmark
- `motion.button` → `layoutId="add-queue-btn"` für smooth morph
- Background: `bg-[#002e7a]` → `bg-green-500`
- Icon: `Plus` → `CheckCircle2`
- Text faded raus, nur Icon bleibt

**Phase 2 — Pulse Rings (200ms–800ms):**
- Zwei konzentrische Ringe expanden aus dem Button-Zentrum
- Ring 1: `scale: [1, 2.5]`, `opacity: [0.4, 0]`, `duration: 0.6`
- Ring 2: `scale: [1, 2]`, `opacity: [0.3, 0]`, `duration: 0.5`, `delay: 0.1`
- Ring-Farbe: `border-green-400`
- Position: `absolute`, zentriert auf dem Button

**Phase 3 — Settle (800ms–1200ms):**
- Button settled in den finalen grünen "In der Queue" State
- Matches the existing `added === true` render exactly

**Implementation Pattern:**
```tsx
function AddToQueueButton({ job }: { job: EnrichedJob }) {
    const [adding, setAdding] = useState(false);
    const [added, setAdded] = useState(false);
    const [showPulse, setShowPulse] = useState(false);
    const increment = useJobQueueCount(s => s.increment);

    const handleAdd = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (adding || added) return;
        setAdding(true);
        try {
            const res = await fetch('/api/jobs/ingest', { /* ... existing body ... */ });
            if (res.ok) {
                setShowPulse(true);
                increment(); // ← Sidebar badge hochzählen
                setTimeout(() => {
                    setAdded(true);
                    setShowPulse(false);
                }, 1000); // Animation dauert ~1s
            }
        } catch { /* Silent fail */ }
        finally { setAdding(false); }
    };

    // ... render with pulse rings when showPulse === true
}
```

**Pulse Ring JSX:**
```tsx
{showPulse && (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <motion.div
            className="absolute w-full h-full rounded-lg border-2 border-green-400"
            initial={{ scale: 1, opacity: 0.4 }}
            animate={{ scale: 2.5, opacity: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
        />
        <motion.div
            className="absolute w-full h-full rounded-lg border-2 border-green-400"
            initial={{ scale: 1, opacity: 0.3 }}
            animate={{ scale: 2, opacity: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut', delay: 0.1 }}
        />
    </div>
)}
```

## VERIFICATION CHECKLIST
- [ ] Zustand store `use-job-queue-count.ts` created and exports correctly
- [ ] Sidebar "Job Queue" NavItem shows badge with current count
- [ ] Badge bounces when count changes (spring animation)
- [ ] "Hinzufügen" button plays pulse-ring animation on success
- [ ] Button morphs from blue to green checkmark
- [ ] Two concentric rings expand and fade out
- [ ] After animation completes, final state shows "In der Queue" (existing green span)
- [ ] Counter increments in sidebar simultaneously
- [ ] Animation does NOT use Confetti (Confetti is reserved)
- [ ] Existing button behavior (loading spinner, disabled state) unchanged
- [ ] `npx tsc --noEmit` passes
- [ ] Visual style matches Pathly aesthetics

## SUCCESS CRITERIA
✅ Adding a job to the queue feels satisfying and premium
✅ Sidebar badge provides at-a-glance queue awareness
✅ Zero visual regression on existing UI elements
✅ Animation is smooth (60fps) and not distracting

## ⚠️ FORBIDDEN — DO NOT:
- ❌ Delete or restructure existing AddToQueueButton logic
- ❌ Use Confetti animation (reserved for other features)
- ❌ Touch any Forbidden Files (model-router.ts, middleware.ts, etc.)
- ❌ Add new DB tables or API routes
- ❌ Add emojis to the UI
- ❌ Modify the ingest API call payload or behavior

## PARALLELISIERUNG
✅ **Can run PARALLEL with Agent 10.1 (Mission Search)**
⚠️ Both agents modify `page.tsx` — coordinate merge carefully
