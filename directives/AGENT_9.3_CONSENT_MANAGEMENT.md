# 🤖 AGENT PROMPT: PHASE 9.3 — CONSENT MANAGEMENT & DSGVO COMPLIANCE

## MISSION
Implement a complete DSGVO-compliant consent management system that tracks user consent for Privacy Policy, Terms of Service, AI Processing, and Cookies. This ensures legal compliance and builds user trust.

---

## PREREQUISITES — READ FIRST! 🚨

**Before starting ANY work, you MUST read AND cross-reference these documents:**

1. **`database/schema.sql`** (Lines 17-32) — **CRITICAL: `consent_history` table**
   - Understand 4 document types: privacy_policy, terms_of_service, ai_processing, cookies
   - Document versioning system
   - IP address & user agent tracking

2. **`docs/ARCHITECTURE.md`** — System Architecture
   - Understand consent flow in onboarding

3. **`CLAUDE.md`** — "Reduce Complexity!"
   - MVP-first: Simple checkbox consent, no fancy modals
   - No over-engineering: Basic logging is enough

4. **`docs/MASTER_PLAN.md`** — Phase 9.3 details
   - Understand relationship to onboarding (Phase 1.1)

5. **`docs/DESIGN_SYSTEM.md`** — UI/UX Standards
   - Follow Notion-like aesthetic
   - Clean, trustworthy design for consent screens

6. **DSGVO Article 7** — Legal requirements
   - Consent must be freely given
   - Must be specific and informed
   - Must be documentable (Art. 7.1)
   - Withdrawal must be as easy as giving consent (Art. 7.3)

7. **`directives/MASTER_PROMPT_TEMPLATE.md`** — Follow all 7 Execution Principles

---

## EXECUTION PRINCIPLES

### 1. 🔍 Cross-Reference (Abgleich)
Before writing ANY code:
- Read ALL prerequisite docs listed above
- Check if any consent components already exist in `components/`
- Verify `consent_history` table is deployed
- Check existing onboarding flow

### 2. 🧹 Reduce Complexity
- **MVP first** — Simple checkboxes, no complex modals
- **No premature optimization** — Basic logging is enough
- **Reuse existing patterns** — Follow existing form components
- **Max 200 lines per file** — Split if larger

### 3. 📁 Proper Filing
- Consent screen component → `components/onboarding/consent-screen.tsx`
- API route → `app/api/consent/track/route.ts`
- Consent service → `lib/services/consent-manager.ts`
- Types → `types/consent.ts`

### 4. 🏆 Senior Engineer Autonomy
- Handle IP address extraction (use `request.headers`)
- Decide on user agent parsing strategy
- Choose appropriate error messages
- Design consent withdrawal flow

### 5. 🧪 Interoperability Testing
After implementation, verify:
- [ ] `npx tsc --noEmit` passes
- [ ] Consent screen renders correctly
- [ ] API route returns proper HTTP status codes
- [ ] Database inserts respect RLS policies
- [ ] Consent is enforced before app access

### 6. ⚡ Efficiency
- Use single API call for all 4 consents
- Batch insert for performance
- Cache consent status client-side (session storage)

### 7. 📝 Additional Standards
- **TypeScript strict** — Type all consent data
- **Error handling** — `try/catch` on all async operations
- **Logging** — Console logs with emoji prefixes (✅ ❌ ⚠️ 📝)
- **HTTP Status** — 200 (success), 400 (bad request), 401 (unauthorized), 500 (server error)

---

## CURRENT STATE

### ✅ Already Exists
- `database/schema.sql` with `consent_history` table
- RLS policies on consent_history
- Document version tracking structure

### ⚠️ Partially Exists
- Onboarding flow may exist, but consent screen missing
- No API routes for consent tracking

### ❌ Missing (Your Task)
- Consent screen component
- API route for consent tracking
- Consent validation middleware
- Consent withdrawal flow
- Legal document pages (Privacy Policy, ToS)

