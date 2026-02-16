# 🤖 AGENT PROMPT: PHASE 12.2 — EMPTY STATES & ERROR MESSAGES

## MISSION
Implement beautiful, helpful empty states and user-friendly error messages throughout the application. Transform every "nothing here" moment into a clear call-to-action, and every error into a solvable problem.

---

## PREREQUISITES — READ FIRST! 🚨

**Before starting ANY work, you MUST read AND cross-reference these documents:**

1. **`docs/DESIGN_SYSTEM.md`** — **CRITICAL: UI/UX Standards**
   - Study empty state patterns
   - Understand error message tone (helpful, not scary)
   - Follow Notion-like aesthetic (clean, friendly)

2. **`docs/ARCHITECTURE.md`** — System Architecture
   - Understand where empty states occur
   - Know error scenarios for each operation

3. **`CLAUDE.md`** — "Reduce Complexity!"
   - MVP-first: Simple text first, illustrations later
   - Reuse empty state patterns
   - Max 3 error severity levels (info, warning, error)

4. **`docs/MASTER_PLAN.md`** — Phase 12.2 details
   - Understand relationship to other UX polish tasks

5. **Existing Components** — Study these:
   - `components/ui/alert.tsx` — For error messages
   - `components/dashboard/` — Components to enhance

6. **shadcn/ui Documentation** — Alert component
   - https://ui.shadcn.com/docs/components/alert

7. **`directives/MASTER_PROMPT_TEMPLATE.md`** — Follow all 7 Execution Principles

---

## EXECUTION PRINCIPLES

### 1. 🔍 Cross-Reference (Abgleich)
Before writing ANY code:
- Read ALL prerequisite docs listed above
- Check existing empty states in codebase
- Verify shadcn/ui Alert component is installed
- Map all empty state scenarios

### 2. 🧹 Reduce Complexity
- **MVP first** — Simple text + icon, no custom illustrations
- **Reuse patterns** — Max 3 empty state variants
- **Clear CTAs** — Every empty state has next action
- **Max 100 lines per empty state component**

### 3. 📁 Proper Filing
- Empty state components → `components/empty-states/`
- Error alert component → `components/ui/error-alert.tsx`
- Error boundary → `components/error-boundary.tsx`

### 4. 🏆 Senior Engineer Autonomy
- Decide which empty states need CTAs
- Choose appropriate icons for each scenario
- Write helpful error messages (not technical jargon)
- Handle edge cases gracefully

### 5. 🧪 Interoperability Testing
After implementation, verify:
- [ ] `npx tsc --noEmit` passes
- [ ] Empty states render correctly
- [ ] Error messages are helpful
- [ ] Retry mechanisms work
- [ ] Mobile responsive

### 6. ⚡ Efficiency
- Lazy load empty state components
- Don't re-render unnecessarily
- Cache error messages

### 7. 📝 Additional Standards
- **TypeScript strict** — Type all error props
- **Accessibility** — Use semantic HTML for alerts
- **Design System** — Follow color scheme (gray for empty, red for errors)
- **Tone** — Friendly, helpful, never blame user

---

## CURRENT STATE

### ✅ Already Exists
- `components/ui/alert.tsx` — For basic alerts (if installed)
- Tailwind CSS for styling
- lucide-react icons

### ⚠️ Partially Exists
- Some components may have basic "no data" messages
- No consistent empty state pattern

### ❌ Missing (Your Task)
- Empty state for job queue (no jobs yet)
- Empty state for application history (no applications)
- Empty state for document uploads (no documents)
- User-friendly error messages
- Error boundaries
- Retry mechanisms

---

## YOUR TASK

### 12.2.1: Create Base Empty State Component
**Goal:** Reusable empty state pattern.

**Implementation:**
```typescript
// components/empty-states/empty-state.tsx

import { LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
}

export function EmptyState({ 
  icon: Icon, 
  title, 
  description, 
  actionLabel, 
  onAction 
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center">
      <div className="rounded-full bg-gray-100 p-3 mb-4">
        <Icon className="h-8 w-8 text-gray-400" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-sm text-gray-600 max-w-md mb-6">{description}</p>
      {actionLabel && onAction && (
        <Button onClick={onAction}>{actionLabel}</Button>
      )}
    </div>
  )
}
```

