# 🏗️ AGENT 5.2: COVER LETTER FRONTEND (MVP-LEAN)

**Phase:** 5.2 — Cover Letter Generation (Frontend)  
**Agent:** Cover Letter Display  
**Estimated Time:** 2-3 hours  
**Dependencies:** Phase 5 Backend (API Route), Phase 5.1 (Style Analysis)

---

## MISSION
Build the frontend UI to display, regenerate, and export generated cover letters. Reuse existing quality feedback component. Focus on MVP: Preview + Copy + Regenerate. No rich text editor, no PDF (Phase 2).

**Why this matters:** Backend generates perfect cover letters, but users need a polished UI to review, iterate, and export them.

---

## PREREQUISITES — READ FIRST! 🚨

**Before starting ANY work, you MUST read AND cross-reference these documents:**

1. **`docs/ARCHITECTURE.md`** — System Architecture & Data Flow
   - Study Phase 5 (Cover Letter Generation)
   - Understand the workflow: Job → Company Research → CV Match → Cover Letter

2. **`docs/DESIGN_SYSTEM.md`** — UI/UX Standards
   - Follow Notion-like aesthetic (`bg-[#FAFAF9]`, clean cards)
   - Maintain consistency with existing job-row components
   - Use existing motion components from `components/motion/`

3. **`CLAUDE.md`** — **CRITICAL: "Reduce Complexity!"**
   - MVP-first: Preview + Copy + Regenerate (no editor, no PDF)
   - Reuse existing components: `QualityFeedback` already exists
   - Don't over-engineer: Simple markdown rendering, not WYSIWYG

4. **`docs/MASTER_PLAN.md`** — Overall Roadmap
   - Check Phase 5 completion status
   - Understand what's already built (backend API, quality judge)

5. **`components/cover-letter/quality-feedback.tsx`** — **CRITICAL**
   - Study how QualityScores are displayed
   - This component is DONE, reuse it directly

6. **`app/dashboard/components/job-row.tsx`** — Integration Point
   - Study how expanded view works
   - Understand where cover letter UI goes (line 177: expanded details)

7. **`app/api/cover-letter/generate/route.ts`** — Backend API
   - Study response structure: `{ coverLetter, qualityScores, iterations }`
   - Understand how to call the API from frontend

---

## EXECUTION PRINCIPLES

### 1. 🔍 Cross-Reference (Abgleich)
Before writing ANY code:
- ✅ Read `quality-feedback.tsx` to understand how to pass scores
- ✅ Read `job-row.tsx` to see where your UI integrates
- ✅ Check `app/api/cover-letter/generate/route.ts` for API response format
- ✅ Study existing motion components in `components/motion/`

### 2. 🧹 Reduce Complexity
- **MVP features only:** Preview, Copy, Regenerate, Download .txt
- **Don't build:** Rich text editor, PDF generation, inline editing
- **Reuse:** QualityFeedback component (already done)
- **Simple:** Markdown rendering with `react-markdown` or plain text formatting

### 3. 📁 Proper Filing
- New components → `components/cover-letter/` (folder already exists)
- Integration → Modify `app/dashboard/components/workflow-steps/` (add step-4)
- Update `job-row.tsx` to show cover letter step
- Update `docs/MASTER_PLAN.md` → Check Phase 5.2 tasks

### 4. 🎖️ Senior Engineer Autonomy
- Choose markdown library (react-markdown vs. remark)
- Handle loading states during generation
- Decide on toast/notification pattern for copy feedback
- Add proper TypeScript types for all props

### 5. 🧪 Interoperability Testing
After implementation, verify:
- [ ] `npx tsc --noEmit` passes
- [ ] Component renders in job-row expanded view
- [ ] Regenerate button calls API correctly
- [ ] Copy to clipboard works in all browsers
- [ ] Quality feedback displays properly

### 6. ⚡ Efficiency
- **Reuse:** Existing Button, Badge components from `components/motion/`
- **Lazy load:** Only fetch cover letter when expanded view opens
- **Optimistic UI:** Show loading state during regeneration
- **Cache:** Store generated cover letter in state, don't re-fetch

### 7. 📝 Additional Standards
- **TypeScript strict** — No `any` types
- **Error handling** — Show user-friendly errors if API fails
- **Loading states** — Skeleton loaders for cover letter text
- **Accessibility** — Proper ARIA labels for buttons
- **Responsive** — Works on mobile/tablet/desktop