---

## YOUR TASK

### 9.3.1: Create Legal Documents
**Goal:** Create basic legal document pages.

**Implementation:**
```typescript
// app/legal/privacy-policy/page.tsx
// app/legal/terms-of-service/page.tsx
// app/legal/ai-processing/page.tsx
// app/legal/cookie-policy/page.tsx

export default function PrivacyPolicyPage() {
  return (
    <div className="max-w-4xl mx-auto p-8">
      <h1>Privacy Policy</h1>
      <p className="text-sm text-gray-600">Version 1.0 | Last Updated: Feb 2026</p>
      
      {/* Placeholder content */}
      <section>
        <h2>1. Data Collection</h2>
        <p>We collect...</p>
      </section>
    </div>
  )
}
```

**MVP Content:**
- **Privacy Policy:** Data collection, storage, encryption, DSGVO rights
- **Terms of Service:** Service description, user obligations, liability
- **AI Processing:** Explain Claude API usage, data sent to Anthropic, retention
- **Cookie Policy:** Session cookies only (no tracking cookies for MVP)

**Acceptance Criteria:**
- ✅ All 4 legal document pages exist
- ✅ Each page shows document version
- ✅ Content is readable and user-friendly
- ✅ Links work from consent screen

---

### 9.3.2: Create Consent Screen Component
**Goal:** DSGVO-compliant consent interface.

**Implementation:**
```typescript
// components/onboarding/consent-screen.tsx

import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { ExternalLink } from "lucide-react"

interface ConsentItem {
  type: "privacy_policy" | "terms_of_service" | "ai_processing" | "cookies"
  label: string
  description: string
  required: boolean
  documentUrl: string
}

export function ConsentScreen() {
  const [consents, setConsents] = useState<Record<string, boolean>>({
    privacy_policy: false,
    terms_of_service: false,
    ai_processing: false,
    cookies: false
  })

  const consentItems: ConsentItem[] = [
    {
      type: "privacy_policy",
      label: "Privacy Policy",
      description: "I agree to the collection and processing of my personal data as described.",
      required: true,
      documentUrl: "/legal/privacy-policy"
    },
    {
      type: "terms_of_service",
      label: "Terms of Service",
      description: "I accept the terms and conditions of using this service.",
      required: true,
      documentUrl: "/legal/terms-of-service"
    },
    {
      type: "ai_processing",
      label: "AI Processing",
      description: "I consent to my data being processed by AI models (Claude API) for document generation.",
      required: true,
      documentUrl: "/legal/ai-processing"
    },
    {
      type: "cookies",
      label: "Cookie Policy",
      description: "I accept the use of essential cookies for authentication.",
      required: true,
      documentUrl: "/legal/cookie-policy"
    }
  ]

  const allRequiredConsentsGiven = consentItems
    .filter(item => item.required)
    .every(item => consents[item.type])

  async function handleSubmit() {
    // 1. Validate all required consents
    // 2. Call POST /api/consent/track
    // 3. Redirect to next onboarding step
  }

  return (
    <div className="max-w-2xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-2">Before We Start</h1>
      <p className="text-gray-600 mb-8">
        To use Pathly, we need your consent for the following:
      </p>

      <div className="space-y-6">
        {consentItems.map(item => (
          <div key={item.type} className="flex items-start gap-3 p-4 border rounded-lg">
            <Checkbox
              checked={consents[item.type]}
              onCheckedChange={(checked) => 
                setConsents(prev => ({ ...prev, [item.type]: checked }))
              }
            />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <label className="font-medium">{item.label}</label>
                {item.required && (
                  <span className="text-xs text-red-600">*Required</span>
                )}
                <a
                  href={item.documentUrl}
                  target="_blank"
                  className="text-blue-600 hover:underline"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
              <p className="text-sm text-gray-600 mt-1">{item.description}</p>
            </div>
          </div>
        ))}
      </div>

      <Button
        onClick={handleSubmit}
        disabled={!allRequiredConsentsGiven}
        className="w-full mt-8"
      >
        Continue
      </Button>

      <p className="text-xs text-gray-500 mt-4 text-center">
        You can withdraw your consent at any time in your account settings.
      </p>
    </div>
  )
}
```