**Acceptance Criteria:**
- ✅ Accepts icon, title, description
- ✅ Optional action button
- ✅ Centered layout
- ✅ Follows design system colors
- ✅ Mobile responsive

---

### 12.2.2: Create Specific Empty States
**Goal:** Implement empty states for key features.

**Implementation:**

#### **Empty Job Queue**
```typescript
// components/empty-states/empty-job-queue.tsx

import { Briefcase } from "lucide-react"
import { EmptyState } from "./empty-state"

export function EmptyJobQueue({ onAddJob }: { onAddJob: () => void }) {
  return (
    <EmptyState
      icon={Briefcase}
      title="No jobs in queue"
      description="Start by adding a job URL to automatically generate optimized applications."
      actionLabel="Add Your First Job"
      onAction={onAddJob}
    />
  )
}
```

#### **Empty Application History**
```typescript
// components/empty-states/empty-application-history.tsx

import { FileText } from "lucide-react"
import { EmptyState } from "./empty-state"

export function EmptyApplicationHistory() {
  return (
    <EmptyState
      icon={FileText}
      title="No applications yet"
      description="Your application history will appear here once you start applying to jobs."
    />
  )
}
```

#### **Empty Document Library**
```typescript
// components/empty-states/empty-documents.tsx

import { Upload } from "lucide-react"
import { EmptyState } from "./empty-state"

export function EmptyDocuments({ onUpload }: { onUpload: () => void }) {
  return (
    <EmptyState
      icon={Upload}
      title="No documents uploaded"
      description="Upload your CV and sample cover letters to train the AI on your writing style."
      actionLabel="Upload Documents"
      onAction={onUpload}
    />
  )
}
```

#### **Empty Company Research**
```typescript
// components/empty-states/empty-research.tsx

import { Search } from "lucide-react"
import { EmptyState } from "./empty-state"

export function EmptyResearch() {
  return (
    <EmptyState
      icon={Search}
      title="No research available"
      description="Company research will be automatically fetched when you add a job."
    />
  )
}
```

**Acceptance Criteria:**
- ✅ All major features have empty states
- ✅ Clear descriptions
- ✅ Appropriate icons
- ✅ CTAs where relevant
- ✅ Consistent styling

---

### 12.2.3: Create Error Alert Component
**Goal:** User-friendly error messages.

**Implementation:**
```typescript
// components/ui/error-alert.tsx

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertCircle, RefreshCw, X } from "lucide-react"
import { Button } from "@/components/ui/button"

interface ErrorAlertProps {
  title?: string
  message: string
  onRetry?: () => void
  onDismiss?: () => void
}

export function ErrorAlert({ 
  title = "Something went wrong", 
  message, 
  onRetry, 
  onDismiss 
}: ErrorAlertProps) {
  return (
    <Alert variant="destructive" className="relative">
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="absolute top-3 right-3 text-red-600 hover:text-red-800"
        >
          <X className="h-4 w-4" />
        </button>
      )}
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="mt-2">
        {message}
        {onRetry && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            className="mt-3"
          >
            <RefreshCw className="h-3 w-3 mr-2" />
            Try Again
          </Button>
        )}
      </AlertDescription>
    </Alert>
  )
}
```

**Usage:**
```typescript
{error && (
  <ErrorAlert
    message="Failed to load jobs. Please check your connection."
    onRetry={() => refetch()}
    onDismiss={() => setError(null)}
  />
)}
```

**Acceptance Criteria:**
- ✅ Clear error icon
- ✅ Optional retry button
- ✅ Optional dismiss button
- ✅ Red color scheme (destructive)
- ✅ Accessible

---

### 12.2.4: Create Error Boundary
**Goal:** Catch React errors gracefully.

**Implementation:**
```typescript
// components/error-boundary.tsx

import React, { Component, ReactNode } from "react"
import { AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("❌ Error caught by boundary:", error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-8">
          <div className="rounded-full bg-red-100 p-3 mb-4">
            <AlertCircle className="h-8 w-8 text-red-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Something went wrong
          </h2>
          <p className="text-sm text-gray-600 mb-6 text-center max-w-md">
            We encountered an unexpected error. Please try refreshing the page.
          </p>
          <Button onClick={() => window.location.reload()}>
            Refresh Page
          </Button>
          {process.env.NODE_ENV === "development" && this.state.error && (
            <pre className="mt-6 p-4 bg-gray-100 rounded text-xs overflow-auto max-w-2xl">
              {this.state.error.toString()}
            </pre>
          )}
        </div>
      )
    }

    return this.props.children
  }
}
```

