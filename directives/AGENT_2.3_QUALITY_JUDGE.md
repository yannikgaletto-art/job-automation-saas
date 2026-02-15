# 🤖 AGENT PROMPT: PHASE 2.3 - QUALITY JUDGE LOOP

## MISSION
Implement an iterative quality improvement system for cover letters using a Judge-Generator loop (max 3 iterations) to achieve 8/10+ quality scores.

## PREREQUISITES - READ FIRST! 🚨
**Before starting ANY work, you MUST read these documents:**

1. **`docs/ARCHITECTURE.md`** (Lines 498-642)
   - Study "STEP 7: Cover Letter Generation (3-Stage)" implementation
   - Understand the Judge-Generator feedback loop
   - Review quality scoring criteria (naturalness, style, relevance, individuality)

2. **`docs/DESIGN_SYSTEM.md`** (Lines 1-200)
   - Follow Notion-like aesthetic
   - Use clean forms and feedback displays
   - Maintain consistency

3. **`CLAUDE.md`**
   - **CRITICAL**: "Reduce Complexity!" - Keep iterations to MAX 3
   - "Single generation (no QA loop)" was Phase 1 → Now implement for Phase 2
   - Follow lean approach

4. **`directives/cover_letter_generation.md`**
   - Read existing cover letter generation logic
   - Understand writing style rules
   - Review forbidden phrases

## CURRENT STATE
- ✅ Basic cover letter generation exists (`lib/services/cover-letter-generator.ts`)
- ✅ Company research data available
- ✅ Writing style embeddings stored
- ⚠️ No quality checking (single-shot generation)
- ⚠️ No iterative improvement

## YOUR TASK

### 2.3.1: Quality Judge Service
**Goal:** Create a judge that scores cover letters on 4 dimensions (0-10 each).

**Implementation:**
1. Create `lib/services/quality-judge.ts`:
   ```typescript
   import Anthropic from "@anthropic-ai/sdk"
   
   export interface QualityScores {
     naturalness_score: number          // 0-10: No AI language, varied sentences
     style_match_score: number          // 0-10: Matches reference style
     company_relevance_score: number    // 0-10: Relevant and subtle
     individuality_score: number        // 0-10: Concrete, not generic
     overall_score: number              // Average of above
     issues: string[]                   // What's wrong?
     suggestions: string[]              // How to improve?
   }
   
   export async function judgeQuality(
     coverLetter: string,
     referenceStyle: string,
     companyValues: string[],
     jobDescription: string
   ): Promise<QualityScores> {
     
     const anthropic = new Anthropic({
       apiKey: process.env.ANTHROPIC_API_KEY
     })
     
     const judgment = await anthropic.messages.create({
       model: "claude-haiku-4",  // Fast and cheap for judging
       max_tokens: 1500,
       messages: [{
         role: "user",
         content: `You are a strict quality judge for cover letters.
         
         **COVER LETTER TO JUDGE:**
         ${cover Letter}
         
         **REFERENCE STYLE (the goal):**
         ${referenceStyle}
         
         **COMPANY VALUES:**
         ${companyValues.join(", ")}
         
         **JOB DESCRIPTION:**
         ${jobDescription}
         
         **EVALUATE (score 1-10 for each):**
         
         1. Naturalness (no AI language):
            - At least 3 sentences start with conjunctions? (Daher, Deshalb, Gleichzeitig)
            - Sentence length varies? (15-25 words avg, some shorter)
            - No clichés? ("freue mich auf", "hiermit bewerbe ich mich", etc.)
            - Sounds human, not robot?
         
         2. Style Congruence (matches reference):
            - Tone matches reference?
            - User's voice recognizable?
            - Paragraph structure followed?
            - Conjunctions used like in reference?
         
         3. Company Relevance (relevant but subtle):
            - Values mentioned naturally?
            - News/research integrated (if fitting)?
            - Not generic (could apply to any company)?
            - Specific to this company?
         
         4. Individuality (unique to user):
            - Concrete examples from user's CV?
            - Not interchangeable with another candidate?
            - Personal achievements mentioned?
            - Quantified results included?
         
         **OUTPUT FORMAT (JSON ONLY):**
         {
           "naturalness_score": 8,
           "style_match_score": 7,
           "company_relevance_score": 9,
           "individuality_score": 8,
           "overall_score": 8,
           "issues": [
             "Only 1 sentence starts with conjunction (need 3+)",
             "Phrase 'freue mich auf' sounds standard"
           ],
           "suggestions": [
             "Start more sentences with Daher/Deshalb",
             "Replace 'freue mich auf' with more personal closing"
           ]
         }
         `
       }]
     })
     
     // Parse JSON response
     const content = judgment.content[0].text
     const scores = JSON.parse(content)
     
     return scores
   }
   ```

