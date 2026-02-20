# Pathly V2.0 - AGENT OPERATING SYSTEM

**Project:** Pathly V2.0  
**Version:** 3.0  
**Status:** TypeScript Migration Complete  

---

## 0. IDENTITY & MISSION

**Core Principle:**
> "AI assists, humans decide. Every application must pass through user review."

---

## 1. AGENT OVERVIEW

| Agent | Responsibility | Implementation | Status |
|-------|----------------|----------------|--------|
| **Agent 1** | Job Input Parser | `api/jobs/ingest/route.ts` | ✅ Implementation Complete |
| **Agent 2** | Job Filtering | PENDING | 🚧 Planned |
| **Agent 3** | Company Research | `lib/services/company-enrichment.ts` | ✅ Implementation Complete |
| **Agent 4** | CV Optimization | PENDING | 🚧 Planned |
| **Agent 5** | Cover Letter | `lib/services/cover-letter-generator.ts` | ✅ Implementation Complete |
| **Agent 6** | Quality Judge | PENDING | 🚧 Planned |

---

## 2. AGENT DETAILS

### AGENT 3: COMPANY RESEARCH (Research Agent)

**Responsibility:** Gather real-time company intelligence.
**Implementation:** [`lib/services/company-enrichment.ts`](./lib/services/company-enrichment.ts)
**API Route:** `app/api/jobs/process/route.ts`

**Architecture:**
1. Check Supabase Cache (7 days TTL)
2. If miss: Call Perplexity Sonar Pro
3. store in `company_research` table

**TypeScript Implementation:**
```typescript
import { checkCache, saveToCache } from '@/lib/services/company-enrichment';
// See file for full implementation
```

---

### AGENT 5: COVER LETTER GENERATION (Writer Agent)

**Responsibility:** Generate personalized cover letters.
**Implementation:** [`lib/services/cover-letter-generator.ts`](./lib/services/cover-letter-generator.ts)
**API Route:** `app/api/cover-letter/generate/route.ts`

**Architecture:**
1. Fetch Job Data + Company Research
2. Fetch User Profile + Writing Style
3. Generate via Claude 3.5 Sonnet
4. Store in `documents` table

**TypeScript Implementation:**
```typescript
import { generateCoverLetter } from '@/lib/services/cover-letter-generator';
// See file for full implementation
```

---

## 3. DATA SCHEMA

See [`database/schema.sql`](./database/schema.sql) for the authoritative source of truth.

**Key Tables:**
- `company_research` (Cache)
- `job_queue` (State Machine)
- `documents` (Generated content)

---

**Status:** ✅ ACTIVE & MIGRATED  