**Acceptance Criteria:**
- ✅ All 4 consent checkboxes displayed
- ✅ Required consents marked with asterisk
- ✅ Links to legal documents open in new tab
- ✅ "Continue" button disabled until all required consents given
- ✅ Clear withdrawal notice displayed
- ✅ Follows design system (clean, trustworthy)

---

### 9.3.3: Create Consent Tracking API
**Goal:** Backend service to log consent with IP and user agent.

**Implementation:**
```typescript
// app/api/consent/track/route.ts

import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"

const DOCUMENT_VERSION = "v1.0" // Update when legal docs change

export async function POST(request: Request) {
  try {
    // 1. Get authenticated user
    const supabase = createRouteHandlerClient({ cookies })
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return new Response("Unauthorized", { status: 401 })
    }

    // 2. Parse request body
    const body = await request.json()
    const { consents } = body // { privacy_policy: true, terms_of_service: true, ... }

    // 3. Validate required consents
    const requiredTypes = ["privacy_policy", "terms_of_service", "ai_processing", "cookies"]
    for (const type of requiredTypes) {
      if (!consents[type]) {
        return new Response(`Missing required consent: ${type}`, { status: 400 })
      }
    }

    // 4. Extract IP address and user agent
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || 
               request.headers.get("x-real-ip") ||
               "unknown"
    const userAgent = request.headers.get("user-agent") || "unknown"

    // 5. Insert consent records
    const consentRecords = Object.entries(consents).map(([type, given]) => ({
      user_id: user.id,
      document_type: type,
      document_version: DOCUMENT_VERSION,
      consent_given: given,
      ip_address: ip,
      user_agent: userAgent
    }))

    const { error } = await supabase
      .from("consent_history")
      .insert(consentRecords)

    if (error) {
      console.error("❌ Consent tracking failed:", error)
      return new Response("Failed to track consent", { status: 500 })
    }

    console.log("✅ Consent tracked for user:", user.id)
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    })

  } catch (error) {
    console.error("❌ Consent tracking error:", error)
    return new Response("Internal server error", { status: 500 })
  }
}
```

**Acceptance Criteria:**
- ✅ Authenticated users only
- ✅ Validates all required consents
- ✅ Extracts IP address from headers
- ✅ Extracts user agent from headers
- ✅ Batch inserts all 4 consents
- ✅ Returns 200 on success
- ✅ Returns proper error codes (400, 401, 500)
- ✅ Logs all operations

---

### 9.3.4: Create Consent Verification Service
**Goal:** Check if user has given required consents.

**Implementation:**
```typescript
// lib/services/consent-manager.ts

import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

const DOCUMENT_VERSION = "v1.0"
const REQUIRED_CONSENTS = [
  "privacy_policy",
  "terms_of_service",
  "ai_processing",
  "cookies"
]

export interface ConsentStatus {
  hasAllConsents: boolean
  missingConsents: string[]
  lastConsentedAt?: Date
}

export async function checkUserConsent(userId: string): Promise<ConsentStatus> {
  const { data: consents, error } = await supabase
    .from("consent_history")
    .select("document_type, consent_given, consented_at")
    .eq("user_id", userId)
    .eq("document_version", DOCUMENT_VERSION)
    .eq("consent_given", true)

  if (error) {
    console.error("❌ Failed to check consent:", error)
    return { hasAllConsents: false, missingConsents: REQUIRED_CONSENTS }
  }

  const givenConsents = new Set(consents.map(c => c.document_type))
  const missingConsents = REQUIRED_CONSENTS.filter(type => !givenConsents.has(type))

  const lastConsentedAt = consents.length > 0
    ? new Date(Math.max(...consents.map(c => new Date(c.consented_at).getTime())))
    : undefined

  return {
    hasAllConsents: missingConsents.length === 0,
    missingConsents,
    lastConsentedAt
  }
}

export async function withdrawConsent(
  userId: string,
  documentType: string
): Promise<{ success: boolean; error?: string }> {
  // Insert new record with consent_given = false
  const { error } = await supabase
    .from("consent_history")
    .insert({
      user_id: userId,
      document_type: documentType,
      document_version: DOCUMENT_VERSION,
      consent_given: false
    })

  if (error) {
    console.error("❌ Failed to withdraw consent:", error)
    return { success: false, error: error.message }
  }

  console.log("✅ Consent withdrawn for:", documentType)
  return { success: true }
}
```

