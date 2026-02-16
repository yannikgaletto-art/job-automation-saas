# 🤖 AGENT PROMPT: PHASE 6.2 — APPLICATION HISTORY UI (Frontend)

## MISSION
Build a beautiful, Notion-inspired Application History table that displays user's past applications with company logos, formatted dates, method badges, and quick actions. This is the user-facing dashboard for application management.

---

## PREREQUISITES — READ FIRST! 🚨

**Before starting ANY work, you MUST read AND cross-reference these documents:**

1. **`docs/ARCHITECTURE.md`** — System Architecture & Data Flow
   - Understand where this UI fits in the dashboard

2. **`docs/DESIGN_SYSTEM.md`** — **CRITICAL: UI/UX Standards**
   - Follow Notion-like aesthetic (`bg-[#FAFAF9]`, clean tables)
   - Study existing table patterns in codebase
   - Color scheme: Light mode, `bg-white`, subtle shadows

3. **`CLAUDE.md`** — **"Reduce Complexity!"**
   - MVP-first: Simple table first, fancy features later
   - No over-engineering: Use shadcn/ui Table component

4. **`docs/MASTER_PLAN.md`** — Phase 6.2 details
   - Understand backend dependency (Phase 6.1 must be complete)

5. **`directives/AGENT_6.1_APPLICATION_HISTORY_BACKEND.md`** — Backend API spec
   - Study API response formats
   - Understand pagination structure

6. **`components/dashboard/` folder** — Existing dashboard components
   - Check how other tables are implemented
   - Reuse patterns for consistency

7. **`directives/MASTER_PROMPT_TEMPLATE.md`** — Follow all 7 Execution Principles

---

## EXECUTION PRINCIPLES

### 1. 🔍 Cross-Reference (Abgleich)
Before writing ANY code:
- Read ALL prerequisite docs listed above
- Check existing components in `components/dashboard/` for table patterns
- Check existing API route usage (how other components fetch data)
- Verify shadcn/ui Table component is installed (`components/ui/table.tsx`)

### 2. 🧹 Reduce Complexity
- **MVP first** — Basic table with pagination, no infinite scroll
- **No premature optimization** — Client-side pagination is fine for MVP
- **Reuse existing patterns** — Copy structure from other dashboard tables
- **Max 300 lines per component** — Split if larger

### 3. 📁 Proper Filing
- Main component → `components/dashboard/application-history.tsx`
- Sub-components (if needed) → `components/dashboard/application-history/`
- API fetch hook → `lib/hooks/use-application-history.ts` (optional)
- Types → Export from component or create `types/applications.ts`

### 4. 🎖️ Senior Engineer Autonomy
- Decide on loading states (skeleton vs spinner)
- Handle empty states gracefully
- Add proper error messages
- Choose appropriate icons from `lucide-react`

### 5. 🧪 Interoperability Testing
After implementation, verify:
- [ ] `npx tsc --noEmit` passes
- [ ] Component renders correctly in dashboard layout
- [ ] No layout shifts during loading
- [ ] Mobile responsive (table scrolls horizontally if needed)
- [ ] No console errors in browser

### 6. ⚡ Efficiency
- Lazy load company logos (only visible rows)
- Use `React.memo` for table rows if performance issues
- Debounce pagination clicks

### 7. 📝 Additional Standards
- **TypeScript strict** — Type all API responses
- **Accessibility** — Proper table semantics (`<thead>`, `<tbody>`)
- **Design System** — Follow `DESIGN_SYSTEM.md` colors and spacing
- **Icons** — Use `lucide-react` consistently

---

## CURRENT STATE

### ✅ Already Exists
- `components/ui/table.tsx` (shadcn/ui Table component)
- `components/ui/badge.tsx` (for Method badges)
- `components/ui/button.tsx` (for Quick Actions)
- `app/dashboard/page.tsx` (where to integrate this component)
- Backend API routes from Phase 6.1 (must be complete first)

### ⚠️ Partially Exists
- Dashboard layout exists, but no Application History section yet
- Pagination pattern exists in other components (check `job-queue` components)

### ❌ Missing (Your Task)
- `application-history.tsx` component
- API data fetching logic
- Company logo integration (Clearbit or placeholder)
- Date formatting utilities (or use `date-fns`)
- Integration into dashboard page

---

## YOUR TASK

### 6.2.1: Create `ApplicationHistory` Component
**Goal:** Main table component with all features.

