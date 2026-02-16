# 🤖 AGENT PROMPT: PHASE 4.2 — CV OPTIMIZATION DISPLAY (Frontend)

## MISSION
Implementiere die Frontend-Komponenten für CV Optimization: Side-by-Side Comparison, Diff Highlighting, Accept/Reject Controls und PDF Download. Ziel ist eine intuitive, Notion-like UI, die Nutzern erlaubt, Optimierungen zu reviewen und selektiv zu übernehmen.

---

## PREREQUISITES — READ FIRST! 🚨

**Before starting ANY work, you MUST read AND cross-reference these documents:**

1. **`docs/ARCHITECTURE.md`** — System Architecture & Data Flow
   - Study CV optimization flow in the overall pipeline
   - Understand how optimized CV integrates with cover letter generation

2. **`docs/DESIGN_SYSTEM.md`** — UI/UX Standards
   - Follow Notion-like aesthetic (`bg-[#FAFAF9]`, `border-[#E7E7E5]`)
   - Study existing card patterns (e.g., `company-intel-card.tsx`)
   - Maintain typography consistency (`text-[#37352F]` for primary text)
   - Review motion patterns in `MOTION_IMPLEMENTATION.md`

3. **`CLAUDE.md`** — **CRITICAL: "Reduce Complexity!"**
   - MVP-first approach: Focus on clear before/after view first
   - No over-engineering: Advanced diff algorithms can come later
   - Lean implementation: Reuse existing UI components (Button, Card, Badge)

4. **`docs/MASTER_PLAN.md`** — Overall Roadmap
   - Phase 4.2 follows Phase 4.1 (Backend must be done first)
   - Check if Phase 4 is still marked "Optional für MVP"
   - Understand dependencies with Phase 5 (Cover Letter Display)

5. **`AGENTS.md`** — Agent Architecture
   - Check existing display components for patterns
   - Understand which agents this component will interact with

6. **`directives/AGENT_3.3_COMPANY_DISPLAY.md`** — Reference for similar display task
   - Study how company intel is displayed (good pattern to follow)

7. **`database/schema.sql`** — Database Schema
   - Verify `documents` table structure for storing optimized CVs
   - Check `documents.metadata` JSONB schema for optimization data

8. **Existing Components:**
   - `components/company/company-intel-card.tsx` — Card layout pattern
   - `components/ui/` — shadcn/ui base components
   - `components/onboarding/document-upload.tsx` — Document display patterns

---

## EXECUTION PRINCIPLES

### 1. 🔍 Cross-Reference (Abgleich)
Before writing ANY code:
- Read ALL prerequisite docs listed above
- Study `company-intel-card.tsx` for card layout patterns (129 lines)
- Check `components/ui/button.tsx` and `components/ui/badge.tsx` for styling
- Review existing Framer Motion usage in `components/motion/`
- Verify API response format from Phase 4.1 (`CVOptimizationResult` interface)

### 2. 🧹 Reduce Complexity
- **MVP first** — Start with simple side-by-side text view before complex diff
- **No premature optimization** — Use basic string highlighting before diff libraries
- **Reuse existing patterns** — Copy card structure from `company-intel-card.tsx`
- **Max 200 lines per file** — Split into multiple components if needed:
  - `cv-comparison.tsx` (main container)
  - `cv-diff-viewer.tsx` (text comparison)
  - `improvement-card.tsx` (individual suggestion card)

### 3. 📁 Proper Filing
- Main component → `components/cv/cv-comparison.tsx`
- Diff viewer → `components/cv/cv-diff-viewer.tsx`
- Improvement cards → `components/cv/improvement-card.tsx`
- Integration point → `app/dashboard/page.tsx` or new `/cv-optimizer` page
- Update `docs/MASTER_PLAN.md` to mark Phase 4.2 tasks complete

### 4. 🎖️ Senior Engineer Autonomy
- Choose diff visualization approach independently (highlight vs. line-by-line)
- Handle edge cases (empty sections, very long CVs, mobile layout)
- Write production-quality React code (proper hooks, memoization where needed)
- Document complex UI decisions with inline comments