**Usage:**
```typescript
// app/layout.tsx
import { ErrorBoundary } from "@/components/error-boundary"

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
      </body>
    </html>
  )
}
```

**Acceptance Criteria:**
- ✅ Catches React errors
- ✅ Shows user-friendly message
- ✅ Refresh button provided
- ✅ Shows error details in development
- ✅ Logs error to console

---

### 12.2.5: Create User-Friendly Error Messages
**Goal:** Transform technical errors into helpful messages.

**Implementation:**
```typescript
// lib/utils/error-messages.ts

export function getUserFriendlyErrorMessage(error: unknown): string {
  if (typeof error === "string") return error

  if (error instanceof Error) {
    // Network errors
    if (error.message.includes("fetch") || error.message.includes("network")) {
      return "Connection error. Please check your internet and try again."
    }

    // API errors
    if (error.message.includes("401") || error.message.includes("Unauthorized")) {
      return "Your session has expired. Please log in again."
    }

    if (error.message.includes("403") || error.message.includes("Forbidden")) {
      return "You don't have permission to perform this action."
    }

    if (error.message.includes("404") || error.message.includes("Not found")) {
      return "The requested resource was not found."
    }

    if (error.message.includes("500")) {
      return "Server error. Our team has been notified. Please try again later."
    }

    // Validation errors
    if (error.message.includes("validation") || error.message.includes("invalid")) {
      return "Please check your input and try again."
    }

    // File upload errors
    if (error.message.includes("file") || error.message.includes("upload")) {
      return "File upload failed. Please ensure the file is under 5MB and try again."
    }

    // Duplicate errors
    if (error.message.includes("duplicate") || error.message.includes("already applied")) {
      return "You've already applied to this job recently."
    }

    // Rate limit errors
    if (error.message.includes("rate limit") || error.message.includes("too many")) {
      return "You're doing that too often. Please wait a moment and try again."
    }

    // Default: Return original message if not too technical
    if (error.message.length < 100 && !error.message.includes("Error:")) {
      return error.message
    }
  }

  // Fallback
  return "An unexpected error occurred. Please try again."
}
```

**Usage:**
```typescript
try {
  await scrapeJob(url)
} catch (error) {
  const message = getUserFriendlyErrorMessage(error)
  setError(message)
}
```

**Acceptance Criteria:**
- ✅ Covers all common error types
- ✅ Messages are non-technical
- ✅ Provides actionable advice
- ✅ Never exposes internal details
- ✅ Fallback for unknown errors

---

### 12.2.6: Add Retry Mechanisms
**Goal:** Let users retry failed operations.

**Implementation:**
```typescript
// lib/hooks/use-retry.ts

import { useState } from "react"

export function useRetry<T>(
  asyncFn: () => Promise<T>,
  maxRetries = 3
) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)

  async function execute() {
    setIsLoading(true)
    setError(null)

    try {
      const result = await asyncFn()
      setRetryCount(0)
      return result
    } catch (err) {
      const message = getUserFriendlyErrorMessage(err)
      setError(message)
      throw err
    } finally {
      setIsLoading(false)
    }
  }

  async function retry() {
    if (retryCount >= maxRetries) {
      setError("Maximum retry attempts reached. Please try again later.")
      return
    }

    setRetryCount(prev => prev + 1)
    return execute()
  }

  return { execute, retry, isLoading, error, retryCount, canRetry: retryCount < maxRetries }
}
```

**Usage:**
```typescript
const { execute, retry, isLoading, error, canRetry } = useRetry(
  () => fetch("/api/jobs/scrape", { method: "POST", body: JSON.stringify({ url }) })
)

{error && (
  <ErrorAlert
    message={error}
    onRetry={canRetry ? retry : undefined}
  />
)}
```

**Acceptance Criteria:**
- ✅ Limits retry attempts (max 3)
- ✅ Tracks retry count
- ✅ Shows error messages
- ✅ Reusable across operations