---

## CURRENT STATE

### ✅ What ALREADY exists:
1. **`components/cover-letter/quality-feedback.tsx`** (165 lines)
   - Displays all 4 scores + overall score
   - Shows issues & suggestions
   - Expandable/collapsible
   - **Can be reused directly** ✅

2. **`app/api/cover-letter/generate/route.ts`** (Backend)
   - Returns: `{ coverLetter, qualityScores, iterations }`
   - Quality loop built-in (max 3 iterations)
   - Ready to call from frontend

3. **`app/dashboard/components/job-row.tsx`**
   - Has expanded view structure
   - Has "Generate Cover Letter" button
   - Status: `CL_GENERATED` and `READY`

4. **`components/motion/button.tsx` + `badge.tsx`**
   - Design system components exist
   - Can be reused for actions

### ⚠️ What is PARTIALLY done:
- job-row.tsx has expanded view skeleton, but no cover letter display
- workflow-steps folder exists, but no step-4-cover-letter.tsx

### ❌ What is MISSING (YOUR TASK):
1. **`components/cover-letter/cover-letter-preview.tsx`** (NEW)
   - Renders markdown/formatted cover letter text
   - Word count display
   - Formatted as real cover letter (paragraphs, spacing)

2. **`components/cover-letter/cover-letter-actions.tsx`** (NEW)
   - Regenerate button
   - Copy to clipboard button
   - Download as .txt button

3. **`app/dashboard/components/workflow-steps/step-4-cover-letter.tsx`** (NEW)
   - Integrates Preview + Actions + QualityFeedback
   - Shows in job-row expanded view
   - Handles API calls

4. **Integration in `job-row.tsx`**
   - Replace "Workflow Details coming soon..." with actual step display
   - Conditionally show step-4-cover-letter when status >= CL_GENERATED

---

## YOUR TASK

### 5.2.1: Create Cover Letter Preview Component
**Goal:** Display generated cover letter with proper formatting

**File:** `components/cover-letter/cover-letter-preview.tsx`

**Implementation:**
```typescript
"use client"

import { useState } from "react"
import { Eye, EyeOff } from "lucide-react"

interface CoverLetterPreviewProps {
    coverLetter: string
    showFormatted?: boolean
}

export function CoverLetterPreview({
    coverLetter,
    showFormatted = true
}: CoverLetterPreviewProps) {
    const [isFormatted, setIsFormatted] = useState(showFormatted)

    // Word count
    const wordCount = coverLetter.trim().split(/\s+/).length

    // Split into paragraphs (assumes paragraphs separated by double newline)
    const paragraphs = coverLetter.split(/\n\n/).filter(p => p.trim())

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between pb-2 border-b border-[#E7E7E5]">
                <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-[#37352F]">
                        📄 Generated Cover Letter
                    </h3>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                        {wordCount} words
                    </span>
                </div>
                <button
                    onClick={() => setIsFormatted(!isFormatted)}
                    className="text-xs text-[#73726E] hover:text-[#37352F] flex items-center gap-1"
                >
                    {isFormatted ? (
                        <><Eye size={14} /> Formatted</>
                    ) : (
                        <><EyeOff size={14} /> Raw Text</>
                    )}
                </button>
            </div>

            {/* Content */}
            <div className="bg-white rounded-lg border border-[#E7E7E5] p-6">
                {isFormatted ? (
                    <div className="space-y-4 text-sm text-[#37352F] leading-relaxed">
                        {paragraphs.map((paragraph, idx) => (
                            <p key={idx} className="text-justify">
                                {paragraph}
                            </p>
                        ))}
                    </div>
                ) : (
                    <pre className="text-xs text-[#73726E] whitespace-pre-wrap font-mono">
                        {coverLetter}
                    </pre>
                )}
            </div>
        </div>
    )
}
```

**Features:**
- Word count badge
- Toggle between formatted/raw view
- Proper paragraph spacing
- Notion-like design

---

### 5.2.2: Create Cover Letter Actions Component
**Goal:** Regenerate, Copy, Download buttons

**File:** `components/cover-letter/cover-letter-actions.tsx`

