# 🏗️ AGENT 5.1: WRITING STYLE ANALYSIS SERVICE

**Phase:** 5.1 — Cover Letter Generation (Backend)  
**Agent:** Writing Style Analyzer  
**Estimated Time:** 3-4 hours  
**Dependencies:** Phase 1 (Document Upload), Phase 3 (Company Research)

---

## MISSION
Analyze user's uploaded cover letter examples to extract writing style patterns (tone, conjunctions, sentence structure, greeting style). This enables the Cover Letter Generator to mimic the user's authentic voice instead of producing generic AI text.

**Why this matters:** The `cover-letter-generator.ts` already reads `metadata.style_analysis`, but **nothing writes it yet**. This is the missing link between document upload and authentic generation.

---

## PREREQUISITES — READ FIRST! 🚨

**Before starting ANY work, you MUST read AND cross-reference these documents:**

1. **`docs/ARCHITECTURE.md`** — System Architecture & Data Flow
   - Study Phase 1 (Document Processing) and Phase 5 (Cover Letter Generation)
   - Understand the pipeline: Upload → Extract → Analyze → Store

2. **`database/schema.sql`** — Database Schema
   - Study `documents` table structure
   - Verify `metadata` JSONB field supports style_analysis object
   - Check `writing_style_embedding` VECTOR(1536) column

3. **`CLAUDE.md`** — **CRITICAL: "Reduce Complexity!"**
   - MVP-first: Extract 4-5 key style markers, not 50 metrics
   - Don't over-engineer: Simple Claude Haiku analysis, not ML pipeline
   - Ship fast: User can regenerate if style match isn't perfect

4. **`docs/MASTER_PLAN.md`** — Overall Roadmap
   - Check Phase 1.3 (Document Processing) completion status
   - Understand Phase 5 dependencies

5. **`lib/services/cover-letter-generator.ts`** — **CRITICAL**
   - Line 52-53: See how styleAnalysis is consumed
   - Understand expected structure: `{ tone, sentence_length, conjunctions, greeting }`

6. **`lib/services/document-processor.ts`** — Existing Pattern
   - Study how metadata is currently extracted (Lines 38-72)
   - Follow same error handling pattern

---

## EXECUTION PRINCIPLES

### 1. 🔍 Cross-Reference (Abgleich)
Before writing ANY code:
- ✅ Read `cover-letter-generator.ts` to see exact fields it expects
- ✅ Verify `documents.metadata` JSONB structure in schema.sql
- ✅ Check `document-processor.ts` for integration points
- ✅ Review existing Anthropic API usage patterns

### 2. 🧹 Reduce Complexity
- **MVP metrics only:** tone, sentence_length, conjunctions[], greeting
- **Don't extract:** personality traits, emotional tone, 20+ linguistic features
- **Simple prompt:** One-shot analysis, no multi-stage pipeline
- **Fast model:** Claude Haiku 3 (cheap, fast, good enough for style extraction)

### 3. 📁 Proper Filing
- New service → `lib/services/writing-style-analyzer.ts`
- Integration → Modify `lib/services/document-processor.ts` (add style analysis call)
- Types → Export `StyleAnalysis` interface for reuse
- Update `docs/MASTER_PLAN.md` → Check off Phase 5.1 tasks

### 4. 🎖️ Senior Engineer Autonomy
- Handle missing cover letters gracefully (skip analysis, log warning)
- Decide on fallback values if Claude API fails
- Choose appropriate token limits for analysis
- Add proper TypeScript types without being asked

### 5. 🧪 Interoperability Testing
After implementation, verify:
- [ ] `npx tsc --noEmit` passes (no new TypeScript errors)
- [ ] `document-processor.ts` integrates style analyzer without breaking existing CV flow
- [ ] `metadata.style_analysis` is written to DB correctly
- [ ] `cover-letter-generator.ts` receives non-empty styleAnalysis object

### 6. ⚡ Efficiency
- **Reuse:** Use existing Anthropic client from document-processor
- **Parallel:** Can run concurrently with PII extraction (not blocking)
- **Cache:** Don't re-analyze same document twice (check if metadata.style_analysis exists)
- **Token limit:** Analyze first 2000 chars only (cover letters are ~250-350 words)

### 7. 📝 Additional Standards
- **TypeScript strict** — No `any` types
- **Error handling** — Try/catch with fallback to default style
- **Logging** — Use emoji prefixes (✅ 📊 ⚠️)
- **JSON parsing** — Robust handling of Claude's JSON response
- **Cost tracking** — Log tokens used for monitoring