**Implementation:**
```typescript
// components/dashboard/application-history.tsx

import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ExternalLink, Download } from "lucide-react"

interface Application {
    id: string
    companyName: string
    jobTitle: string
    appliedAt: string // ISO 8601
    applicationMethod: "auto" | "manual" | "extension"
    jobUrl: string
    generatedDocuments?: {
        cv_url?: string
        cover_letter_url?: string
    }
}

export function ApplicationHistory() {
    // 1. Fetch data from GET /api/applications/history
    // 2. Handle loading state
    // 3. Handle error state
    // 4. Render table with:
    //    - Company Logo (optional)
    //    - Company Name + Job Title
    //    - Applied Date (formatted)
    //    - Method Badge
    //    - Quick Actions (Open URL, Download)
    // 5. Pagination controls at bottom
}
```

**Table Columns:**
1. **Company** — Logo + Name (stacked)
2. **Role** — Job Title
3. **Applied** — Formatted date (e.g., "Feb 15, 2026")
4. **Method** — Badge (Auto/Manual/Extension)
5. **Actions** — Icon buttons (Open Job, Download Docs)

**Acceptance Criteria:**
- ✅ Uses shadcn/ui `Table` component
- ✅ Follows `DESIGN_SYSTEM.md` styling (light mode, clean)
- ✅ Shows loading skeleton during fetch
- ✅ Shows empty state if no applications
- ✅ Shows error message if API fails
- ✅ All data fetched from API (no hardcoded data)

---

### 6.2.2: Add Company Logos (Optional for MVP)
**Goal:** Display company logos from Clearbit or use placeholder.

**Implementation:**
```typescript
// Option 1: Clearbit Logo API (FREE tier)
const logoUrl = `https://logo.clearbit.com/${companyDomain}`
// e.g., https://logo.clearbit.com/google.com

// Option 2: Placeholder with Company Initial
const initial = companyName.charAt(0).toUpperCase()
<div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
    <span className="text-sm font-medium">{initial}</span>
</div>
```

**Clearbit Domain Extraction:**
```typescript
function extractDomain(url: string): string | null {
    try {
        const domain = new URL(url).hostname.replace("www.", "")
        return domain
    } catch {
        return null
    }
}
```

**Acceptance Criteria:**
- ✅ Clearbit logo loads if domain extractable from `jobUrl`
- ✅ Fallback to placeholder if logo fails to load
- ✅ Logo is 40x40px, rounded
- ✅ Lazy loading (only load visible logos)

**MVP Decision:** Clearbit is **optional** — Use placeholder initials for MVP.

---

### 6.2.3: Add Date Formatting
**Goal:** Display dates in user-friendly format.

**Implementation:**
```typescript
import { formatDistanceToNow, format } from "date-fns"

function formatAppliedDate(isoDate: string): string {
    const date = new Date(isoDate)
    const now = new Date()
    const diffDays = (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)

    if (diffDays < 7) {
        return formatDistanceToNow(date, { addSuffix: true }) // "2 days ago"
    } else {
        return format(date, "MMM d, yyyy") // "Feb 15, 2026"
    }
}
```

**Acceptance Criteria:**
- ✅ Recent applications (<7 days) show relative time
- ✅ Older applications show absolute date
- ✅ Uses `date-fns` library (already in `package.json`)

---

### 6.2.4: Add Method Badges
**Goal:** Visual indicator of application method.

**Implementation:**
```typescript
import { Badge } from "@/components/ui/badge"

function MethodBadge({ method }: { method: "auto" | "manual" | "extension" }) {
    const variants = {
        auto: { label: "Auto", className: "bg-green-100 text-green-700" },
        manual: { label: "Manual", className: "bg-blue-100 text-blue-700" },
        extension: { label: "Extension", className: "bg-purple-100 text-purple-700" }
    }
    const { label, className } = variants[method]

    return <Badge className={className}>{label}</Badge>
}
```

**Acceptance Criteria:**
- ✅ Each method has distinct color
- ✅ Colors match design system (pastel, light mode)
- ✅ Badges are small and unobtrusive

---

### 6.2.5: Add Quick Actions
**Goal:** Icon buttons for common actions.

**Implementation:**
```typescript
import { Button } from "@/components/ui/button"
import { ExternalLink, Download } from "lucide-react"