**Implementation:**
```typescript
"use client"

import { useState } from "react"
import { Button } from "@/components/motion/button"
import { RefreshCw, Copy, Download, Check } from "lucide-react"

interface CoverLetterActionsProps {
    coverLetter: string
    onRegenerate: () => Promise<void>
    isRegenerating?: boolean
}

export function CoverLetterActions({
    coverLetter,
    onRegenerate,
    isRegenerating = false
}: CoverLetterActionsProps) {
    const [copied, setCopied] = useState(false)

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(coverLetter)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch (error) {
            console.error('❌ Copy failed:', error)
            alert('Failed to copy to clipboard')
        }
    }

    const handleDownload = () => {
        const blob = new Blob([coverLetter], { type: 'text/plain' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `cover-letter-${Date.now()}.txt`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
    }

    return (
        <div className="flex items-center gap-2">
            {/* Regenerate */}
            <Button
                variant="outline"
                onClick={onRegenerate}
                disabled={isRegenerating}
                className="text-sm"
            >
                <RefreshCw className={`w-4 h-4 ${isRegenerating ? 'animate-spin' : ''}`} />
                <span className="ml-2">
                    {isRegenerating ? 'Regenerating...' : 'Regenerate'}
                </span>
            </Button>

            {/* Copy to Clipboard */}
            <Button
                variant="outline"
                onClick={handleCopy}
                disabled={copied}
                className="text-sm"
            >
                {copied ? (
                    <><Check className="w-4 h-4 text-green-600" /> Copied!</>
                ) : (
                    <><Copy className="w-4 h-4" /> Copy</>
                )}
            </Button>

            {/* Download as .txt */}
            <Button
                variant="outline"
                onClick={handleDownload}
                className="text-sm"
            >
                <Download className="w-4 h-4" />
                <span className="ml-2">Download</span>
            </Button>
        </div>
    )
}
```

**Features:**
- Regenerate with loading spinner
- Copy with success feedback
- Download as .txt file
- Disabled states during actions

---

### 5.2.3: Create Workflow Step 4 Component
**Goal:** Integrate all cover letter components into workflow

**File:** `app/dashboard/components/workflow-steps/step-4-cover-letter.tsx`

**Implementation:**
```typescript
"use client"

import { useState, useEffect } from "react"
import { CoverLetterPreview } from "@/components/cover-letter/cover-letter-preview"
import { CoverLetterActions } from "@/components/cover-letter/cover-letter-actions"
import { QualityFeedback } from "@/components/cover-letter/quality-feedback"
import { QualityScores } from "@/lib/services/quality-judge"

interface Step4CoverLetterProps {
    jobId: string
    companyName: string
    jobTitle: string
    onComplete?: () => void
}

interface GenerationResult {
    coverLetter: string
    qualityScores: QualityScores
    iterations: number
}

export function Step4CoverLetter({
    jobId,
    companyName,
    jobTitle,
    onComplete
}: Step4CoverLetterProps) {
    const [result, setResult] = useState<GenerationResult | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [isRegenerating, setIsRegenerating] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Initial generation (auto-trigger on mount)
    useEffect(() => {
        generateCoverLetter()
    }, [jobId])

    const generateCoverLetter = async () => {
        try {
            setIsLoading(true)
            setError(null)

            const response = await fetch('/api/cover-letter/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jobId,
                    companyName,
                    jobTitle
                })
            })

            if (!response.ok) {
                throw new Error('Failed to generate cover letter')
            }

            const data = await response.json()
            setResult(data)

            console.log('✅ Cover letter generated:', data.iterations, 'iterations')

            // Call onComplete if provided
            if (onComplete) {
                onComplete()
            }

        } catch (err) {
            console.error('❌ Cover letter generation failed:', err)
            setError(err instanceof Error ? err.message : 'Unknown error')
        } finally {
            setIsLoading(false)
            setIsRegenerating(false)
        }
    }

    const handleRegenerate = async () => {
        setIsRegenerating(true)
        await generateCoverLetter()
    }

    // Loading state
    if (isLoading && !result) {
        return (
            <div className="space-y-4 p-6">
                <div className="animate-pulse space-y-4">
                    <div className="h-4 bg-[#E7E7E5] rounded w-3/4"></div>
                    <div className="h-4 bg-[#E7E7E5] rounded w-full"></div>
                    <div className="h-4 bg-[#E7E7E5] rounded w-5/6"></div>
                </div>
                <p className="text-sm text-[#73726E] text-center">
                    ✨ Generating your personalized cover letter...
                </p>
            </div>
        )
    }

    // Error state
    if (error) {
        return (
            <div className="p-6 bg-red-50 rounded-lg border border-red-200">
                <p className="text-sm text-red-800">❌ {error}</p>
                <button
                    onClick={generateCoverLetter}
                    className="mt-2 text-xs text-red-600 hover:underline"
                >
                    Try again
                </button>
            </div>
        )
    }

    // Success state
    if (result) {
        return (
            <div className="space-y-6 p-6">
                {/* Preview */}
                <CoverLetterPreview coverLetter={result.coverLetter} />

                {/* Actions */}
                <CoverLetterActions
                    coverLetter={result.coverLetter}
                    onRegenerate={handleRegenerate}
                    isRegenerating={isRegenerating}
                />

                {/* Quality Feedback */}
                <QualityFeedback
                    scores={result.qualityScores}
                    iterations={result.iterations}
                    showDetails={true}
                />
            </div>
        )
    }

    return null
}
```

