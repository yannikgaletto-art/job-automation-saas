# 🤖 AGENT PROMPT: PHASE 2.2 - CV OPTIMIZATION ENGINE

## MISSION
Implement intelligent CV optimization that tailors the user's CV to match job requirements WITHOUT hallucinating or adding fake information.

## PREREQUISITES - READ FIRST! 🚨
**Before starting ANY work, you MUST read these documents:**

1. **`docs/ARCHITECTURE.md`** (Lines 335-362)
   - Study "STEP 5: CV Optimization" implementation
   - Understand the rules: NO hallucinations, truthful facts only
   - Review how bullet points are reordered and keywords added

2. **`docs/DESIGN_SYSTEM.md`** (Lines 1-250)
   - Follow Notion-like aesthetic for CV preview
   - Use clean typography and spacing
   - Match existing components (Input, Label, Button)

3. **`CLAUDE.md`**
   - **CRITICAL**: "Reduce Complexity!" - Keep it simple
   - "Use master CV (no optimization)" was Phase 1 → Now implement optimization for Phase 2
   - Follow lean MVP approach

4. **`database/schema.sql`**
   - Review `documents` table for CV storage
   - Understand `metadata` field structure (skills, experience)

## CURRENT STATE
- ✅ CV text extracted and stored in `documents` table
- ✅ PII encrypted in `user_profiles.pii_encrypted`
- ✅ Metadata extracted (skills, years_experience)
- ⚠️ Currently using "master CV" (no optimization)
- ⚠️ No ATS keyword matching

## YOUR TASK

### 2.2.1: CV Optimization Service
**Goal:** Create a service that optimizes CV content for specific job descriptions.

**Implementation:**
1. Create `lib/services/cv-optimizer.ts`:
   ```typescript
   import Anthropic from "@anthropic-ai/sdk"
   
   export interface CVOptimizationRequest {
     cvText: string
     jobTitle: string
     jobRequirements: string[]
     jobDescription: string
   }
   
   export interface CVOptimizationResult {
     optimizedCV: string
     changesLog: {
       added_keywords: string[]
       reordered_bullets: number
       quantifications_added: number
     }
     atsScore: number  // 0-100
   }
   
   export async function optimizeCV(
     request: CVOptimizationRequest
   ): Promise<CVOptimizationResult> {
     
     const anthropic = new Anthropic({
       apiKey: process.env.ANTHROPIC_API_KEY
     })
     
     const optimization = await anthropic.messages.create({
       model: "claude-sonnet-4.5",
       max_tokens: 4000,
       messages: [{
         role: "user",
         content: `You are a professional CV optimizer. Your task is to optimize this CV for the given job.
         
         **CRITICAL RULES:**
         1. ✅ KEEP ALL FACTS TRUTHFUL - NO hallucinations
         2. ✅ Reorder bullet points (most relevant first)
         3. ✅ Add missing keywords from job description (if truthful)
         4. ✅ Quantify achievements where possible (if data exists)
         5. ✅ Keep total length under 2 pages
         6. ❌ NEVER invent experience, projects, or skills
         7. ❌ NEVER change dates or company names
         8. ❌ NEVER add achievements that didn't happen
         
         **ORIGINAL CV:**
         ${request.cvText}
         
         **JOB TITLE:**
         ${request.jobTitle}
         
         **JOB REQUIREMENTS:**
         ${request.jobRequirements.join("\n")}
         
         **JOB DESCRIPTION:**
         ${request.jobDescription}
         
         **YOUR TASK:**
         - Analyze which experiences/skills are most relevant
         - Reorder bullet points (relevant first)
         - Highlight matching keywords (bold in Markdown)
         - Add section headers if missing
         - Ensure ATS-friendly format
         
         **OUTPUT FORMAT:**
         Return optimized CV in Markdown format.
         Then on separate lines:
         ADDED_KEYWORDS: comma-separated list
         REORDERED_BULLETS: count
         QUANTIFICATIONS: count
         ATS_SCORE: 0-100
         `
       }]
     })
     
     // Parse response
     const content = optimization.content[0].text
     const [cvMarkdown, ...metadata] = content.split("\n\n")
     
     // Extract metadata
     const addedKeywords = extractMetadata(metadata, "ADDED_KEYWORDS")
     const reorderedBullets = parseInt(extractMetadata(metadata, "REORDERED_BULLETS"))
     const quantifications = parseInt(extractMetadata(metadata, "QUANTIFICATIONS"))
     const atsScore = parseInt(extractMetadata(metadata, "ATS_SCORE"))
     
     return {
       optimizedCV: cvMarkdown,
       changesLog: {
         added_keywords: addedKeywords.split(", "),
         reordered_bullets: reorderedBullets,
         quantifications_added: quantifications
       },
       atsScore
     }
   }
   
   function extractMetadata(lines: string[], key: string): string {
     const line = lines.find(l => l.startsWith(key + ":"))
     return line ? line.split(": ")[1].trim() : ""
   }
   ```

