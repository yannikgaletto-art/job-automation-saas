# AGENT_5.3: Cover Letter Validation (Hard Checks)

## 🎯 Goal
Implementiere **Hard Validation Layer** für generierte Cover Letters BEVOR sie zum Quality Judge gehen.
Diese regelbasierten Checks sind **schnell, billig und objektiv** – im Gegensatz zum LLM-basierten Quality Judge.

**Warum wichtig:**
- Verhindert offensichtliche Fehler (zu kurz, Firma fehlt, Bot-Phrasen)
- Spart API-Kosten (kein Judge-Call bei invaliden Texten)
- Gibt der Iteration Loop klare Feedback-Punkte

---

## 📋 Scope: MVP-LEAN (1.5 Stunden)

### Was wird gebaut:
1. **Validator Service** (`lib/services/cover-letter-validator.ts`)
2. **4 Hard Checks:**
   - Word Count (200-400 Range)
   - Company Name Mention (min. 1x)
   - Forbidden Phrases (Top 5 Bot-Phrases)
   - Basic Structure Check (min. 2 paragraphs)
3. **Integration in Generator** (vor Quality Judge)
4. **Validation Logs** (für Monitoring)

### Was NICHT gebaut wird (Phase 2):
- Generic Phrase Detection (zu subjektiv)
- Grammer/Spelling Check (wird später separat gemacht)
- Link Validation (nicht Teil von MVP)
- Style Consistency Check (das macht der Judge)

---

## 🛠️ Implementation Tasks

### 1. Create Validator Service

**File:** `lib/services/cover-letter-validator.ts`

```typescript
export interface ValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
    stats: {
        wordCount: number;
        paragraphCount: number;
        companyMentions: number;
        forbiddenPhraseCount: number;
    };
}

/**
 * Hard validation checks BEFORE Quality Judge
 */
export function validateCoverLetter(
    coverLetter: string,
    companyName: string
): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // 1. WORD COUNT CHECK
    const words = coverLetter.trim().split(/\s+/);
    const wordCount = words.length;
    
    if (wordCount < 200) {
        errors.push(`Word count too low: ${wordCount} words (minimum: 200)`);
    } else if (wordCount > 400) {
        errors.push(`Word count too high: ${wordCount} words (maximum: 400)`);
    } else if (wordCount < 250 || wordCount > 350) {
        warnings.push(`Word count outside ideal range: ${wordCount} words (ideal: 250-350)`);
    }
    
    // 2. COMPANY NAME CHECK
    const companyPattern = new RegExp(companyName, 'gi');
    const companyMentions = (coverLetter.match(companyPattern) || []).length;
    
    if (companyMentions === 0) {
        errors.push(`Company name "${companyName}" not mentioned at all`);
    } else if (companyMentions === 1) {
        warnings.push(`Company name only mentioned once (recommend: 2-3 times)`);
    }
    
    // 3. FORBIDDEN PHRASES CHECK
    const forbiddenPhrases = [
        {
            phrase: "auf LinkedIn gefunden",
            reason: "Reveals scraping source (unprofessional)"
        },
        {
            phrase: "laut meiner Recherche",
            reason: "Sounds robotic/AI-generated"
        },
        {
            phrase: "wie ich bei Google sah",
            reason: "Reveals research method (unprofessional)"
        },
        {
            phrase: "durch künstliche Intelligenz",
            reason: "Never mention AI usage"
        },
        {
            phrase: "meine Analyse ergab",
            reason: "Too formal/robotic tone"
        }
    ];
    
    let forbiddenCount = 0;
    forbiddenPhrases.forEach(({ phrase, reason }) => {
        if (coverLetter.toLowerCase().includes(phrase.toLowerCase())) {
            errors.push(`Forbidden phrase detected: "${phrase}" - ${reason}`);
            forbiddenCount++;
        }
    });
    
    // 4. BASIC STRUCTURE CHECK
    const paragraphs = coverLetter.split(/\n\n+/).filter(p => p.trim().length > 0);
    const paragraphCount = paragraphs.length;
    
    if (paragraphCount < 2) {
        errors.push(`Too few paragraphs: ${paragraphCount} (minimum: 2)`);
    } else if (paragraphCount > 5) {
        warnings.push(`Many paragraphs: ${paragraphCount} (ideal: 3-4)`);
    }
    
    // Check for extremely short paragraphs
    const shortParagraphs = paragraphs.filter(p => p.split(/\s+/).length < 20);
    if (shortParagraphs.length > 1) {
        warnings.push(`${shortParagraphs.length} paragraphs are very short (< 20 words)`);
    }
    
    return {
        isValid: errors.length === 0,
        errors,
        warnings,
        stats: {
            wordCount,
            paragraphCount,
            companyMentions,
            forbiddenPhraseCount: forbiddenCount
        }
    };
}
```

