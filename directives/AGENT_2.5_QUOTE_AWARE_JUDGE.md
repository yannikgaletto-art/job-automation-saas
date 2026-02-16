# AGENT_2.5: Quote-Aware Quality Judge Extension

## 🎯 Goal
Erweitere den **Quality Judge** (`lib/services/quality-judge.ts`) um zusätzliche Checks basierend auf Real-World Cover Letter Patterns:
- **Quote Integration Check** (optional, nur wenn Zitat vorhanden)
- **Company Specificity Check** (ALWAYS required)
- **Opening/Closing Tone Check**

Diese Direktive ist für **spätere Integration in Phase 2** (Quality Judge Loop) gedacht.

---

## 📋 Context: Real-World Cover Letter Patterns

### Beobachtete Patterns (aus User-Samples):

**1. Quote-Opening (Optional, aber wenn vorhanden → Qualitätsprüfung)**
```
"Ich möchte gerne ein Zitat mit Euch teilen..."
[Zitat von bekannter Persönlichkeit]
"Dieser Gedanke resoniert/hat mich geprägt..."
→ Verknüpfung mit Company Mission
→ "Da ich hier Schnittmengen sehe..."
```

**2. Company-Specific Elements (ALWAYS Required)**
- Firmenname mehrfach erwähnt (min. 2x)
- **Konkrete Company Values zitiert** (nicht "innovative Kultur")
- **Office Location erwähnt** (zeigt Research)
- **Spezifische Initiativen/Projekte** erwähnt

**3. Authentic Opening/Closing**
- Opening: Direkte Ansprache ("Liebes X-Team"), kein "Hiermit bewerbe ich mich..."
- Closing: Kurz & authentisch ("Beste Grüße"), nicht überschwänglich

---

## 🛠️ Implementation Tasks

### 1. Extend `QualityScores` Interface

**File:** `lib/services/quality-judge.ts`

```typescript
export interface QualityScores {
    // Existing scores...
    overall_score: number;
    naturalness_score: number;
    style_match_score: number;
    company_relevance_score: number;
    individuality_score: number;
    issues: string[];
    suggestions: string[];
    
    // NEW: Optional Quote Integration
    quote_integration?: {
        has_quote: boolean;
        quote_source: string | null;
        quote_relevance: number; // 1-10
        quote_bridge: boolean; // Verknüpfung mit Company Mission?
        quote_quality_note: string;
    };
    
    // NEW: Company Specificity (ALWAYS)
    company_specificity: {
        company_name_count: number;
        has_specific_values: boolean;
        has_location: boolean;
        has_specific_project: boolean;
        specificity_score: number; // 1-10
        specificity_note: string;
    };
    
    // NEW: Opening/Closing Tone
    tone_check: {
        opening_score: number; // 1-10
        closing_score: number; // 1-10
        is_generic_opening: boolean;
        is_overly_enthusiastic_closing: boolean;
        tone_note: string;
    };
}
```

---

### 2. Create Helper Functions

#### 2.1 Quote Detection & Scoring

```typescript
/**
 * Detects if cover letter contains a quote and evaluates its quality
 */
async function evaluateQuoteIntegration(
    coverLetter: string,
    companyValues: string[]
): Promise<QualityScores['quote_integration']> {
    // Check for quote patterns
    const quotePattern = /["„"](.{20,200})[""]|«(.{20,200})»/g;
    const matches = coverLetter.match(quotePattern);
    
    if (!matches || matches.length === 0) {
        return {
            has_quote: false,
            quote_source: null,
            quote_relevance: 0,
            quote_bridge: false,
            quote_quality_note: "No quote found (optional element)"
        };
    }
    
    // Extract quote content
    const quote = matches[0];
    
    // Check for source attribution (e.g., "Grace Hopper", "Tim O'Reilly")
    const sourcePattern = /[-–—]\s*([A-Z][a-z]+\s[A-Z][a-z']+)|von\s+([A-Z][a-z]+\s[A-Z][a-z']+)/;
    const sourceMatch = coverLetter.match(sourcePattern);
    const quoteSource = sourceMatch ? (sourceMatch[1] || sourceMatch[2]) : null;
    
    // Check for bridge phrases (connecting quote to company)
    const bridgePhrases = [
        "resoniert",
        "erinnert mich an",
        "passt zu",
        "spiegelt wider",
        "Schnittmengen",
        "Maxime",
        "Mission"
    ];
    const hasBridge = bridgePhrases.some(phrase => 
        coverLetter.toLowerCase().includes(phrase.toLowerCase())
    );
    
    // Score relevance (simple keyword matching)
    let relevanceScore = 5; // baseline
    if (quoteSource) relevanceScore += 2;
    if (hasBridge) relevanceScore += 2;
    if (companyValues.some(value => 
        coverLetter.toLowerCase().includes(value.toLowerCase())
    )) {
        relevanceScore += 1;
    }
    
    const note = quoteSource 
        ? `Quote from ${quoteSource} found. ${hasBridge ? 'Well connected to company mission.' : 'Consider stronger bridge to company values.'}`
        : 'Quote found but source not cited. Consider adding attribution.';
    
    return {
        has_quote: true,
        quote_source: quoteSource,
        quote_relevance: Math.min(relevanceScore, 10),
        quote_bridge: hasBridge,
        quote_quality_note: note
    };
}
```

