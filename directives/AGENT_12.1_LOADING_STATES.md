# 🤖 AGENT PROMPT: PHASE 12.1 — LOADING STATES & SKELETON SCREENS

## MISSION
Implement beautiful, Notion-inspired loading states and skeleton screens throughout the application to provide visual feedback during async operations. This dramatically improves perceived performance and user experience.

---

## PREREQUISITES — READ FIRST! 🚨

**Before starting ANY work, you MUST read AND cross-reference these documents:**

1. **`docs/DESIGN_SYSTEM.md`** — **CRITICAL: UI/UX Standards**
   - Study Notion-like aesthetic
   - Understand skeleton screen patterns
   - Follow animation principles (subtle, performant)

2. **`docs/ARCHITECTURE.md`** — System Architecture
   - Understand async operations (scraping, generation, etc.)
   - Know which operations need loading states

3. **`CLAUDE.md`** — "Reduce Complexity!"
   - MVP-first: Basic spinners first, fancy skeletons later
   - Reuse patterns across components
   - Max 3 skeleton variants (small, medium, large)

4. **`docs/MASTER_PLAN.md`** — Phase 12.1 details
   - Understand relationship to other UX polish tasks

5. **Existing Components** — Study these:
   - `components/ui/button.tsx` — Has loading state example
   - `components/dashboard/` — Dashboard components to enhance

6. **shadcn/ui Documentation** — Skeleton component
   - https://ui.shadcn.com/docs/components/skeleton

7. **`directives/MASTER_PROMPT_TEMPLATE.md`** — Follow all 7 Execution Principles

---

## EXECUTION PRINCIPLES

### 1. 🔍 Cross-Reference (Abgleich)
Before writing ANY code:
- Read ALL prerequisite docs listed above
- Check existing loading patterns in codebase
- Verify shadcn/ui Skeleton component is installed
- Map all async operations that need loading states

### 2. 🧹 Reduce Complexity
- **MVP first** — Start with simple spinners, then add skeletons
- **Reuse patterns** — Max 3 skeleton variants (avoid custom for each component)
- **No over-animation** — Subtle pulse only, no flashy effects
- **Max 150 lines per skeleton component** — Keep simple

### 3. 📁 Proper Filing
- Skeleton components → `components/skeletons/`
- Loading spinner → `components/ui/loading-spinner.tsx` (if not exists)
- Hook for loading states → `lib/hooks/use-loading-state.ts` (optional)

### 4. 🏆 Senior Engineer Autonomy
- Decide which operations need skeletons vs spinners
- Choose appropriate skeleton dimensions
- Handle race conditions (fast responses)
- Add optimistic updates where appropriate

### 5. 🧪 Interoperability Testing
After implementation, verify:
- [ ] `npx tsc --noEmit` passes
- [ ] No layout shifts when loading completes
- [ ] Animations are smooth (60fps)
- [ ] Loading states don't flash for fast operations (<500ms)
- [ ] Mobile responsive

### 6. ⚡ Efficiency
- Use CSS animations (not JS) for performance
- Lazy render skeletons (only when needed)
- Avoid re-renders during loading

### 7. 📝 Additional Standards
- **TypeScript strict** — Type all loading props
- **Accessibility** — Use `aria-busy` and `aria-live`
- **Design System** — Follow color scheme (bg-gray-200 for skeletons)
- **Animations** — Use Tailwind `animate-pulse` or custom CSS

---

## CURRENT STATE

### ✅ Already Exists
- `components/ui/button.tsx` — Has `loading` prop with spinner
- shadcn/ui Skeleton component (if installed)
- Tailwind CSS animations (`animate-pulse`, `animate-spin`)

### ⚠️ Partially Exists
- Some components may have basic loading states
- No consistent skeleton pattern

### ❌ Missing (Your Task)
- Skeleton screens for tables
- Skeleton screens for cards
- Skeleton screens for forms
- Loading states for async operations (scraping, generation)
- Consistent loading spinner component

---

## YOUR TASK

### 12.1.1: Install/Verify Skeleton Component
**Goal:** Ensure shadcn/ui Skeleton component is available.

**Implementation:**
```bash
# Check if skeleton exists
ls components/ui/skeleton.tsx

# If not, install it
npx shadcn-ui@latest add skeleton
```

**Acceptance Criteria:**
- ✅ `components/ui/skeleton.tsx` exists
- ✅ Component exports `Skeleton` function
- ✅ Uses Tailwind `animate-pulse`

---

### 12.1.2: Create Loading Spinner Component
**Goal:** Reusable spinner for inline loading.

**Implementation:**
```typescript
// components/ui/loading-spinner.tsx

import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg"
  className?: string
}

export function LoadingSpinner({ size = "md", className }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: "h-4 w-4",
    md: "h-6 w-6",
    lg: "h-8 w-8"
  }

  return (
    <Loader2 
      className={cn("animate-spin text-gray-600", sizeClasses[size], className)} 
    />
  )
}

// Full-screen loading overlay
export function LoadingOverlay({ message }: { message?: string }) {
  return (
    <div className="fixed inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="flex flex-col items-center gap-3">
        <LoadingSpinner size="lg" />
        {message && <p className="text-sm text-gray-600">{message}</p>}
      </div>
    </div>
  )
}
```

