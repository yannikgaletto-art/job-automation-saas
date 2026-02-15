# 🤖 AGENT PROMPT: PHASE 3.3 — COMPANY RESEARCH DISPLAY (Frontend)

## MISSION
Create a beautiful, Notion-like Company Intelligence Card component that displays enriched company data (values, news, LinkedIn activity) and allows users to select quotes for their cover letters.

## PREREQUISITES — READ FIRST! 🚨

1. **`docs/ARCHITECTURE.md`** — Understand data flow from enrichment → display
2. **`docs/DESIGN_SYSTEM.md`** — **CRITICAL**: Follow Notion-like aesthetic exactly
   - Background: `bg-[#FAFAF9]` or `bg-white`
   - Text: `text-[#37352F]` (dark), `text-[#73726E]` (muted)
   - Borders: `border-[#E7E7E5]`
   - Cards: Clean, minimal, lots of whitespace
3. **`CLAUDE.md`** — "Reduce Complexity!" — Start with display-only, add interactivity later
4. **`lib/services/company-enrichment.ts`** — Understand `EnrichmentResult` interface
5. **`lib/services/quote-matcher.ts`** — Understand `QuoteSuggestion` interface
6. **`components/cover-letter/quality-feedback.tsx`** — Reference for card component styling
7. **`directives/MASTER_PROMPT_TEMPLATE.md`** — Follow all 7 Execution Principles

## CURRENT STATE
- ✅ Backend services exist and return structured data
- ✅ Design system documented
- ✅ Existing components (quality-feedback, job-row) provide style reference
- ❌ No Company Intel display component exists
- ❌ No Quote Selection interface exists
- ❌ No Recent News display exists

## YOUR TASK

### 3.3.1: Company Intel Card Component
**Goal:** Display company intelligence data in a clean, scannable card.

**Implementation:**
1. Create `components/company/company-intel-card.tsx`:
   ```tsx
   "use client"

   import { motion } from "framer-motion"

   interface CompanyIntelCardProps {
     companyName: string
     companyValues: string[]
     recentNews: Array<{ headline: string; date?: string }>
     linkedinActivity: Array<{
       content: string
       theme: string
       engagement: string
       date: string
     }>
     confidenceScore: number
     cachedAt?: string
   }

   export function CompanyIntelCard({
     companyName,
     companyValues,
     recentNews,
     linkedinActivity,
     confidenceScore,
     cachedAt
   }: CompanyIntelCardProps) {
     return (
       <div className="bg-white rounded-lg border border-[#E7E7E5] p-6 space-y-6">
         {/* Header with confidence badge */}
         {/* Company Values as tags */}
         {/* Recent News list */}
         {/* LinkedIn Activity feed */}
         {/* Cache indicator */}
       </div>
     )
   }
   ```

### 3.3.2: Quote Selection Interface
**Goal:** Let users pick quotes to include in their cover letters.

**Implementation:**
1. Create `components/company/quote-selector.tsx`:
   ```tsx
   "use client"

   import { useState } from "react"
   import type { QuoteSuggestion } from "@/lib/services/quote-matcher"

   interface QuoteSelectorProps {
     quotes: QuoteSuggestion[]
     onQuoteSelect: (quote: QuoteSuggestion | null) => void
     selectedQuoteIndex?: number
   }

   export function QuoteSelector({
     quotes,
     onQuoteSelect,
     selectedQuoteIndex
   }: QuoteSelectorProps) {
     // Each quote as a selectable card
     // Show relevance score with color coding
     // Show which company value it matches
     // "Custom Quote" input option at bottom
   }
   ```

### 3.3.3: Recent News Display
**Goal:** Show latest company news in a clean timeline format.

**Implementation:**
1. Part of `CompanyIntelCard` or separate `components/company/news-feed.tsx`
2. Max 3 news items displayed
3. Each item: headline, date, source link (if available)
4. Subtle animation on mount (framer-motion stagger)

### 3.3.4: Custom Quote Input
**Goal:** Allow users to type their own quote if suggestions don't fit.

**Implementation:**
1. Add to bottom of `QuoteSelector`
2. Simple text input with character limit (200 chars)
3. Toggle between "Use Suggested" and "Write Custom"

## VERIFICATION CHECKLIST
- [ ] `components/company/company-intel-card.tsx` created
- [ ] `components/company/quote-selector.tsx` created
- [ ] Design matches Notion aesthetic (colors, spacing, typography)
- [ ] Confidence score displayed with color coding (green/orange/red)
- [ ] LinkedIn activity shows post themes and engagement
- [ ] Quote selection saves to state (ready for Cover Letter Generator)
- [ ] Custom quote input works
- [ ] Components render correctly in existing dashboard layout
- [ ] Browser test on localhost:3000 confirms visual quality
- [ ] `npx tsc --noEmit` passes

## SUCCESS CRITERIA
✅ Company Intel Card looks premium and matches existing dashboard aesthetic
✅ Quote Selection is intuitive (click to select, visual feedback)
✅ News feed is clean and informative
✅ Custom quote option available
✅ All components are properly typed (no `any`)
✅ Components integrate with existing data from `enrichCompany()`

## EXECUTION ORDER
1. Read all prerequisites (especially DESIGN_SYSTEM.md)
2. Study existing component styles (quality-feedback.tsx, job-row.tsx)
3. Create `company-intel-card.tsx` (3.3.1)
4. Create `quote-selector.tsx` (3.3.2 + 3.3.4)
5. Add news display (3.3.3)
6. Integrate into dashboard or job detail view
7. Browser test on localhost:3000

## ⚠️ PARALLELISIERUNG
✅ **Can run PARALLEL with 3.1, 3.2, and 3.4**
- Frontend components don't depend on backend changes
- Uses existing `EnrichmentResult` and `QuoteSuggestion` interfaces
- If 3.1 changes interfaces, a quick update pass is needed