### 2.2.2: Before/After Comparison UI
**Goal:** Show users what changed in their CV with diff highlighting.

**Implementation:**
1. Create `components/cv/cv-comparison.tsx`:
   ```tsx
   "use client"
   
   import { useState } from "react"
   import { Button } from "@/components/ui/button"
   
   interface CVComparisonProps {
     originalCV: string
     optimizedCV: string
     changesLog: {
       added_keywords: string[]
       reordered_bullets: number
       quantifications_added: number
     }
     atsScore: number
     onAccept: () => void
     onRevert: () => void
   }
   
   export function CVComparison({
     originalCV,
     optimizedCV,
     changesLog,
     atsScore,
     onAccept,
     onRevert
   }: CVComparisonProps) {
     const [view, setView] = useState<"split" | "optimized">("split")
     
     return (
       <div className="bg-white rounded-lg p-6 shadow-sm border border-[#E7E7E5]">
         {/* Header */}
         <div className="flex items-center justify-between mb-6">
           <div>
             <h3 className="text-lg font-semibold text-[#37352F]">
               CV Optimization Results
             </h3>
             <p className="text-sm text-[#73726E] mt-1">
               Your CV has been tailored for this job
             </p>
           </div>
           
           {/* ATS Score Badge */}
           <div className="text-center">
             <div className={`text-3xl font-bold ${
               atsScore >= 80 ? "text-green-600" :
               atsScore >= 60 ? "text-orange-600" :
               "text-red-600"
             }`}>
               {atsScore}%
             </div>
             <p className="text-xs text-[#73726E]">ATS Score</p>
           </div>
         </div>
         
         {/* Changes Summary */}
         <div className="grid grid-cols-3 gap-4 mb-6 p-4 bg-[#F7F7F5] rounded-md">
           <div>
             <p className="text-xs text-[#73726E]">Keywords Added</p>
             <p className="text-lg font-semibold text-[#37352F]">
               {changesLog.added_keywords.length}
             </p>
           </div>
           <div>
             <p className="text-xs text-[#73726E]">Bullets Reordered</p>
             <p className="text-lg font-semibold text-[#37352F]">
               {changesLog.reordered_bullets}
             </p>
           </div>
           <div>
             <p className="text-xs text-[#73726E]">Quantifications</p>
             <p className="text-lg font-semibold text-[#37352F]">
               {changesLog.quantifications_added}
             </p>
           </div>
         </div>
         
         {/* View Toggle */}
         <div className="flex gap-2 mb-4">
           <Button
             variant={view === "split" ? "default" : "outline"}
             size="sm"
             onClick={() => setView("split")}
           >
             Side-by-Side
           </Button>
           <Button
             variant={view === "optimized" ? "default" : "outline"}
             size="sm"
             onClick={() => setView("optimized")}
           >
             Optimized Only
           </Button>
         </div>
         
         {/* CV Preview */}
         <div className={`grid ${view === "split" ? "grid-cols-2" : "grid-cols-1"} gap-4 mb-6`}>
           {view === "split" && (
             <div className="border border-[#E7E7E5] rounded-md p-4 max-h-[500px] overflow-y-auto">
               <p className="text-xs text-[#73726E] mb-2">Original</p>
               <div className="prose prose-sm text-[#37352F]">
                 {originalCV}
               </div>
             </div>
           )}
           <div className="border border-[#E7E7E5] rounded-md p-4 max-h-[500px] overflow-y-auto">
             <p className="text-xs text-[#73726E] mb-2">Optimized</p>
             <div 
               className="prose prose-sm text-[#37352F]"
               dangerouslySetInnerHTML={{ __html: markdownToHTML(optimizedCV) }}
             />
           </div>
         </div>
         
         {/* Added Keywords */}
         {changesLog.added_keywords.length > 0 && (
           <div className="mb-6">
             <p className="text-sm font-medium text-[#37352F] mb-2">
               ✨ Keywords Added:
             </p>
             <div className="flex flex-wrap gap-2">
               {changesLog.added_keywords.map((keyword, idx) => (
                 <span 
                   key={idx}
                   className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded"
                 >
                   {keyword}
                 </span>
               ))}
             </div>
           </div>
         )}
         
         {/* Actions */}
         <div className="flex gap-3">
           <Button onClick={onAccept} className="flex-1">
             ✅ Use Optimized CV
           </Button>
           <Button onClick={onRevert} variant="outline">
             ↩️ Keep Original
           </Button>
         </div>
       </div>
     )
   }
   
   function markdownToHTML(markdown: string): string {
     // Simple markdown conversion (or use a library like marked)
     return markdown
       .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
       .replace(/\n/g, "<br/>")
   }
   ```