### 5. 🧪 Interoperability Testing
After implementation, verify:
- [ ] Component renders correctly in existing dashboard layout
- [ ] Framer Motion animations don't conflict with page transitions
- [ ] Mobile responsive (stacks side-by-side on small screens)
- [ ] Works with API response format from Phase 4.1
- [ ] No TypeScript errors: `npx tsc --noEmit`
- [ ] Browser test on localhost:3000 confirms all interactions work

### 6. ⚡ Efficiency
- Use React.memo for expensive diff calculations
- Lazy load PDF generation library (only when download clicked)
- Batch state updates (use single useState for all accepted/rejected changes)
- Don't re-render entire CV on every change (optimize with useMemo)

### 7. 📝 Additional Standards
- **TypeScript strict** — Define props interfaces for all components
- **Accessibility** — Keyboard navigation, ARIA labels, focus management
- **Loading states** — Show skeleton while fetching optimization from API
- **Error boundaries** — Graceful fallback if component crashes
- **Imports** — Use `@/` path aliases consistently

---

## CURRENT STATE

### ✅ Already Exists (from Phase 4.1)
- `lib/services/cv-optimizer.ts` — Backend service with `CVOptimizationResult` type
- `app/api/cv/optimize/route.ts` — API endpoint returning optimization data
- Design system components: Button, Card, Badge, Progress
- Framer Motion setup in `components/motion/`

### ⚠️ Partially Exists
- Card layout pattern in `company-intel-card.tsx` (can be adapted)
- Document display in `document-upload.tsx` (shows upload state, not comparison)

### ❌ Missing (Your Task)
- Side-by-side comparison component
- Diff highlighting logic
- Accept/Reject individual sections
- ATS score visualization
- PDF download with accepted changes
- Integration into dashboard

---

## YOUR TASK

### 4.2.1: Side-by-Side Comparison Component

**Goal:** Create main comparison container that shows original vs. optimized CV side-by-side.

**File:** `components/cv/cv-comparison.tsx`

```typescript
'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { CVDiffViewer } from './cv-diff-viewer'
import { ImprovementCard } from './improvement-card'
import type { CVOptimizationResult } from '@/lib/services/cv-optimizer'

interface CVComparisonProps {
  optimizationResult: CVOptimizationResult
  onAcceptAll: () => Promise<void>
  onRejectAll: () => void
  onDownload: () => Promise<void>
}

export function CVComparison({
  optimizationResult,
  onAcceptAll,
  onRejectAll,
  onDownload
}: CVComparisonProps) {
  const [acceptedSections, setAcceptedSections] = useState<Set<number>>(new Set())
  const [isDownloading, setIsDownloading] = useState(false)

  // UI Layout:
  // 1. Header with ATS Score (before → after)
  // 2. Summary cards (keywords, bullets, impact)
  // 3. Toggle: Side-by-Side | Optimized Only
  // 4. Improvement cards (list of optimized_sections)
  // 5. Action buttons (Accept All, Download, Reject)
  
  return (
    <Card className="bg-white p-6 border-[#E7E7E5]">
      {/* Header with ATS Score */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-[#37352F]">
            CV Optimization Results
          </h2>
          <p className="text-sm text-[#73726E] mt-1">
            Review changes and accept improvements
          </p>
        </div>
        
        <div className="text-right">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-[#73726E] line-through">
              {optimizationResult.ats_score.before}
            </span>
            <span className="text-4xl font-bold text-green-600">
              {optimizationResult.ats_score.after}
            </span>
          </div>
          <p className="text-xs text-[#73726E] mt-1">ATS Score</p>
          <Progress 
            value={optimizationResult.ats_score.after} 
            className="w-24 mt-2"
          />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="p-4 bg-[#F7F7F5] rounded-lg">
          <p className="text-xs text-[#73726E] mb-1">Keywords Added</p>
          <p className="text-2xl font-semibold text-[#37352F]">
            {optimizationResult.keyword_gaps.suggested_additions.length}
          </p>
        </div>
        <div className="p-4 bg-[#F7F7F5] rounded-lg">
          <p className="text-xs text-[#73726E] mb-1">Sections Improved</p>
          <p className="text-2xl font-semibold text-[#37352F]">
            {optimizationResult.optimized_sections.length}
          </p>
        </div>
        <div className="p-4 bg-[#F7F7F5] rounded-lg">
          <p className="text-xs text-[#73726E] mb-1">High Impact</p>
          <p className="text-2xl font-semibold text-[#37352F]">
            {optimizationResult.optimized_sections.filter(s => s.impact === 'high').length}
          </p>
        </div>
      </div>

      {/* Improvement Cards */}
      <div className="space-y-4 mb-6">
        {optimizationResult.optimized_sections.map((section, idx) => (
          <ImprovementCard
            key={idx}
            section={section}
            isAccepted={acceptedSections.has(idx)}
            onToggle={() => {
              const newSet = new Set(acceptedSections)
              if (newSet.has(idx)) {
                newSet.delete(idx)
              } else {
                newSet.add(idx)
              }
              setAcceptedSections(newSet)
            }}
          />
        ))}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <Button 
          onClick={async () => {
            // Accept all sections
            setAcceptedSections(
              new Set(optimizationResult.optimized_sections.map((_, i) => i))
            )
            await onAcceptAll()
          }}
          className="flex-1"
        >
          ✅ Accept All Changes
        </Button>
        <Button 
          onClick={onDownload}
          variant="outline"
          disabled={acceptedSections.size === 0 || isDownloading}
        >
          {isDownloading ? '⏳ Generating...' : '📥 Download Optimized CV'}
        </Button>
        <Button onClick={onRejectAll} variant="ghost">
          ↩️ Revert
        </Button>
      </div>
    </Card>
  )
}
```