### 2.3.2: Iterative Generator Loop
**Goal:** Improve cover letter quality through feedback iterations (max 3).

**Implementation:**
1. Update `lib/services/cover-letter-generator.ts`:
   ```typescript
   import { judgeQuality, QualityScores } from "./quality-judge"
   
   const MAX_ITERATIONS = 3
   const TARGET_SCORE = 8  // Out of 10
   
   export async function generateCoverLetterWithQuality(
     jobId: string,
     userId: string
   ): Promise<{
     coverLetter: string
     finalScores: QualityScores
     iterations: number
     iterationLog: Array<{
       iteration: number
       scores: QualityScores
       letterVersion: string
     }>
   }> {
     
     // Fetch data (job, company, user profile)
     const { job, company, userProfile } = await fetchData(jobId, userId)
     
     let coverLetter = ""
     let scores: QualityScores | null = null
     let iterationLog: any[] = []
     
     for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
       
       // STAGE 1: Generate (or regenerate with feedback)
       const feedbackPrompt = iteration > 0 ? `
       
       **PREVIOUS ATTEMPT HAD THESE ISSUES:**
       ${scores!.issues.join("\n")}
       
       **IMPROVE BY:**
       ${scores!.suggestions.join("\n")}
       
       Fix these issues in the new version.
       ` : ""
       
       coverLetter = await generateCoverLetter({
         ...job,
         ...company,
         ...userProfile,
         additionalInstructions: feedbackPrompt
       })
       
       // STAGE 2: Judge
       scores = await judgeQuality(
         coverLetter,
         userProfile.referenceStyle,
         company.core_values,
         job.description
       )
       
       // Log iteration
       iterationLog.push({
         iteration: iteration + 1,
         scores,
         letterVersion: coverLetter
       })
       
       // Save iteration log to database
       await supabase.from("generation_logs").insert({
         job_id: jobId,
         user_id: userId,
         iteration: iteration + 1,
         scores: scores,
         cover_letter_version: coverLetter
       })
       
       // Check if passed
       if (scores.overall_score >= TARGET_SCORE) {
         console.log(`✅ Quality target reached in ${iteration + 1} iteration(s)`)
         break
       }
       
       // If last iteration and still not passing, use best attempt
       if (iteration === MAX_ITERATIONS - 1) {
         console.warn(`⚠️ Max iterations reached. Best score: ${scores.overall_score}`)
         // Optionally: Pick the best version from iterationLog
         const bestAttempt = iterationLog.reduce((best, current) => 
           current.scores.overall_score > best.scores.overall_score ? current : best
         )
         coverLetter = bestAttempt.letterVersion
         scores = bestAttempt.scores
       }
     }
     
     return {
       coverLetter,
       finalScores: scores!,
       iterations: iterationLog.length,
       iterationLog
     }
   }
   ```

### 2.3.3: Quality Feedback UI
**Goal:** Show users the quality scores and iteration progress.