### 2.2.3: API Route Integration
**Goal:** Create API endpoint to trigger CV optimization.

**Implementation:**
1. Create `app/api/cv/optimize/route.ts`:
   ```typescript
   import { NextRequest, NextResponse } from "next/server"
   import { optimizeCV } from "@/lib/services/cv-optimizer"
   import { createClient } from "@supabase/supabase-js"
   
   const supabase = createClient(
     process.env.NEXT_PUBLIC_SUPABASE_URL!,
     process.env.SUPABASE_SERVICE_ROLE_KEY!
   )
   
   export async function POST(req: NextRequest) {
     try {
       const { userId, jobId } = await req.json()
       
       // Fetch user's CV
       const { data: cvDoc } = await supabase
         .from("documents")
         .select("sanitized_text")
         .eq("user_id", userId)
         .eq("document_type", "cv")
         .single()
       
       // Fetch job details
       const { data: job } = await supabase
         .from("job_queue")
         .select("*")
         .eq("id", jobId)
         .single()
       
       if (!cvDoc || !job) {
         return NextResponse.json(
           { error: "CV or Job not found" },
           { status: 404 }
         )
       }
       
       // Optimize CV
       const result = await optimizeCV({
         cvText: cvDoc.sanitized_text,
         jobTitle: job.job_title,
         jobRequirements: job.requirements || [],
         jobDescription: job.job_description
       })
       
       // Store optimized version (optional)
       await supabase.from("documents").insert({
         user_id: userId,
         document_type: "cv_optimized",
         sanitized_text: result.optimizedCV,
         metadata: {
           original_cv_id: cvDoc.id,
           job_id: jobId,
           changes_log: result.changesLog,
           ats_score: result.atsScore
         }
       })
       
       return NextResponse.json(result)
       
     } catch (error) {
       console.error("CV Optimization error:", error)
       return NextResponse.json(
         { error: "Optimization failed" },
         { status: 500 }
       )
     }
   }
   ```

## VERIFICATION CHECKLIST

- [ ] `lib/services/cv-optimizer.ts` created with Claude Sonnet 4.5
- [ ] Optimization respects all CRITICAL RULES (no hallucinations)
- [ ] `components/cv/cv-comparison.tsx` shows before/after
- [ ] ATS score calculated (0-100)
- [ ] Keywords highlighted in optimized version
- [ ] API route `/api/cv/optimize` works
- [ ] Optimized CV stored in database (optional)
- [ ] Browser test: Optimize CV, see comparison UI
- [ ] Browser test: Accept optimized CV, verify it's used

## SUCCESS CRITERIA
✅ CV optimized truthfully (no fake info)
✅ ATS score ≥ 75 for well-matched jobs
✅ Bullet points reordered (most relevant first)
✅ Keywords from job description integrated
✅ Before/after comparison UI works
✅ User can accept or revert changes
✅ No breaking changes to existing flow

## EXECUTION ORDER
1. Read all prerequisite documents
2. Create `cv-optimizer.ts` service
3. Create `cv-comparison.tsx` component
4. Create API route `/api/cv/optimize`
5. Test with sample CV and job
6. Create walkthrough.md with screenshots

## IMPORTANT NOTES
- **TRUTH ONLY!** Never hallucinate
- Use Claude Sonnet 4.5 (smart enough for this)
- Follow ARCHITECTURE.md rules for optimization
- Keep UI consistent with Design System
- Test with real job descriptions