**Design Notes:**
- Follow Notion's color palette: `bg-[#FAFAF9]`, `text-[#37352F]`, `border-[#E7E7E5]`
- Use Framer Motion for smooth card expand/collapse
- ATS score shows before → after with strikethrough and arrow
- Mobile: Stack cards vertically, side-by-side becomes stacked

---

### 4.2.2: Diff Viewer Component

**Goal:** Show original vs. improved text with highlighted differences.

**File:** `components/cv/cv-diff-viewer.tsx`

```typescript
'use client'

interface CVDiffViewerProps {
  original: string
  improved: string
  showDiff?: boolean
}

export function CVDiffViewer({ 
  original, 
  improved, 
  showDiff = true 
}: CVDiffViewerProps) {
  
  if (!showDiff) {
    return (
      <div className="prose prose-sm text-[#37352F] max-w-none">
        <pre className="whitespace-pre-wrap font-sans">
          {improved}
        </pre>
      </div>
    )
  }

  // Simple diff highlighting (MVP approach)
  // For production: Consider using `diff-match-patch` or `react-diff-viewer`
  const highlightDiff = (original: string, improved: string) => {
    const originalWords = original.split(' ')
    const improvedWords = improved.split(' ')
    
    // Basic word-level diff
    return improvedWords.map((word, idx) => {
      const isNew = !originalWords.includes(word)
      return (
        <span
          key={idx}
          className={isNew ? 'bg-green-100 text-green-800 rounded px-1' : ''}
        >
          {word}{' '}
        </span>
      )
    })
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Original */}
      <div className="border border-[#E7E7E5] rounded-lg p-4 bg-[#FAFAF9]">
        <p className="text-xs text-[#73726E] mb-2 font-medium">Original</p>
        <div className="prose prose-sm text-[#37352F] max-w-none">
          <pre className="whitespace-pre-wrap font-sans text-sm">
            {original}
          </pre>
        </div>
      </div>

      {/* Improved */}
      <div className="border-2 border-green-500 rounded-lg p-4 bg-green-50">
        <p className="text-xs text-green-700 mb-2 font-medium">✨ Improved</p>
        <div className="prose prose-sm text-[#37352F] max-w-none">
          <div className="font-sans text-sm">
            {highlightDiff(original, improved)}
          </div>
        </div>
      </div>
    </div>
  )
}
```

**Technical Notes:**
- MVP version uses simple word-level diff (highlight new words green)
- For production: Consider integrating `diff-match-patch` library
- Responsive: Side-by-side on desktop, stacked on mobile
- Keep consistent with Design System colors

---

### 4.2.3: Improvement Card Component

**Goal:** Display individual optimization suggestion with accept/reject toggle.

**File:** `components/cv/improvement-card.tsx`