**Acceptance Criteria:**
- ✅ `checkUserConsent()` returns complete status
- ✅ Checks current document version only
- ✅ Returns list of missing consents
- ✅ `withdrawConsent()` inserts new record (doesn't delete)
- ✅ Handles errors gracefully

---

### 9.3.5: Add Consent Middleware
**Goal:** Enforce consent before app access.

**Implementation:**
```typescript
// middleware.ts (add to existing middleware)

import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export async function middleware(request: NextRequest) {
  const res = NextResponse.next()
  const supabase = createMiddlewareClient({ req: request, res })

  // Get authenticated user
  const { data: { user } } = await supabase.auth.getUser()

  // Skip consent check for public routes
  const publicRoutes = ["/", "/login", "/signup", "/legal/*", "/api/consent/track"]
  if (publicRoutes.some(route => request.nextUrl.pathname.startsWith(route))) {
    return res
  }

  // If user is authenticated, check consent
  if (user) {
    const { data: consents } = await supabase
      .from("consent_history")
      .select("document_type, consent_given")
      .eq("user_id", user.id)
      .eq("document_version", "v1.0")
      .eq("consent_given", true)

    const requiredConsents = ["privacy_policy", "terms_of_service", "ai_processing", "cookies"]
    const givenConsents = new Set(consents?.map(c => c.document_type) || [])
    const hasAllConsents = requiredConsents.every(type => givenConsents.has(type))

    if (!hasAllConsents && request.nextUrl.pathname !== "/onboarding/consent") {
      // Redirect to consent screen
      return NextResponse.redirect(new URL("/onboarding/consent", request.url))
    }
  }

  return res
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
```

**Acceptance Criteria:**
- ✅ Public routes accessible without consent
- ✅ Authenticated users redirected to consent screen if missing
- ✅ Users with all consents can access app
- ✅ Doesn't create infinite redirect loop

---

### 9.3.6: Add Consent Withdrawal Page
**Goal:** Allow users to withdraw consent (DSGVO Art. 7.3).

**Implementation:**
```typescript
// app/settings/privacy/page.tsx

import { withdrawConsent, checkUserConsent } from "@/lib/services/consent-manager"

export default function PrivacySettingsPage() {
  const [consentStatus, setConsentStatus] = useState<ConsentStatus | null>(null)

  useEffect(() => {
    // Load current consent status
    async function loadConsents() {
      const status = await checkUserConsent(user.id)
      setConsentStatus(status)
    }
    loadConsents()
  }, [])

  async function handleWithdraw(documentType: string) {
    const confirmed = confirm(
      "Withdrawing this consent will prevent you from using Pathly. Continue?"
    )
    
    if (confirmed) {
      await withdrawConsent(user.id, documentType)
      // Redirect to account deletion or logout
    }
  }

  return (
    <div>
      <h1>Privacy & Consent Management</h1>
      
      <section>
        <h2>Your Consents</h2>
        <p>Last updated: {consentStatus?.lastConsentedAt?.toLocaleDateString()}</p>
        
        {/* List all consents with withdraw buttons */}
      </section>

      <section>
        <h2>Data Deletion</h2>
        <Button variant="destructive" onClick={() => handleDeleteAccount()}>
          Delete My Account & All Data
        </Button>
      </section>
    </div>
  )
}
```

**Acceptance Criteria:**
- ✅ Shows current consent status
- ✅ Allows withdrawal of each consent
- ✅ Warns user about consequences
- ✅ Provides account deletion option
- ✅ Complies with DSGVO Art. 7.3 (easy withdrawal)

---

## VERIFICATION CHECKLIST
- [ ] All prerequisite docs read and cross-referenced
- [ ] All 4 legal document pages created
- [ ] Consent screen component renders correctly
- [ ] API route tracks consent with IP and user agent
- [ ] Consent verification service works
- [ ] Middleware enforces consent before app access
- [ ] Consent withdrawal page functional
- [ ] `npx tsc --noEmit` passes
- [ ] No infinite redirect loops
- [ ] Browser test on localhost:3000 confirms functionality
- [ ] `docs/MASTER_PLAN.md` updated (Phase 9.3 tasks checked off)

---

## SUCCESS CRITERIA
✅ All required consents tracked in database
✅ IP address and user agent logged
✅ Users cannot access app without consent
✅ Withdrawal flow functional
✅ DSGVO Article 7 compliant

---

## EXECUTION ORDER
1. Read all prerequisite documents
2. Create legal document pages (9.3.1)
3. Create consent screen component (9.3.2)
4. Create consent tracking API (9.3.3)
5. Create consent verification service (9.3.4)
6. Add consent middleware (9.3.5)
7. Add consent withdrawal page (9.3.6)
8. Test complete flow on localhost:3000
9. Run `npx tsc --noEmit`
10. Update `docs/MASTER_PLAN.md`

---

## ⚠️ PARALLELISATION HINT
✅ **Can run parallel with Phase 5 (Cover Letter)** — Independent feature
✅ **Can run parallel with Phase 6 (Application History)** — Independent feature
❌ **Cannot run parallel with Phase 1 (Onboarding)** — Consent is part of onboarding

---

## 🔗 DEPENDENCIES
- **Depends on:** Phase 8.1 (Database deployed with consent_history table)
- **Required by:** Phase 1 (Onboarding flow)
- **Legal requirement:** DSGVO compliance before public launch

---

## 🚨 LEGAL REQUIREMENTS (DSGVO)

### Article 7: Conditions for Consent
1. **Freely Given** — No forced bundling (each consent separate)
2. **Specific** — Each document type separate checkbox
3. **Informed** — Links to full legal documents provided
4. **Unambiguous** — Clear checkbox action, no pre-checked boxes
5. **Documentable** — IP address, user agent, timestamp logged
6. **Withdrawable** — Must be as easy as giving consent

### Article 17: Right to Erasure
- User must be able to delete all data
- Account deletion = consent withdrawal

### Article 25: Data Protection by Design
- No data collection before consent given
- Minimal data collection (only essential cookies)

---

## 📝 DOCUMENT VERSION MANAGEMENT

When legal documents are updated:
1. Increment version in code: `const DOCUMENT_VERSION = "v1.1"`
2. Update legal document pages with new version number
3. Users with old version will be prompted to re-consent
4. Old consent records remain in database (audit trail)

**Query to check who needs re-consent:**
```sql
SELECT DISTINCT user_id
FROM consent_history
WHERE document_version != 'v1.1'
AND consent_given = true;
```

---

## 🎯 MVP STATUS

| Feature | MVP? | Reason |
|---------|------|--------|
| Consent screen | ✅ **P1 Critical** | Legal requirement |
| Consent tracking | ✅ **P1 Critical** | DSGVO Art. 7 |
| Legal documents | ✅ **P1 Critical** | Must exist for consent |
| Withdrawal flow | ⚠️ **P2 Important** | Required by DSGVO, but can be simple |
| Account deletion | ⚠️ **P2 Important** | DSGVO Art. 17 |

---

**This is legally required before public launch!** ⚖️