---

#### 2.2 Company Specificity Check

```typescript
/**
 * Evaluates how specific the cover letter is to the target company
 */
function evaluateCompanySpecificity(
    coverLetter: string,
    companyName: string,
    companyValues: string[]
): QualityScores['company_specificity'] {
    // Count company name mentions
    const namePattern = new RegExp(companyName, 'gi');
    const nameCount = (coverLetter.match(namePattern) || []).length;
    
    // Check for specific values (not generic phrases)
    const genericPhrases = [
        "innovative kultur",
        "spannendes team",
        "tolle atmosphäre",
        "interessante projekte"
    ];
    
    const specificValues = companyValues.some(value => 
        coverLetter.toLowerCase().includes(value.toLowerCase())
    );
    
    const hasGenericOnly = genericPhrases.some(phrase => 
        coverLetter.toLowerCase().includes(phrase)
    );
    
    // Check for location mention (indicates research)
    const locationPatterns = [
        /Berlin|München|Hamburg|Köln|Frankfurt|Prenzlauer Berg|Leipziger Platz/gi,
        /Office|Standort|am\s+\w+\s+\w+\s+arbeiten/gi
    ];
    const hasLocation = locationPatterns.some(pattern => pattern.test(coverLetter));
    
    // Check for specific projects/initiatives
    const projectKeywords = [
        "initiative",
        "proptech",
        "govtech",
        "projekt",
        "programm"
    ];
    const hasSpecificProject = projectKeywords.some(keyword => 
        coverLetter.toLowerCase().includes(keyword)
    );
    
    // Calculate specificity score
    let score = 0;
    if (nameCount >= 2) score += 3;
    else if (nameCount >= 1) score += 1;
    
    if (specificValues && !hasGenericOnly) score += 3;
    if (hasLocation) score += 2;
    if (hasSpecificProject) score += 2;
    
    const issues = [];
    if (nameCount < 2) issues.push("Company name mentioned less than 2 times");
    if (hasGenericOnly) issues.push("Uses generic phrases instead of specific company values");
    if (!hasLocation) issues.push("No office location mentioned (shows lack of research)");
    
    return {
        company_name_count: nameCount,
        has_specific_values: specificValues,
        has_location: hasLocation,
        has_specific_project: hasSpecificProject,
        specificity_score: Math.min(score, 10),
        specificity_note: issues.length > 0 
            ? `Specificity issues: ${issues.join('; ')}` 
            : 'Strong company-specific content'
    };
}
```

---

#### 2.3 Opening/Closing Tone Check