**Implementation:**
1. Create `components/cover-letter/quality-feedback.tsx`:
   ```tsx
   "use client"
   
   import { QualityScores } from "@/lib/services/quality-judge"
   
   interface QualityFeedbackProps {
     scores: QualityScores
     iterations: number
     showDetails?: boolean
   }
   
   export function QualityFeedback({
     scores,
     iterations,
     showDetails = false
   }: QualityFeedbackProps) {
     
     const getScoreColor = (score: number) => {
       if (score >= 8) return "text-green-600 bg-green-100"
       if (score >= 6) return "text-orange-600 bg-orange-100"
       return "text-red-600 bg-red-100"
     }
     
     return (
       <div className="bg-white rounded-lg p-6 shadow-sm border border-[#E7E7E5]">
         {/* Header */}
         <div className="flex items-center justify-between mb-4">
           <h3 className="text-lg font-semibold text-[#37352F]">
             ✨ Quality Check Results
           </h3>
           <span className="text-xs text-[#73726E]">
             {iterations} iteration{iterations > 1 ? "s" : ""}
           </span>
         </div>
         
         {/* Overall Score (Big) */}
         <div className="text-center mb-6 p-6 bg-[#F7F7F5] rounded-lg">
           <div className={`text-5xl font-bold ${getScoreColor(scores.overall_score)}`}>
             {scores.overall_score}/10
           </div>
           <p className="text-sm text-[#73726E] mt-2">
             {scores.overall_score >= 8 ? "✅ Excellent Quality" :
              scores.overall_score >= 6 ? "⚠️ Good, Could Improve" :
              "❌ Needs Work"}
           </p>
         </div>
         
         {/* Detailed Scores */}
         <div className="grid grid-cols-2 gap-4 mb-6">
           <ScoreCard
             label="Naturalness"
             score={scores.naturalness_score}
             icon="🗣️"
           />
           <ScoreCard
             label="Style Match"
             score={scores.style_match_score}
             icon="✍️"
           />
           <ScoreCard
             label="Relevance"
             score={scores.company_relevance_score}
             icon="🎯"
           />
           <ScoreCard
             label="Individuality"
             score={scores.individuality_score}
             icon="⭐"
           />
         </div>
         
         {/* Issues & Suggestions (Collapsible) */}
         {showDetails && (
           <div className="space-y-4">
             {scores.issues.length > 0 && (
               <div className="p-4 bg-red-50 rounded-md">
                 <p className="text-sm font-medium text-red-800 mb-2">
                   ⚠️ Issues Found:
                 </p>
                 <ul className="text-xs text-red-700 space-y-1">
                   {scores.issues.map((issue, idx) => (
                     <li key={idx}>• {issue}</li>
                   ))}
                 </ul>
               </div>
             )}
             
             {scores.suggestions.length > 0 && (
               <div className="p-4 bg-blue-50 rounded-md">
                 <p className="text-sm font-medium text-blue-800 mb-2">
                   💡 Suggestions:
                 </p>
                 <ul className="text-xs text-blue-700 space-y-1">
                   {scores.suggestions.map((suggestion, idx) => (
                     <li key={idx}>• {suggestion}</li>
                   ))}
                 </ul>
               </div>
             )}
           </div>
         )}
       </div>
     )
   }
   
   function ScoreCard({ label, score, icon }: {
     label: string
     score: number
     icon: string
   }) {
     const getColor = (s: number) => {
       if (s >= 8) return "bg-green-100 text-green-700"
       if (s >= 6) return "bg-orange-100 text-orange-700"
       return "bg-red-100 text-red-700"
     }
     
     return (
       <div className="p-3 border border-[#E7E7E5] rounded-md">
         <div className="flex items-center gap-2 mb-1">
           <span>{icon}</span>
           <span className="text-xs text-[#73726E]">{label}</span>
         </div>
         <div className={`text-2xl font-bold ${getColor(score)}`}>
           {score}/10
         </div>
       </div>
     )
   }
   ```

### 2.3.4: Update API Route
**Goal:** Use the new quality loop in cover letter generation API.

**Implementation:**
1. Update `app/api/cover-letter/generate/route.ts`:
   ```typescript
   import { generateCoverLetterWithQuality } from "@/lib/services/cover-letter-generator"
   
   export async function POST(req: NextRequest) {
     const { jobId, userId } = await req.json()
     
     try {
       // Use quality loop (max 3 iterations)
       const result = await generateCoverLetterWithQuality(jobId, userId)
       
       return NextResponse.json({
         success: true,
         cover_letter: result.coverLetter,
         quality_scores: result.finalScores,
         iterations: result.iterations
       })
       
     } catch (error) {
       console.error("Cover letter generation failed:", error)
       return NextResponse.json(
         { error: "Generation failed" },
         { status: 500 }
       )
     }
   }
   ```

## VERIFICATION CHECKLIST

- [ ] `lib/services/quality-judge.ts` created with Claude Haiku 4
- [ ] Judge scores on 4 dimensions (naturalness, style, relevance, individuality)
- [ ] `lib/services/cover-letter-generator.ts` updated with iteration loop
- [ ] Max 3 iterations enforced
- [ ] Target score is 8/10
- [ ] `components/cover-letter/quality-feedback.tsx` shows scores
- [ ] API route uses quality loop
- [ ] `generation_logs` table stores iteration history
- [ ] Browser test: Generate cover letter, see quality scores
- [ ] Browser test: Verify 2-3 iterations happen if needed

## SUCCESS CRITERIA
✅ Judge scores cover letters consistently
✅ Iterative improvement works (score increases)
✅ Max 3 iterations enforced
✅ Target score 8/10 reached in 80%+ of cases
✅ Quality feedback UI shows scores and issues
✅ Iteration logs stored in database
✅ No breaking changes to existing flow

## EXECUTION ORDER
1. Read all prerequisite documents
2. Create `quality-judge.ts` service
3. Update `cover-letter-generator.ts` with loop
4. Create `quality-feedback.tsx` component
5. Update API route
6. Test with sample job
7. Create walkthrough.md with screenshots

## IMPORTANT NOTES
- **Max 3 iterations!** Don't loop forever
- Use Haiku 4 for judging (fast + cheap)
- Use Sonnet 4.5 for generation (quality)
- Store all iterations in `generation_logs`
- Test with real cover letters and reference styles
- If score doesn't reach 8, use best attempt