---

## CURRENT STATE

### ✅ What ALREADY exists:
1. **`lib/services/cover-letter-generator.ts`** (207 lines)
   - Reads `styleAnalysis` from metadata (Line 52-53)
   - Expects: `{ tone, sentence_length, conjunctions, greeting }`
   
2. **`database/schema.sql`**
   - `documents.metadata` JSONB column ✅
   - `documents.writing_style_embedding` VECTOR(1536) ✅

3. **`lib/services/document-processor.ts`**
   - Extracts text via Claude Haiku
   - Saves metadata to DB
   - **But:** No style analysis call

### ⚠️ What is PARTIALLY done:
- Document upload flow works, but only extracts PII + skills
- Metadata JSONB structure supports style_analysis, but it's never written

### ❌ What is MISSING (YOUR TASK):
1. **`lib/services/writing-style-analyzer.ts`** (NEW FILE)
   - Service to analyze cover letter text
   - Extract 4 style markers
   
2. **Integration in `document-processor.ts`**
   - Call analyzer for `document_type === 'cover_letter'`
   - Write `style_analysis` to metadata

3. **Type Definition**
   - Export `StyleAnalysis` interface

---

## YOUR TASK

### 5.1.1: Create Writing Style Analyzer Service
**Goal:** Analyze cover letter text and extract 4 key style markers

**File:** `lib/services/writing-style-analyzer.ts`

**Implementation:**
```typescript
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY || '',
});

export interface StyleAnalysis {
    tone: 'professional' | 'enthusiastic' | 'technical' | 'conversational';
    sentence_length: 'short' | 'medium' | 'long'; // avg 10-15 / 16-25 / 26+ words
    conjunctions: string[]; // Top 5 most used (e.g., ["Daher", "Deshalb", "Gleichzeitig"])
    greeting: string; // e.g., "Sehr geehrte Damen und Herren" or "Hallo [Name]"
}

/**
 * Analyze writing style from cover letter text
 * Uses Claude Haiku for fast, cheap extraction
 */
export async function analyzeWritingStyle(
    coverLetterText: string
): Promise<StyleAnalysis> {
    // Edge case: Text too short
    if (coverLetterText.length < 100) {
        console.warn('⚠️ Cover letter too short for style analysis (<100 chars)');
        return getDefaultStyle();
    }

    // Only analyze first 2000 chars (cover letters are ~250-350 words = ~1500 chars)
    const textToAnalyze = coverLetterText.slice(0, 2000);

    try {
        const message = await anthropic.messages.create({
            model: 'claude-3-haiku-20240307',
            max_tokens: 512,
            temperature: 0,
            system: `You are a writing style analyzer. Extract style patterns from cover letters.
Return ONLY valid JSON with these 4 keys:
- tone: "professional" | "enthusiastic" | "technical" | "conversational"
- sentence_length: "short" | "medium" | "long"
- conjunctions: array of top 5 conjunctions used (German: Daher, Deshalb, etc.)
- greeting: the exact greeting used (e.g., "Sehr geehrte Damen und Herren")`,
            messages: [{
                role: 'user',
                content: `Analyze the writing style of this cover letter:

${textToAnalyze}

Return JSON with: tone, sentence_length, conjunctions, greeting`
            }]
        });

        // Parse JSON response
        const contentBlock = message.content[0];
        if (contentBlock.type === 'text') {
            const jsonMatch = contentBlock.text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const analysis = JSON.parse(jsonMatch[0]);
                
                // Validate structure
                if (analysis.tone && analysis.sentence_length && 
                    Array.isArray(analysis.conjunctions) && analysis.greeting) {
                    
                    console.log(`📊 Style analysis: ${analysis.tone}, ${analysis.sentence_length} sentences`);
                    return analysis as StyleAnalysis;
                }
            }
        }

        throw new Error('Invalid JSON response from Claude');

    } catch (error) {
        console.error('❌ Style analysis failed:', error);
        return getDefaultStyle();
    }
}

/**
 * Fallback style if analysis fails
 */
function getDefaultStyle(): StyleAnalysis {
    return {
        tone: 'professional',
        sentence_length: 'medium',
        conjunctions: ['Daher', 'Deshalb', 'Zudem', 'Außerdem', 'Gleichzeitig'],
        greeting: 'Sehr geehrte Damen und Herren'
    };
}
```

---