```typescript
/**
 * Evaluates authenticity of opening and closing
 */
function evaluateTone(coverLetter: string): QualityScores['tone_check'] {
    // Extract first 200 chars (opening)
    const opening = coverLetter.slice(0, 200).toLowerCase();
    
    // Extract last 150 chars (closing)
    const closing = coverLetter.slice(-150).toLowerCase();
    
    // Check for generic opening
    const genericOpenings = [
        "hiermit bewerbe ich mich",
        "mit großem interesse habe ich",
        "ich bewerbe mich um",
        "auf der suche nach"
    ];
    const isGenericOpening = genericOpenings.some(phrase => opening.includes(phrase));
    
    // Check for overly enthusiastic closing
    const enthusiasticPhrases = [
        "würde mich sehr freuen!!!",
        "stehe jederzeit zur verfügung",
        "ich freue mich sehr auf ihre rückmeldung",
        "ich hoffe auf eine positive antwort"
    ];
    const isOverlyEnthusiastic = enthusiasticPhrases.some(phrase => closing.includes(phrase));
    
    // Score opening (higher = more authentic)
    let openingScore = 10;
    if (isGenericOpening) openingScore -= 5;
    if (opening.includes("zitat") || opening.includes("liebes")) openingScore = 10;
    
    // Score closing (higher = more authentic)
    let closingScore = 10;
    if (isOverlyEnthusiastic) closingScore -= 4;
    if (closing.includes("beste grüße") && !isOverlyEnthusiastic) closingScore = 10;
    
    const notes = [];
    if (isGenericOpening) notes.push("Generic opening detected");
    if (isOverlyEnthusiastic) notes.push("Closing sounds too eager/salesy");
    
    return {
        opening_score: openingScore,
        closing_score: closingScore,
        is_generic_opening: isGenericOpening,
        is_overly_enthusiastic_closing: isOverlyEnthusiastic,
        tone_note: notes.length > 0 ? notes.join('; ') : 'Authentic tone throughout'
    };
}
```

---

### 3. Update `judgeQuality()` Function

**File:** `lib/services/quality-judge.ts`

```typescript
export async function judgeQuality(
    coverLetter: string,
    userStyleExample: string,
    companyValues: string[],
    jobDescription: string,
    companyName: string // NEW parameter
): Promise<QualityScores> {
    // Existing LLM-based scoring...
    const existingScores = await complete({
        taskType: 'judge_quality',
        prompt: `...existing prompt...`,
        temperature: 0.3
    });
    
    // NEW: Additional checks
    const quoteIntegration = await evaluateQuoteIntegration(coverLetter, companyValues);
    const companySpecificity = evaluateCompanySpecificity(coverLetter, companyName, companyValues);
    const toneCheck = evaluateTone(coverLetter);
    
    // Combine scores
    return {
        ...existingScores,
        quote_integration: quoteIntegration.has_quote ? quoteIntegration : undefined,
        company_specificity: companySpecificity,
        tone_check: toneCheck
    };
}
```

---

### 4. Update Generation Loop

**File:** `lib/services/cover-letter-generator.ts`

```typescript
// In generateCoverLetterWithQuality()
const scores = await judgeQuality(
    coverLetter,
    context.styleExample,
    companyValues,
    context.job.description || "",
    context.job.company // NEW: Pass company name
);

// Add specificity feedback to iteration prompt
if (scores.company_specificity.specificity_score < 7) {
    feedbackPrompt += `\n\n**SPECIFICITY ISSUES:**\n${scores.company_specificity.specificity_note}`;
}

if (scores.tone_check.is_generic_opening) {
    feedbackPrompt += `\n**OPENING:** Avoid generic phrases like "Hiermit bewerbe ich mich". Start with quote or direct value connection.`;
}
```

---

## 📊 Updated Database Schema

**Table:** `generation_logs`

```sql
ALTER TABLE generation_logs ADD COLUMN IF NOT EXISTS quote_integration JSONB;
ALTER TABLE generation_logs ADD COLUMN IF NOT EXISTS company_specificity JSONB;
ALTER TABLE generation_logs ADD COLUMN IF NOT EXISTS tone_check JSONB;
```

---

## ✅ Success Criteria

**After implementation:**
1. Quote-aware scoring (optional element, but evaluated if present)
2. Company specificity always checked (min. 2 name mentions, specific values)
3. Tone authenticity evaluated (no generic openings/closings)
4. All new scores logged to `generation_logs`
5. Iteration loop uses new feedback for improvement

---

## 🚀 Integration Timeline

**Phase 2 Addition:**
- This directive extends the existing Quality Judge
- Integrates seamlessly with iteration loop
- No breaking changes to existing API

**Time Estimate:** 2-3 hours

---

## 📝 Notes

- Quote check is **optional** (User can choose to use or not use quotes)
- Company specificity is **mandatory** (generic letters fail this check)
- Tone check prevents bot-like language patterns
- All checks are rule-based (no additional LLM calls except for initial judge)
