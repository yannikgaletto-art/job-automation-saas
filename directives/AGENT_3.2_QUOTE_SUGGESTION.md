# 🤖 AGENT PROMPT: PHASE 3.2 — QUOTE SUGGESTION SYSTEM

## MISSION
Enhance the existing Quote Suggestion System (`lib/services/quote-matcher.ts`) to improve relevance scoring, add quote-to-company-value mapping, and ensure quotes are properly stored in the `suggested_quotes` JSONB column.

## PREREQUISITES — READ FIRST! 🚨

1. **`docs/ARCHITECTURE.md`** — Understand how quotes feed into Cover Letter Generation (Step 7)
2. **`CLAUDE.md`** — "Reduce Complexity!" — Quotes are a NICE-TO-HAVE, not a blocker
3. **`database/schema.sql`** (Line 244) — `suggested_quotes JSONB[]` column structure
4. **`lib/services/quote-matcher.ts`** — READ EXISTING CODE FIRST
5. **`lib/services/company-enrichment.ts`** (Lines 222-226) — How quotes are integrated
6. **`directives/MASTER_PROMPT_TEMPLATE.md`** — Follow all 7 Execution Principles

## CURRENT STATE
- ✅ `lib/services/quote-matcher.ts` EXISTS (156 lines)
- ✅ `suggestRelevantQuotes()` function exported and called by `company-enrichment.ts`
- ✅ `QuoteSuggestion` type exported
- ⚠️ Relevance scoring algorithm may be basic
- ⚠️ No quote-to-value mapping (which value does each quote support?)
- ⚠️ Quote source/attribution might be missing

## YOUR TASK

### 3.2.1: Quote Discovery Enhancement
**Goal:** Improve the quality and diversity of suggested quotes.

**Implementation:**
1. Review existing `suggestRelevantQuotes(companyValues: string[])` function
2. Ensure quotes come from reputable sources (business leaders, industry experts)
3. Add German-language quote support (DACH market)
4. Limit to max 5 quotes per company (reduce noise)

### 3.2.2: Relevance Scoring (0-1)
**Goal:** Each quote gets a relevance score indicating how well it matches the company values.

**Implementation:**
```typescript
export interface QuoteSuggestion {
  quote: string           // The actual quote text
  author: string          // Who said it
  source?: string         // Where it's from (book, speech, etc.)
  relevance_score: number // 0.0 - 1.0
  matched_value: string   // Which company value this quote supports
  language: 'en' | 'de'   // Language of quote
}
```

### 3.2.3: Quote-Company Value Mapping
**Goal:** Each quote should be explicitly linked to a company value.

**Implementation:**
1. For each company value, find 1-2 matching quotes
2. Store the `matched_value` field in the QuoteSuggestion
3. Allow the Cover Letter Generator to pick the most relevant quote
4. Ensure no generic quotes that could apply to ANY company

### 3.2.4: Storage Format Verification
**Goal:** Ensure `suggested_quotes` JSONB[] format matches schema expectations.

**Implementation:**
1. Verify the output of `suggestRelevantQuotes()` is a proper JSONB[] array
2. Ensure Supabase insert/upsert correctly handles the array format
3. Test round-trip: write → read → verify structure

## VERIFICATION CHECKLIST
- [ ] `QuoteSuggestion` interface includes `matched_value` and `relevance_score`
- [ ] Quotes are relevant to specific company values (not generic)
- [ ] Max 5 quotes per company
- [ ] German-language quotes supported for DACH companies
- [ ] `suggested_quotes` column correctly populated as JSONB[]
- [ ] `npx tsc --noEmit` passes
- [ ] Integration with `company-enrichment.ts` still works

## SUCCESS CRITERIA
✅ Quote relevance scores ≥ 0.7 for top suggestions
✅ Each quote maps to a specific company value
✅ Quotes stored correctly in database
✅ Cover Letter Generator can consume quotes
✅ No breaking changes to existing enrichment flow

## EXECUTION ORDER
1. Read existing `quote-matcher.ts` thoroughly
2. Enhance `QuoteSuggestion` interface (3.2.2)
3. Implement value mapping (3.2.3)
4. Verify storage format (3.2.4)
5. Test integration with `company-enrichment.ts`

## ⚠️ PARALLELISIERUNG
✅ **Can run PARALLEL with 3.3 and 3.4**
⚠️ **Should run AFTER 3.1** if 3.1 changes the `EnrichmentResult` interface