---

### 12.2.7: Add Contextual Help
**Goal:** Add help text to common error scenarios.

**Implementation:**
```typescript
// components/ui/help-text.tsx

import { Info } from "lucide-react"

interface HelpTextProps {
  children: React.ReactNode
}

export function HelpText({ children }: HelpTextProps) {
  return (
    <div className="flex gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
      <Info className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
      <p className="text-sm text-blue-900">{children}</p>
    </div>
  )
}
```

**Usage:**
```typescript
// After job scraping fails
{error?.includes("scraping") && (
  <HelpText>
    Scraping failed? Try these:
    <ul className="mt-2 list-disc list-inside space-y-1">
      <li>Make sure the URL is correct</li>
      <li>Some job boards block automated access</li>
      <li>Try copying the job details manually instead</li>
    </ul>
  </HelpText>
)}
```

**Acceptance Criteria:**
- ✅ Blue info styling (not alarming)
- ✅ Clear, actionable advice
- ✅ Used in key error scenarios

---

## VERIFICATION CHECKLIST
- [ ] All prerequisite docs read and cross-referenced
- [ ] Base EmptyState component created
- [ ] All major features have empty states
- [ ] ErrorAlert component created
- [ ] ErrorBoundary implemented
- [ ] User-friendly error messages function created
- [ ] Retry mechanism hook created
- [ ] Help text component created
- [ ] All error scenarios handled gracefully
- [ ] `npx tsc --noEmit` passes
- [ ] Browser test on localhost:3000 confirms functionality
- [ ] Mobile responsive
- [ ] `docs/MASTER_PLAN.md` updated (Phase 12.2 tasks checked off)

---

## SUCCESS CRITERIA
✅ Every "nothing here" state has helpful empty state
✅ Every error has user-friendly message
✅ Retry mechanisms work for failed operations
✅ Error boundary catches all React errors
✅ Users never see technical jargon

---

## EXECUTION ORDER
1. Read all prerequisite documents
2. Create base EmptyState component (12.2.1)
3. Create specific empty states (12.2.2)
4. Create ErrorAlert component (12.2.3)
5. Create ErrorBoundary (12.2.4)
6. Create user-friendly error messages (12.2.5)
7. Add retry mechanisms (12.2.6)
8. Add contextual help (12.2.7)
9. Test all error scenarios on localhost:3000
10. Run `npx tsc --noEmit`
11. Update `docs/MASTER_PLAN.md`

---

## ⚠️ PARALLELISATION HINT
✅ **Can run parallel with Phase 12.1 (Loading States)** — Independent UI polish
✅ **Can run parallel with any backend phase** — Pure frontend work
❌ **Should NOT run parallel with Phase 1-3** — Need components to exist first

---

## 🔗 DEPENDENCIES
- **Depends on:** Major components implemented
- **Required by:** None (polish feature)
- **Enhances:** User experience across all phases

---

## 📋 EMPTY STATE INVENTORY

| Component | Empty State | Icon | CTA |
|-----------|-------------|------|-----|
| Job Queue | EmptyJobQueue | Briefcase | "Add Your First Job" |
| Application History | EmptyApplicationHistory | FileText | None |
| Document Library | EmptyDocuments | Upload | "Upload Documents" |
| Company Research | EmptyResearch | Search | None |
| Cover Letter Preview | (Generated on demand) | — | — |

---

## 🚨 ERROR SCENARIOS TO HANDLE

| Operation | Error Type | User-Friendly Message |
|-----------|------------|----------------------|
| Job Scraping | Network | "Connection error. Check your internet." |
| Job Scraping | Blocked | "This site blocks automated access. Try manual entry." |
| File Upload | Too Large | "File must be under 5MB." |
| File Upload | Wrong Type | "Only PDF and DOCX files supported." |
| Cover Letter Gen | API Limit | "Daily limit reached. Upgrade or try tomorrow." |
| Cover Letter Gen | Timeout | "Generation timed out. Try again." |
| Duplicate Application | Already Applied | "You applied to this job recently." |
| Auth | Session Expired | "Session expired. Please log in again." |
| Unknown | Fallback | "Something went wrong. Try again." |

---

**Goal:** Never leave users confused or stuck! 🎯