---

### 2. Add Validation Logging

**File:** `lib/services/cover-letter-validator.ts`

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Log validation results for monitoring
 */
export async function logValidation(
    jobId: string,
    userId: string,
    iteration: number,
    validation: ValidationResult
) {
    try {
        await supabase.from('validation_logs').insert({
            job_id: jobId,
            user_id: userId,
            iteration,
            is_valid: validation.isValid,
            errors: validation.errors,
            warnings: validation.warnings,
            word_count: validation.stats.wordCount,
            paragraph_count: validation.stats.paragraphCount,
            company_mentions: validation.stats.companyMentions,
            forbidden_phrase_count: validation.stats.forbiddenPhraseCount
        });
    } catch (e) {
        console.error('Failed to log validation:', e);
    }
}
```

---

### 3. Create Validation Logs Table

**File:** `database/migrations/005_validation_logs.sql`

```sql
CREATE TABLE IF NOT EXISTS validation_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES job_queue(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    iteration INTEGER NOT NULL,
    is_valid BOOLEAN NOT NULL,
    errors TEXT[],
    warnings TEXT[],
    word_count INTEGER,
    paragraph_count INTEGER,
    company_mentions INTEGER,
    forbidden_phrase_count INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_validation_logs_job ON validation_logs(job_id);
CREATE INDEX idx_validation_logs_user ON validation_logs(user_id);
```

---

### 4. Integrate in Generator Loop

**File:** `lib/services/cover-letter-generator.ts`

```typescript
import { validateCoverLetter, logValidation } from './cover-letter-validator';

/**
 * Iterative generation with Validation + Quality Judge Loop
 */
export async function generateCoverLetterWithQuality(
    jobId: string,
    userId: string
): Promise<{
    coverLetter: string;
    finalScores: QualityScores;
    iterations: number;
    iterationLog: Array<{
        iteration: number;
        validation: ValidationResult;
        scores: QualityScores;
        letterVersion: string;
    }>;
}> {
    const MAX_ITERATIONS = 3;
    const TARGET_SCORE = 8;

    const context = await fetchGenerationContext(userId, jobId);

    let coverLetter = "";
    let scores: QualityScores | null = null;
    let validation: ValidationResult | null = null;
    let iterationLog: any[] = [];

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
        // STAGE 1: Build feedback prompt
        let feedbackPrompt = "";
        
        // Add validation feedback from previous iteration
        if (iteration > 0 && validation && !validation.isValid) {
            feedbackPrompt += `\n\n**VALIDATION ERRORS (kritisch!):**\n${validation.errors.join('\n')}`;
        }
        
        // Add quality feedback from previous iteration
        if (iteration > 0 && scores) {
            feedbackPrompt += `\n\n**QUALITY ISSUES:**\n${scores.issues.slice(0, 3).join('\n')}`;
            feedbackPrompt += `\n\n**SUGGESTIONS:**\n${scores.suggestions.slice(0, 3).join('\n')}`;
        }

        // STAGE 2: Generate
        const result = await generateCoverLetterCore(context, feedbackPrompt);
        coverLetter = result.text;

        // STAGE 3: VALIDATE (before expensive Judge call)
        validation = validateCoverLetter(coverLetter, context.job.company);
        
        // Log validation
        await logValidation(jobId, userId, iteration + 1, validation);
        
        console.log(`✅ Validation ${iteration + 1}: ${validation.isValid ? 'PASSED' : 'FAILED'} (${validation.errors.length} errors, ${validation.warnings.length} warnings)`);

        // STAGE 4: JUDGE (only if validation passed)
        if (validation.isValid) {
            const companyValues = context.job.company_research?.company_values || [];
            scores = await judgeQuality(
                coverLetter,
                context.styleExample,
                companyValues,
                context.job.description || ""
            );

            console.log(`📊 Iteration ${iteration + 1}: Quality Score ${scores.overall_score}/10`);
        } else {
            // Skip judge call if validation failed
            scores = {
                overall_score: 0,
                naturalness_score: 0,
                style_match_score: 0,
                company_relevance_score: 0,
                individuality_score: 0,
                issues: ["Validation failed"],
                suggestions: ["Fix validation errors first"]
            };
            
            console.log(`❌ Iteration ${iteration + 1}: Validation failed, skipping quality check`);
        }

        // STAGE 5: Log iteration
        iterationLog.push({
            iteration: iteration + 1,
            validation: validation,
            scores: scores,
            letterVersion: coverLetter
        });

        // STAGE 6: Check success condition
        if (validation.isValid && scores.overall_score >= TARGET_SCORE) {
            console.log(`✅ Quality target reached!`);
            break;
        }

        // STAGE 7: Pick best if max iterations reached
        if (iteration === MAX_ITERATIONS - 1) {
            console.warn(`⚠️ Max iterations reached. Picking best version.`);
            
            // Pick best valid version (or best score if no valid version)
            const validAttempts = iterationLog.filter(log => log.validation.isValid);
            
            if (validAttempts.length > 0) {
                const bestAttempt = validAttempts.reduce((best, current) =>
                    current.scores.overall_score > best.scores.overall_score ? current : best
                );
                coverLetter = bestAttempt.letterVersion;
                scores = bestAttempt.scores;
                validation = bestAttempt.validation;
            } else {
                // No valid version found - return last attempt
                console.error("❌ No valid cover letter generated after 3 iterations!");
            }
        }
    }

    return {
        coverLetter,
        finalScores: scores!,
        iterations: iterationLog.length,
        iterationLog
    };
}
```

---

## 📋 API Route Updates

**File:** `app/api/cover-letter/generate/route.ts`

No changes needed – validation is integrated in the service layer.

But we should expose validation stats in the response:

```typescript
export async function POST(req: Request) {
    // ... existing code ...
    
    const result = await generateCoverLetterWithQuality(jobId, userId);
    
    // Get final validation
    const finalValidation = validateCoverLetter(
        result.coverLetter, 
        job.company
    );
    
    return NextResponse.json({
        coverLetter: result.coverLetter,
        qualityScores: result.finalScores,
        validation: finalValidation, // NEW: Expose validation to frontend
        iterations: result.iterations,
        model: 'claude-sonnet-4.5'
    });
}
```

---

## 🎨 Frontend Integration (Optional Display)

**File:** `components/cover-letter/quality-feedback.tsx`

```typescript
import { ValidationResult } from '@/lib/services/cover-letter-validator';