**Features:**
- Auto-generates on mount
- Loading skeleton
- Error handling with retry
- Reuses existing QualityFeedback component
- Clean integration of all sub-components

---

### 5.2.4: Integrate into Job Row Expanded View
**Goal:** Show cover letter when job row is expanded

**File:** `app/dashboard/components/job-row.tsx` (MODIFY)

**Changes:**

1. Import the new component:
```typescript
import { Step4CoverLetter } from './workflow-steps/step-4-cover-letter'
```

2. Replace placeholder text (around line 177):
```typescript
{/* Expanded Details */}
<AnimatePresence>
    {expanded && (
        <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden bg-[#d4e3fe] border-t border-[#d6d6d6]"
        >
            {/* Conditionally render based on workflow step */}
            {job.workflowStep === 4 && job.status === 'CL_GENERATED' ? (
                <Step4CoverLetter
                    jobId={job.id}
                    companyName={job.company}
                    jobTitle={job.jobTitle}
                    onComplete={() => {
                        // Update job status to READY
                        console.log('✅ Cover letter ready')
                    }}
                />
            ) : (
                <div className="px-6 py-6 space-y-4">
                    <div className="text-sm text-[#002e7a] opacity-80">
                        Workflow Details coming soon... (Step {job.workflowStep})
                    </div>
                </div>
            )}
        </motion.div>
    )}
</AnimatePresence>
```

**Logic:**
- Only show Step4CoverLetter when status is `CL_GENERATED`
- Other workflow steps still show placeholder (for Phase 2/3/4 frontend)

---

### 5.2.5: Update Workflow Steps Index (Optional)
**Goal:** Export Step4CoverLetter from workflow-steps index

**File:** `app/dashboard/components/workflow-steps/index.tsx` (MODIFY)

**Add export:**
```typescript
export { Step4CoverLetter } from './step-4-cover-letter'
```

This allows cleaner imports elsewhere.

---

## VERIFICATION CHECKLIST

### Phase 1 (MVP):
- [ ] `components/cover-letter/cover-letter-preview.tsx` created
- [ ] Word count displays correctly
- [ ] Formatted view shows proper paragraphs
- [ ] Raw text view works
- [ ] `components/cover-letter/cover-letter-actions.tsx` created
- [ ] Regenerate button calls API
- [ ] Copy to clipboard works
- [ ] Download as .txt works
- [ ] `workflow-steps/step-4-cover-letter.tsx` created
- [ ] Auto-generates on mount
- [ ] Loading state shows
- [ ] Error state handles failures
- [ ] QualityFeedback integrates correctly
- [ ] `job-row.tsx` shows Step4 when expanded
- [ ] `npx tsc --noEmit` passes
- [ ] Browser test confirms functionality

### User Flow:
1. [ ] User clicks "Generate Cover Letter" button in job-row
2. [ ] Job-row expands, shows loading skeleton
3. [ ] Cover letter generates (3-5 seconds)
4. [ ] Preview displays formatted text
5. [ ] Quality scores show below
6. [ ] User can copy to clipboard (success feedback)
7. [ ] User can download as .txt
8. [ ] User can regenerate (loading spinner shows)