```typescript
'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { CVDiffViewer } from './cv-diff-viewer'

interface ImprovementCardProps {
  section: {
    section: string
    original: string
    improved: string
    reasoning: string
    impact: 'high' | 'medium' | 'low'
  }
  isAccepted: boolean
  onToggle: () => void
}

export function ImprovementCard({ 
  section, 
  isAccepted, 
  onToggle 
}: ImprovementCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  const impactColors = {
    high: 'bg-red-100 text-red-700 border-red-200',
    medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    low: 'bg-gray-100 text-gray-700 border-gray-200'
  }

  const impactLabels = {
    high: '🔴 High Impact',
    medium: '🟡 Medium Impact',
    low: '🟢 Low Impact'
  }

  return (
    <motion.div
      layout
      className={`border rounded-lg overflow-hidden transition-all ${
        isAccepted 
          ? 'border-green-500 bg-green-50' 
          : 'border-[#E7E7E5] bg-white'
      }`}
    >
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="font-semibold text-[#37352F]">
                {section.section}
              </h3>
              <Badge 
                variant="outline" 
                className={impactColors[section.impact]}
              >
                {impactLabels[section.impact]}
              </Badge>
            </div>
            <p className="text-sm text-[#73726E]">
              {section.reasoning}
            </p>
          </div>

          <div className="flex items-center gap-2 ml-4">
            <Button
              size="sm"
              variant={isAccepted ? 'default' : 'outline'}
              onClick={onToggle}
            >
              {isAccepted ? '✅ Accepted' : 'Accept'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </Button>
          </div>
        </div>
      </div>

      {/* Expandable Diff View */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="border-t border-[#E7E7E5] p-4 bg-[#FAFAF9]">
              <CVDiffViewer
                original={section.original}
                improved={section.improved}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
```

**Interaction Notes:**
- Click section to expand/collapse diff view
- "Accept" button toggles green state
- Impact badge shows visual priority (red = high priority)
- Smooth animation with Framer Motion
- Consistent with existing card patterns

---

### 4.2.4: Dashboard Integration

**Goal:** Add "Optimize CV" button to job queue and show comparison modal.

**File:** `app/dashboard/page.tsx` (or new route)

```typescript
'use client'

import { useState } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { CVComparison } from '@/components/cv/cv-comparison'
import type { CVOptimizationResult } from '@/lib/services/cv-optimizer'

export default function DashboardPage() {
  const [showOptimization, setShowOptimization] = useState(false)
  const [optimizationResult, setOptimizationResult] = useState<CVOptimizationResult | null>(null)
  const [isOptimizing, setIsOptimizing] = useState(false)

  const handleOptimizeCV = async (jobId: string) => {
    setIsOptimizing(true)
    try {
      const response = await fetch('/api/cv/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          document_id: 'user-cv-id', // Get from context/state
          job_id: jobId 
        })
      })
      
      const result = await response.json()
      setOptimizationResult(result)
      setShowOptimization(true)
    } catch (error) {
      console.error('❌ Optimization failed:', error)
    } finally {
      setIsOptimizing(false)
    }
  }

  const handleAcceptAll = async () => {
    // Save optimized CV to database
    console.log('✅ Accepted all changes')
    setShowOptimization(false)
  }

  const handleDownload = async () => {
    // Generate PDF with accepted changes
    // Use existing PDF library (jsPDF or similar)
    console.log('📥 Downloading optimized CV...')
  }

  return (
    <div>
      {/* Existing Dashboard Content */}
      
      {/* Add to Job Queue Item */}
      <Button 
        onClick={() => handleOptimizeCV('job-id')}
        disabled={isOptimizing}
      >
        {isOptimizing ? '⏳ Optimizing...' : '✨ Optimize CV'}
      </Button>

      {/* Optimization Modal */}
      <Dialog open={showOptimization} onOpenChange={setShowOptimization}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          {optimizationResult && (
            <CVComparison
              optimizationResult={optimizationResult}
              onAcceptAll={handleAcceptAll}
              onRejectAll={() => setShowOptimization(false)}
              onDownload={handleDownload}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
```

**Integration Points:**
- Add "Optimize CV" button to each job in queue
- Show loading state during API call
- Open modal/dialog with comparison results
- Handle accept → update database
- Handle download → generate PDF