### 5.1.2: Integrate into Document Processor
**Goal:** Call style analyzer for cover letter uploads

**File:** `lib/services/document-processor.ts` (MODIFY)

**Changes:**
1. Import the analyzer at top:
```typescript
import { analyzeWritingStyle, StyleAnalysis } from './writing-style-analyzer';
```

2. After PII extraction, add style analysis (around line 70):
```typescript
// 3. Style Analysis (only for cover letters)
let styleAnalysis: StyleAnalysis | undefined;

if (mimeType === 'application/pdf' || mimeType.includes('word')) {
    // Assuming we can detect document type from content or metadata
    // For MVP: Analyze ALL uploaded documents as potential cover letters
    // Later: Add document_type parameter to processDocument()
    
    try {
        styleAnalysis = await analyzeWritingStyle(rawText);
        console.log('✅ Style analysis complete');
    } catch (error) {
        console.error('⚠️ Style analysis failed, continuing without it:', error);
        // Don't block upload if style analysis fails
    }
}
```

3. Add to metadata return (around line 95):
```typescript
return {
    rawText,
    sanitizedText,
    encryptedPii,
    metadata: {
        ...analysisResult.metadata,
        style_analysis: styleAnalysis, // NEW
        content_snippet: rawText.slice(0, 500) // For preview in cover-letter-generator
    }
};
```

**IMPORTANT:** This modifies an existing file. Use `git diff` to verify changes don't break CV processing.

---

### 5.1.3: Update Document Upload API (Optional Enhancement)
**Goal:** Pass `document_type` parameter so analyzer only runs for cover letters

**File:** `app/api/documents/upload/route.ts` (if exists)

**Change:** Pass document type to processor:
```typescript
const processed = await processDocument(
    fileBuffer, 
    mimeType,
    documentType // 'cv' | 'cover_letter'
);
```

Then modify `document-processor.ts` to accept `documentType` parameter:
```typescript
export async function processDocument(
    fileBuffer: Buffer, 
    mimeType: string,
    documentType: 'cv' | 'cover_letter' = 'cv' // Default to cv for backwards compat
): Promise<ProcessedDocument> {
    // ...
    
    // Only analyze cover letters
    if (documentType === 'cover_letter') {
        styleAnalysis = await analyzeWritingStyle(rawText);
    }
}
```

---

### 5.1.4: Embedding Generation (Phase 2 — Optional for MVP)
**Goal:** Generate vector embedding for semantic style matching

**File:** `lib/services/writing-style-analyzer.ts` (ADD FUNCTION)

**Implementation:**
```typescript
import OpenAI from 'openai';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || '',
});

/**
 * Generate embedding for style matching (Phase 2 feature)
 * Cost: ~$0.0001 per cover letter
 */
export async function generateStyleEmbedding(
    coverLetterText: string
): Promise<number[]> {
    try {
        const response = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: coverLetterText.slice(0, 2000), // Max 2000 chars
        });

        return response.data[0].embedding; // Returns 1536-dimensional vector

    } catch (error) {
        console.error('❌ Embedding generation failed:', error);
        return []; // Return empty array (DB allows null)
    }
}
```

**Integration:** Add to `document-processor.ts` after style analysis:
```typescript
// 4. Generate Style Embedding (Phase 2)
let styleEmbedding: number[] = [];
if (documentType === 'cover_letter' && process.env.OPENAI_API_KEY) {
    styleEmbedding = await generateStyleEmbedding(rawText);
}

// Later: Save to documents.writing_style_embedding column
```

**MVP Note:** Skip embedding generation for MVP (Phase 1). Add in Phase 2 when implementing style similarity search.

---

## VERIFICATION CHECKLIST

### Phase 1 (MVP):
- [ ] `lib/services/writing-style-analyzer.ts` created
- [ ] `StyleAnalysis` interface exported
- [ ] `analyzeWritingStyle()` function works
- [ ] `getDefaultStyle()` fallback exists
- [ ] `document-processor.ts` calls analyzer for cover letters
- [ ] `metadata.style_analysis` written to DB
- [ ] `cover-letter-generator.ts` receives non-empty styleAnalysis
- [ ] `npx tsc --noEmit` passes
- [ ] Test with real cover letter upload

### Phase 2 (Future):
- [ ] `generateStyleEmbedding()` function added
- [ ] `writing_style_embedding` column populated
- [ ] Semantic style matching implemented

---

## SUCCESS CRITERIA