**Acceptance Criteria:**
- ✅ Three size variants (sm, md, lg)
- ✅ Uses `Loader2` icon from lucide-react
- ✅ Smooth spin animation
- ✅ Full-screen overlay variant
- ✅ Optional message support

---

### 12.1.3: Create Table Skeleton
**Goal:** Skeleton for loading table data.

**Implementation:**
```typescript
// components/skeletons/table-skeleton.tsx

import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"

interface TableSkeletonProps {
  rows?: number
  columns?: number
}

export function TableSkeleton({ rows = 5, columns = 4 }: TableSkeletonProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {Array.from({ length: columns }).map((_, i) => (
            <TableHead key={i}>
              <Skeleton className="h-4 w-20" />
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <TableRow key={rowIndex}>
            {Array.from({ length: columns }).map((_, colIndex) => (
              <TableCell key={colIndex}>
                <Skeleton className="h-4 w-full" />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
```

**Usage:**
```typescript
// In job queue component
{isLoading ? (
  <TableSkeleton rows={10} columns={5} />
) : (
  <JobQueueTable data={jobs} />
)}
```

**Acceptance Criteria:**
- ✅ Configurable rows and columns
- ✅ Matches actual table structure
- ✅ Uses shadcn/ui Table components
- ✅ No layout shift when real data loads

---

### 12.1.4: Create Card Skeleton
**Goal:** Skeleton for loading card components.

**Implementation:**
```typescript
// components/skeletons/card-skeleton.tsx

import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardHeader, CardContent } from "@/components/ui/card"

interface CardSkeletonProps {
  hasHeader?: boolean
  lines?: number
}

export function CardSkeleton({ hasHeader = true, lines = 3 }: CardSkeletonProps) {
  return (
    <Card>
      {hasHeader && (
        <CardHeader>
          <Skeleton className="h-6 w-1/3" />
        </CardHeader>
      )}
      <CardContent className="space-y-3">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton 
            key={i} 
            className="h-4" 
            style={{ width: `${100 - i * 10}%` }} 
          />
        ))}
      </CardContent>
    </Card>
  )
}

// Grid of card skeletons
export function CardSkeletonGrid({ count = 3 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  )
}
```

**Usage:**
```typescript
// In company research component
{isLoading ? (
  <CardSkeleton hasHeader lines={5} />
) : (
  <CompanyIntelCard data={research} />
)}
```

**Acceptance Criteria:**
- ✅ Configurable header and line count
- ✅ Variable line widths (looks natural)
- ✅ Grid variant for multiple cards
- ✅ Matches Card component structure

---

### 12.1.5: Create Form Skeleton
**Goal:** Skeleton for loading forms.

**Implementation:**
```typescript
// components/skeletons/form-skeleton.tsx

import { Skeleton } from "@/components/ui/skeleton"

interface FormSkeletonProps {
  fields?: number
}

export function FormSkeleton({ fields = 4 }: FormSkeletonProps) {
  return (
    <div className="space-y-6">
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-24" /> {/* Label */}
          <Skeleton className="h-10 w-full" /> {/* Input */}
        </div>
      ))}
      <Skeleton className="h-10 w-32" /> {/* Button */}
    </div>
  )
}
```

**Acceptance Criteria:**
- ✅ Configurable field count
- ✅ Includes label and input skeletons
- ✅ Includes button skeleton
- ✅ Matches form spacing

---

### 12.1.6: Add Loading States to Async Operations
**Goal:** Implement loading states for key async operations.

**Operations to Enhance:**

#### **Job Scraping**
```typescript
// In job URL input component
const [isScraping, setIsScraping] = useState(false)

async function handleScrape(url: string) {
  setIsScraping(true)
  try {
    await fetch("/api/jobs/scrape", { method: "POST", body: JSON.stringify({ url }) })
  } finally {
    setIsScraping(false)
  }
}

return (
  <Button onClick={handleScrape} disabled={isScraping}>
    {isScraping ? (
      <>
        <LoadingSpinner size="sm" className="mr-2" />
        Scraping...
      </>
    ) : (
      "Add Job"
    )}
  </Button>
)
```

#### **Cover Letter Generation**
```typescript
// In cover letter component
const [isGenerating, setIsGenerating] = useState(false)

{isGenerating ? (
  <Card>
    <CardHeader>
      <div className="flex items-center gap-2">
        <LoadingSpinner size="sm" />
        <span>Generating cover letter...</span>
      </div>
    </CardHeader>
    <CardContent>
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </CardContent>
  </Card>
) : (
  <CoverLetterPreview text={coverLetter} />
)}
```

#### **Company Research**
```typescript
// In company research component
{isResearching ? (
  <CardSkeleton hasHeader lines={6} />
) : (
  <CompanyIntelCard data={research} />
)}
```