---

## VERIFICATION CHECKLIST

- [ ] All prerequisite docs read and cross-referenced
- [ ] `cv-comparison.tsx` component created (main container)
- [ ] `cv-diff-viewer.tsx` component created (side-by-side diff)
- [ ] `improvement-card.tsx` component created (individual suggestions)
- [ ] Dashboard integration: "Optimize CV" button added
- [ ] Modal/Dialog opens with optimization results
- [ ] ATS score visualization works (before → after)
- [ ] Accept/Reject toggles work per section
- [ ] "Accept All" button updates all sections
- [ ] Mobile responsive (stacks side-by-side on small screens)
- [ ] Framer Motion animations smooth (expand/collapse)
- [ ] Follows Design System colors and typography
- [ ] `npx tsc --noEmit` passes (no TypeScript errors)
- [ ] Browser test on localhost:3000 confirms all interactions
- [ ] No breaking changes to existing dashboard
- [ ] `docs/MASTER_PLAN.md` Phase 4.2 tasks marked complete

---

## SUCCESS CRITERIA

✅ User can click "Optimize CV" on a job card  
✅ Modal/Dialog shows optimization results within 5 seconds  
✅ Side-by-side comparison clearly shows original vs. improved  
✅ Diff highlighting makes changes visually obvious (green for additions)  
✅ ATS score improvement is visually prominent (e.g., 65 → 82)  
✅ User can accept/reject individual sections (not all-or-nothing)  
✅ "Accept All" button works and closes modal  
✅ Component is fully responsive (mobile, tablet, desktop)  
✅ Animations are smooth and don't feel janky  
✅ UI matches existing Design System (Notion-like aesthetic)

---

## EXECUTION ORDER

1. **Read all prerequisite documents** (30 min)
   - Study `docs/DESIGN_SYSTEM.md` for color palette and spacing
   - Review `company-intel-card.tsx` for card layout pattern
   - Check `MOTION_IMPLEMENTATION.md` for animation guidelines

2. **Create Base Components** (1.5 hours)
   - Start with `improvement-card.tsx` (simplest, reusable)
   - Create `cv-diff-viewer.tsx` (side-by-side layout)
   - Test both components in isolation (Storybook or standalone page)

3. **Create Main Container** (1 hour)
   - Build `cv-comparison.tsx` (assembles all pieces)
   - Wire up state management (acceptedSections)
   - Add ATS score visualization
   - Implement "Accept All" logic

4. **Dashboard Integration** (1 hour)
   - Add "Optimize CV" button to job queue
   - Create modal/dialog trigger
   - Wire up API call to `/api/cv/optimize`
   - Handle loading and error states

5. **Polish & Responsive** (1 hour)
   - Test mobile layout (stack side-by-side)
   - Smooth animations with Framer Motion
   - Add keyboard navigation (Escape to close, Enter to accept)
   - Test with various CV lengths (short, medium, very long)

6. **Integration Testing** (30 min)
   - Test full flow: Click button → See results → Accept → Close
   - Verify no console errors
   - Check TypeScript passes (`npx tsc --noEmit`)
   - Test in different browsers (Chrome, Firefox, Safari)

7. **Update Documentation** (15 min)
   - Mark Phase 4.2 tasks complete in `docs/MASTER_PLAN.md`
   - Add component documentation in `docs/ARCHITECTURE.md`
   - Screenshot for walkthrough

---

## ⚠️ PARALLELISIERUNGS-HINWEIS

✅ **Can run PARALLEL with Phase 5** — CV Optimization UI is independent of Cover Letter Display  
✅ **Can run PARALLEL with Phase 6** — Application tracking UI doesn't conflict  
❌ **Cannot run parallel with Phase 4.1** — Backend must be complete first (need API endpoint + types)  
⚠️ **Partial parallel with Phase 3.3** — Both are display components, but can cause merge conflicts in shared UI files

---

**Estimated Time:** 5-6 hours total for complete Phase 4.2 frontend implementation  
**Dependencies:** Phase 4.1 (Backend) must be 100% complete before starting  
**Priority:** Optional for MVP (see `MASTER_PLAN.md` Phase 4 note)

Viel Erfolg! 🚀