### Phase 1 (MVP):
✅ User uploads cover letter → `metadata.style_analysis` is populated  
✅ Cover letter generator receives: tone, conjunctions, greeting  
✅ Generated cover letters use similar conjunctions as user's examples  
✅ No breaking changes to CV upload flow  
✅ Fallback to default style if analysis fails (no blocking errors)

### System-Wide:
✅ Analysis time < 3 seconds per cover letter  
✅ Cost per analysis < $0.005 (Claude Haiku is ~$0.25 per 1M input tokens)  
✅ Success rate > 90% (graceful degradation for remaining 10%)

---

## EXECUTION ORDER

### Step 1: Read Prerequisites (15 min)
- [ ] Read `cover-letter-generator.ts` (understand styleAnalysis usage)
- [ ] Read `document-processor.ts` (understand integration point)
- [ ] Study `database/schema.sql` (verify metadata structure)

### Step 2: Create Analyzer Service (1.5 hours)
- [ ] Create `lib/services/writing-style-analyzer.ts`
- [ ] Implement `analyzeWritingStyle()` function
- [ ] Add `StyleAnalysis` interface
- [ ] Add `getDefaultStyle()` fallback
- [ ] Test with sample cover letter text

### Step 3: Integrate into Processor (1 hour)
- [ ] Modify `document-processor.ts`
- [ ] Add style analysis call for cover letters
- [ ] Update metadata return object
- [ ] Test with document upload flow

### Step 4: Test Interoperability (30 min)
- [ ] `npx tsc --noEmit` passes
- [ ] Upload cover letter via UI
- [ ] Check DB: `documents.metadata.style_analysis` exists
- [ ] Verify cover-letter-generator receives data

### Step 5: Update Documentation (15 min)
- [ ] Update `docs/MASTER_PLAN.md` → Check Phase 5.1 tasks
- [ ] Add cost estimate to monitoring docs
- [ ] Document styleAnalysis schema in comments

---

## ⚠️ PARALLELISIERUNGS-HINWEIS

**Can run in parallel with:**
- ✅ Phase 5.2 (Frontend Display) — No dependencies
- ✅ Phase 4.1/4.2 (CV Optimization) — Different services

**Must run AFTER:**
- ❌ Phase 1.2/1.3 (Document Upload) — Requires text extraction to exist

**Must run BEFORE:**
- ❌ Phase 5.3/5.4 (Cover Letter Generation Frontend) — Generator needs style data

**Estimated Time:** 3-4 hours (including testing)

---

## COST ESTIMATE

**Per Cover Letter Analysis:**
- Claude Haiku 3 (2000 chars ≈ 500 tokens input, 200 tokens output): **$0.0004**
- OpenAI Embedding (Phase 2, 2000 chars): **$0.0001**
- **Total:** ~$0.0005 per cover letter

**Monthly (1000 cover letters uploaded):**
- Style Analysis: **$0.50**
- Embeddings (Phase 2): **$0.10**
- **Total:** ~$0.60/month

**Impact:** Negligible cost, massive quality improvement for cover letter generation.

---

## EDGE CASES TO HANDLE

1. **Cover letter too short (<100 chars):**
   - Return default style
   - Log warning
   
2. **Claude API fails:**
   - Catch error
   - Return default style
   - Don't block upload

3. **Invalid JSON response:**
   - Try to extract JSON with regex
   - Fallback to default style if fails

4. **No ANTHROPIC_API_KEY:**
   - Return default style immediately
   - Log warning (similar to document-processor.ts pattern)

5. **User uploaded CV instead of cover letter:**
   - Analysis will still work (extracts generic professional tone)
   - Not harmful, just not useful

---

## FUTURE ENHANCEMENTS (Phase 2+)

1. **Multi-Document Style Averaging:**
   - Analyze 2-3 cover letters
   - Average tone, merge conjunction lists
   - More robust style profile

2. **Style Similarity Search:**
   - Use embeddings to find similar user styles
   - "Users like you tend to use..."
   - Improve generation prompts

3. **A/B Testing:**
   - Generate 2 versions (user style vs. professional default)
   - Let user pick
   - Learn preferences

4. **User Feedback Loop:**
   - "Was this style accurate?" thumbs up/down
   - Adjust style weights over time

---

## STATUS
**Created:** 2026-02-16  
**Status:** 🟡 PENDING IMPLEMENTATION  
**Next Review:** After Phase 5.1 complete  
**Owner:** Agent 5.1 (Writing Style Analysis)