---

## SUCCESS CRITERIA

### MVP (Phase 1):
✅ User sees generated cover letter in formatted view  
✅ Word count displays correctly  
✅ Quality feedback shows 4 scores + overall  
✅ Copy to clipboard works (2 second feedback)  
✅ Download as .txt works  
✅ Regenerate triggers new generation with loading state  
✅ No TypeScript errors  
✅ Notion-like design consistency

### System-Wide:
✅ Component renders in <3 seconds  
✅ API calls don't block UI (async)  
✅ Mobile responsive (works on 375px width)  
✅ Accessible (ARIA labels, keyboard navigation)

---

## EXECUTION ORDER

### Step 1: Read Prerequisites (15 min)
- [ ] Read `quality-feedback.tsx` (understand how to pass scores)
- [ ] Read `job-row.tsx` (understand expanded view integration)
- [ ] Read `app/api/cover-letter/generate/route.ts` (API response format)
- [ ] Study existing motion components

### Step 2: Create Preview Component (30 min)
- [ ] Create `cover-letter-preview.tsx`
- [ ] Implement word count
- [ ] Add formatted/raw toggle
- [ ] Test with sample text

### Step 3: Create Actions Component (30 min)
- [ ] Create `cover-letter-actions.tsx`
- [ ] Implement copy to clipboard
- [ ] Implement download as .txt
- [ ] Add regenerate button (receives async handler)

### Step 4: Create Workflow Step 4 (45 min)
- [ ] Create `step-4-cover-letter.tsx`
- [ ] Implement API call logic
- [ ] Add loading/error states
- [ ] Integrate Preview + Actions + QualityFeedback

### Step 5: Integrate into Job Row (20 min)
- [ ] Modify `job-row.tsx`
- [ ] Add conditional rendering logic
- [ ] Test expanded view behavior

### Step 6: Test Interoperability (20 min)
- [ ] `npx tsc --noEmit` passes
- [ ] Browser test full flow
- [ ] Test copy/download/regenerate
- [ ] Verify quality feedback shows

### Step 7: Update Documentation (10 min)
- [ ] Update `docs/MASTER_PLAN.md` → Check Phase 5.2 tasks
- [ ] Document component props in comments
- [ ] Add usage examples in file headers

---

## ⚠️ PARALLELISIERUNGS-HINWEIS

**Can run in parallel with:**
- ✅ Phase 5.1 (Backend Style Analysis) — No direct dependency
- ✅ Phase 4.1/4.2 (CV Optimization) — Different workflow steps

**Must run AFTER:**
- ❌ Phase 5 Backend (API Route) — Needs API to exist
- ❌ Phase 3 (Company Research) — Cover letter needs company data

**Can run BEFORE:**
- ✅ Phase 6 (Email Automation) — Different feature
- ✅ Phase 7 (Analytics) — Different feature

**Estimated Time:** 2-3 hours (including testing)

---

## EDGE CASES TO HANDLE

1. **API returns error:**
   - Show user-friendly error message
   - Provide "Try again" button
   - Don't crash component

2. **Very long cover letter (>1000 words):**
   - Still render (no truncation)
   - Scrollable container
   - Word count updates correctly

3. **Empty cover letter (API bug):**
   - Show warning: "Cover letter is empty"
   - Disable copy/download buttons
   - Allow regenerate