interface QualityFeedbackProps {
    validation: ValidationResult;
    scores: QualityScores;
}

export function QualityFeedback({ validation, scores }: QualityFeedbackProps) {
    return (
        <div className="space-y-4">
            {/* Validation Status */}
            <div className="flex items-center gap-2">
                {validation.isValid ? (
                    <Badge variant="success">Validation Passed</Badge>
                ) : (
                    <Badge variant="destructive">Validation Failed</Badge>
                )}
                <span className="text-sm text-muted-foreground">
                    {validation.stats.wordCount} words | {validation.stats.companyMentions}x company mention
                </span>
            </div>
            
            {/* Validation Errors */}
            {validation.errors.length > 0 && (
                <Alert variant="destructive">
                    <AlertTitle>Validation Errors</AlertTitle>
                    <AlertDescription>
                        <ul className="list-disc pl-4 space-y-1">
                            {validation.errors.map((error, i) => (
                                <li key={i} className="text-sm">{error}</li>
                            ))}
                        </ul>
                    </AlertDescription>
                </Alert>
            )}
            
            {/* Validation Warnings */}
            {validation.warnings.length > 0 && (
                <Alert variant="warning">
                    <AlertTitle>Suggestions</AlertTitle>
                    <AlertDescription>
                        <ul className="list-disc pl-4 space-y-1">
                            {validation.warnings.map((warning, i) => (
                                <li key={i} className="text-sm">{warning}</li>
                            ))}
                        </ul>
                    </AlertDescription>
                </Alert>
            )}
            
            {/* Quality Scores (existing) */}
            <div className="grid grid-cols-4 gap-4">
                <ScoreCard label="Overall" score={scores.overall_score} />
                <ScoreCard label="Naturalness" score={scores.naturalness_score} />
                <ScoreCard label="Style Match" score={scores.style_match_score} />
                <ScoreCard label="Relevance" score={scores.company_relevance_score} />
            </div>
        </div>
    );
}
```

---

## ✅ Success Criteria

**After implementation:**
1. All generated cover letters pass validation checks BEFORE Quality Judge
2. Word count is always 200-400 words
3. Company name is mentioned at least once
4. No forbidden phrases (LinkedIn, "meine Recherche", etc.)
5. Validation logs are stored for monitoring
6. Validation stats exposed via API
7. Iteration loop uses validation feedback for improvement

---

## 📊 Monitoring Dashboard (Phase 2)

**Future addition:** Admin dashboard showing:
- Validation pass rate (% valid on first try)
- Most common validation errors
- Average iterations needed
- Word count distribution

---

## 📝 Notes

- Validation is **cheap** (no API calls)
- Validation is **fast** (regex checks only)
- Validation is **objective** (no LLM subjectivity)
- Validation runs BEFORE Quality Judge (saves costs)
- Validation failures trigger immediate re-generation (no wasted judge calls)

**Time Estimate:** 1.5 hours

---

## 🚀 Next Steps

After AGENT_5.3 is implemented:
1. Test with real job data
2. Monitor validation pass rate
3. Adjust forbidden phrases list based on real failures
4. Consider adding AGENT_2.5 (Quote-Aware Judge) for Phase 2