function QuickActions({ jobUrl, documents }: { 
    jobUrl: string
    documents?: { cv_url?: string; cover_letter_url?: string }
}) {
    return (
        <div className="flex gap-2">
            <Button
                variant="ghost"
                size="icon"
                onClick={() => window.open(jobUrl, "_blank")}
            >
                <ExternalLink className="h-4 w-4" />
            </Button>
            {documents?.cv_url && (
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => downloadDocument(documents.cv_url!)}
                >
                    <Download className="h-4 w-4" />
                </Button>
            )}
        </div>
    )
}
```

**Acceptance Criteria:**
- ✅ Open Job URL button always visible
- ✅ Download button only visible if documents exist
- ✅ Icons are from `lucide-react`
- ✅ Buttons use `ghost` variant (minimal)

---

### 6.2.6: Add Pagination Controls
**Goal:** Navigate through pages of applications.

**Implementation:**
```typescript
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight } from "lucide-react"

function PaginationControls({ page, hasMore, onPageChange }: {
    page: number
    hasMore: boolean
    onPageChange: (page: number) => void
}) {
    return (
        <div className="flex justify-between items-center mt-4">
            <Button
                variant="outline"
                disabled={page === 1}
                onClick={() => onPageChange(page - 1)}
            >
                <ChevronLeft className="h-4 w-4 mr-2" />
                Previous
            </Button>
            <span className="text-sm text-gray-600">Page {page}</span>
            <Button
                variant="outline"
                disabled={!hasMore}
                onClick={() => onPageChange(page + 1)}
            >
                Next
                <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
        </div>
    )
}
```

**Acceptance Criteria:**
- ✅ Previous button disabled on page 1
- ✅ Next button disabled when `hasMore: false`
- ✅ Current page number displayed
- ✅ Page changes trigger new API fetch

---

### 6.2.7: Integrate into Dashboard
**Goal:** Add component to main dashboard page.

**Implementation:**
```typescript
// app/dashboard/page.tsx

import { ApplicationHistory } from "@/components/dashboard/application-history"

export default function DashboardPage() {
    return (
        <div className="p-8">
            {/* Existing components... */}
            
            <section className="mt-8">
                <h2 className="text-2xl font-semibold mb-4">Application History</h2>
                <ApplicationHistory />
            </section>
        </div>
    )
}
```

**Acceptance Criteria:**
- ✅ Component appears below existing dashboard sections
- ✅ Has clear heading ("Application History")
- ✅ Respects dashboard layout padding/spacing
- ✅ No layout conflicts with other components

---

## VERIFICATION CHECKLIST
- [ ] All prerequisite docs read and cross-referenced
- [ ] `ApplicationHistory` component renders correctly
- [ ] Data fetched from `GET /api/applications/history` API
- [ ] Loading state shows skeleton/spinner
- [ ] Empty state shows helpful message
- [ ] Error state shows retry button
- [ ] Company logos display (or placeholder)
- [ ] Dates formatted user-friendly
- [ ] Method badges colored correctly
- [ ] Quick Actions buttons work
- [ ] Pagination controls function
- [ ] Component integrated into dashboard
- [ ] `npx tsc --noEmit` passes
- [ ] Browser test on localhost:3000 confirms functionality
- [ ] Mobile responsive (table scrolls)
- [ ] No console errors
- [ ] `docs/MASTER_PLAN.md` updated (Phase 6.2 tasks checked off)

---

## SUCCESS CRITERIA
✅ Table displays all applications with correct data
✅ Pagination works smoothly
✅ UI matches Notion-like design system
✅ All actions (Open URL, Download) work
✅ Component is reusable and maintainable

---

## EXECUTION ORDER
1. Read all prerequisite documents
2. Create `application-history.tsx` component skeleton
3. Implement data fetching logic
4. Add table rendering with all columns
5. Add company logos (placeholder first)
6. Add date formatting
7. Add method badges
8. Add quick actions
9. Add pagination controls
10. Integrate into dashboard page
11. Test on localhost:3000
12. Run `npx tsc --noEmit`
13. Update `docs/MASTER_PLAN.md`

---

## ⚠️ PARALLELISATION HINT
❌ **Cannot run parallel with 6.1 (Backend)** — Requires API routes from 6.1 first
✅ **Can run parallel with Phase 5** — Independent UI component
✅ **Can run parallel with Phase 7-8** — No direct dependencies

---

## 🔗 DEPENDENCIES
- **Depends on:** Phase 6.1 (Backend API routes must exist)
- **Required by:** None (standalone feature)
- **Optional enhancement:** Phase 8 (Database deployed for real data)