#### **Document Upload**
```typescript
// In file upload component
{isUploading && (
  <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg">
    <LoadingSpinner size="sm" />
    <div className="flex-1">
      <p className="text-sm font-medium">Uploading {file.name}...</p>
      <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div 
          className="h-full bg-blue-600 transition-all duration-300"
          style={{ width: `${uploadProgress}%` }}
        />
      </div>
    </div>
  </div>
)}
```

**Acceptance Criteria:**
- ✅ All async operations have loading states
- ✅ Buttons disabled during operations
- ✅ Clear visual feedback
- ✅ Upload progress bars where appropriate
- ✅ No jarring transitions

---

### 12.1.7: Prevent Flash of Loading State
**Goal:** Don't show loading for fast operations (<500ms).

**Implementation:**
```typescript
// lib/hooks/use-delayed-loading.ts

import { useEffect, useState } from "react"

export function useDelayedLoading(isLoading: boolean, delay = 500) {
  const [showLoading, setShowLoading] = useState(false)

  useEffect(() => {
    if (isLoading) {
      const timer = setTimeout(() => setShowLoading(true), delay)
      return () => clearTimeout(timer)
    } else {
      setShowLoading(false)
    }
  }, [isLoading, delay])

  return showLoading
}
```

**Usage:**
```typescript
const isLoading = useQuery(...).isLoading
const showLoading = useDelayedLoading(isLoading)

return showLoading ? <TableSkeleton /> : <Table data={data} />
```

**Acceptance Criteria:**
- ✅ Fast operations (<500ms) don't show loading
- ✅ Slow operations show loading after delay
- ✅ No flash when loading state changes rapidly

---

## VERIFICATION CHECKLIST
- [ ] All prerequisite docs read and cross-referenced
- [ ] Skeleton component installed
- [ ] LoadingSpinner component created
- [ ] TableSkeleton created and used
- [ ] CardSkeleton created and used
- [ ] FormSkeleton created and used
- [ ] All async operations have loading states
- [ ] Delayed loading hook implemented
- [ ] No layout shifts when loading completes
- [ ] Animations smooth on all devices
- [ ] `npx tsc --noEmit` passes
- [ ] Browser test on localhost:3000 confirms functionality
- [ ] Mobile responsive
- [ ] `docs/MASTER_PLAN.md` updated (Phase 12.1 tasks checked off)

---

## SUCCESS CRITERIA
✅ All major async operations have loading states
✅ Skeleton screens match actual component layouts
✅ No jarring transitions or layout shifts
✅ Fast operations don't flash loading states
✅ Perceived performance dramatically improved

---

## EXECUTION ORDER
1. Read all prerequisite documents
2. Install/verify Skeleton component (12.1.1)
3. Create LoadingSpinner component (12.1.2)
4. Create TableSkeleton (12.1.3)
5. Create CardSkeleton (12.1.4)
6. Create FormSkeleton (12.1.5)
7. Add loading states to async operations (12.1.6)
8. Implement delayed loading hook (12.1.7)
9. Test all loading states on localhost:3000
10. Run `npx tsc --noEmit`
11. Update `docs/MASTER_PLAN.md`

---

## ⚠️ PARALLELISATION HINT
✅ **Can run parallel with Phase 12.2 (Empty States)** — Independent UI polish
✅ **Can run parallel with any backend phase** — Pure frontend work
❌ **Should NOT run parallel with Phase 1-3** — Need components to exist first

---

## 🔗 DEPENDENCIES
- **Depends on:** Major components implemented (Tables, Cards, Forms)
- **Required by:** None (polish feature)
- **Enhances:** User experience across all phases

---

## 🎨 DESIGN GUIDELINES

### Animation Timing
- **Spinner:** Continuous spin (2s duration)
- **Skeleton pulse:** 2s duration, infinite loop
- **Fade in/out:** 150ms transition

### Colors (Light Mode)
- **Skeleton background:** `bg-gray-200`
- **Skeleton shimmer:** `bg-gray-300`
- **Spinner:** `text-gray-600`

### Spacing
- Match actual component spacing exactly
- Use same padding/margins as real components
- Skeleton heights should match content heights

### Accessibility
- Add `aria-busy="true"` to loading containers
- Add `aria-live="polite"` for status updates
- Screen readers should announce "Loading..."

---

## 📊 LOADING STATE INVENTORY

| Component | Loading State | Type |
|-----------|---------------|------|
| Job Queue Table | TableSkeleton | Skeleton |
| Company Research Card | CardSkeleton | Skeleton |
| Cover Letter Preview | CardSkeleton + Spinner | Mixed |
| Document Upload | Progress Bar + Spinner | Custom |
| Job Scraping Button | Button Spinner | Inline |
| Form Processing | FormSkeleton | Skeleton |
| Dashboard Stats | CardSkeletonGrid | Skeleton |
| Application History | TableSkeleton | Skeleton |

---

**Goal:** Make every wait feel intentional and beautiful! ✨