4. **Copy fails (browser doesn't support clipboard API):**
   - Catch error
   - Show fallback: "Please copy manually"
   - Log to console

5. **Download fails (mobile browser restrictions):**
   - Try alternative: open in new tab with text
   - Fallback: show alert with instructions

6. **User clicks regenerate while already regenerating:**
   - Disable button (isRegenerating = true)
   - Show spinner
   - Ignore duplicate clicks

---

## FUTURE ENHANCEMENTS (Phase 2+)

1. **Rich Text Editor:**
   - Tiptap integration
   - Inline editing of paragraphs
   - Save changes to DB

2. **PDF Download:**
   - Professional template
   - Company logo integration
   - Custom formatting

3. **Version History:**
   - Keep all regenerated versions
   - Compare side-by-side
   - Restore previous version

4. **A/B Testing:**
   - Generate 2 versions simultaneously
   - User picks best one
   - Learn preferences

5. **AI Suggestions:**
   - "This paragraph could be more specific"
   - Inline improvement suggestions
   - One-click apply

6. **Multilingual:**
   - Detect job language
   - Generate in correct language
   - Translation toggle

---

## DESIGN MOCKUP (Notion-like)

```
┌─────────────────────────────────────────────────────┐
│ 📄 Generated Cover Letter          [250 words]     │
│                                     [ Formatted ▼]  │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Sehr geehrte Damen und Herren,                    │
│                                                     │
│  mit großem Interesse habe ich Ihre Stellenaus-    │
│  schreibung für die Position als Software          │
│  Developer bei Acme Corp gelesen...                │
│                                                     │
│  [More paragraphs...]                              │
│                                                     │
└─────────────────────────────────────────────────────┘

[🔄 Regenerate] [📋 Copy] [⬇️ Download]

┌─────────────────────────────────────────────────────┐
│ ✨ Quality Check Results           [2 Iterations]  │
├─────────────────────────────────────────────────────┤
│                     8.5/10                          │
│             Excellent Quality                       │
│                                                     │
│  🗣️ Naturalness: 9/10    ✍️ Style Match: 8/10     │
│  🎯 Relevance: 8/10      ⭐ Individuality: 9/10    │
└─────────────────────────────────────────────────────┘
```

---

## TYPESCRIPT INTERFACES

**Add to `types/` folder or inline:**

```typescript
// components/cover-letter/types.ts

export interface CoverLetterPreviewProps {
    coverLetter: string
    showFormatted?: boolean
}

export interface CoverLetterActionsProps {
    coverLetter: string
    onRegenerate: () => Promise<void>
    isRegenerating?: boolean
}

export interface Step4CoverLetterProps {
    jobId: string
    companyName: string
    jobTitle: string
    onComplete?: () => void
}

export interface GenerationResult {
    coverLetter: string
    qualityScores: QualityScores // from @/lib/services/quality-judge
    iterations: number
}
```

---

## TESTING STRATEGY

### Manual Testing:
1. **Happy Path:**
   - Click "Generate Cover Letter"
   - Wait for generation
   - Verify text displays
   - Click copy → Check clipboard
   - Click download → Check file
   - Click regenerate → Verify new text

2. **Error Handling:**
   - Disconnect network → Trigger API failure
   - Verify error message shows
   - Click retry → Reconnect → Success

3. **Loading States:**
   - Slow network → See skeleton loader
   - During regeneration → See spinner
   - Buttons disabled appropriately

4. **Edge Cases:**
   - Very long cover letter (1000+ words)
   - Empty response
   - Special characters in text

### Browser Testing:
- [ ] Chrome (clipboard API works)
- [ ] Firefox (clipboard API works)
- [ ] Safari (may need fallback)
- [ ] Mobile Chrome (download works)
- [ ] Mobile Safari (download may need fallback)

---

## DEPENDENCIES

**NPM Packages (if needed):**
- None required for MVP (use native APIs)
- Optional: `react-markdown` if you want richer formatting
- Phase 2: `jspdf` for PDF generation

**Existing Internal:**
- `components/motion/button.tsx` ✅
- `components/motion/badge.tsx` ✅
- `components/cover-letter/quality-feedback.tsx` ✅
- `lib/services/quality-judge.ts` ✅ (types)

---

## STATUS
**Created:** 2026-02-16  
**Status:** 🟡 PENDING IMPLEMENTATION  
**Next Review:** After Phase 5.2 complete  
**Owner:** Agent 5.2 (Cover Letter Frontend)

---

## NOTES

- **Why no PDF?** MVP focuses on speed. Users can copy to Word/Google Docs.
- **Why no editor?** Complex, time-consuming. Copy → Edit externally is faster for MVP.
- **Why .txt download?** Simple, universally compatible. PDF comes Phase 2.
- **Why auto-generate?** Better UX than manual "Generate" click. Happens when row expands.

---

## COMPLETION SIGNALS

✅ You know Phase 5.2 is DONE when:
1. User expands job-row → Cover letter auto-generates
2. Preview shows formatted text with word count
3. Quality scores display below
4. Copy button works (shows "Copied!" feedback)
5. Download button saves .txt file
6. Regenerate button triggers new generation
7. No console errors
8. TypeScript compiles cleanly
9. Notion-like design maintained
10. Mobile responsive works
