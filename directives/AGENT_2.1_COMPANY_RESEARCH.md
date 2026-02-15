# 🤖 AGENT PROMPT: PHASE 2.1 - COMPANY RESEARCH ENHANCEMENT

## MISSION
Enhance the Company Research system to provide deeper intelligence and better quote suggestions for personalized cover letters.

## PREREQUISITES - READ FIRST! 🚨
**Before starting ANY work, you MUST read these documents:**

1. **`docs/ARCHITECTURE.md`** (Lines 1-500)
   - Understand the 3-stage Cover Letter Generation system
   - Review Company Research via Perplexity (Step 6, Line 363-474)
   - Study data schema for `company_research` table

2. **`docs/DESIGN_SYSTEM.md`** (Lines 1-200)
   - Follow Notion-like aesthetic (bg-[#FAFAF9], clean forms)
   - Use existing component patterns
   - Maintain consistency with onboarding flow

3. **`CLAUDE.md`** 
   - **CRITICAL**: "Reduce Complexity!" (Line 9-11)
   - Keep it simple, defer non-essential features
   - Use lean MVP approach

4. **`database/schema.sql`**
   - Review `company_research` table structure
   - Understand JSONB fields and caching strategy

## CURRENT STATE
- ✅ Basic Perplexity integration exists (`lib/services/company-enrichment.ts`)
- ✅ 7-day caching in `company_research` table
- ⚠️ Quote suggestions are basic (need better matching)
- ⚠️ LinkedIn activity scraping is not yet implemented

## YOUR TASK

### 2.1.1: Enhanced LinkedIn Activity Extraction
**Goal:** Extract recent LinkedIn posts from company pages to understand their communication style and values.

**Implementation:**
1. Update `lib/services/company-enrichment.ts`:
   ```typescript
   async function extractLinkedInActivity(companyName: string) {
     const research = await perplexityClient.chat.completions.create({
       model: "sonar-pro",
       messages: [{
         role: "user",
         content: `Find the last 5-7 LinkedIn posts from ${companyName}.
         
         Extract:
         - Post content (first 200 chars)
         - Theme/Category (e.g., "Team Culture", "Product Launch")
         - Engagement (likes + comments)
         - Date posted
         - Key values mentioned
         
         Return as structured JSON array.`
       }],
       search_recency_filter: "month"
     })
     
     return research.content
   }
   ```

2. Store in `company_research.linkedin_activity` (JSONB array)

### 2.1.2: Improved Quote Suggestion Algorithm
**Goal:** Match quotes to company values with 90%+ relevance.

**Implementation:**
1. Create `lib/services/quote-matcher.ts`:
   ```typescript
   export async function suggestRelevantQuotes(
     companyValues: string[],
     jobField: string,
     companyVision: string
   ): Promise<QuoteSuggestion[]> {
     
     // Use Perplexity to find 5 matching quotes
     const quotes = await perplexityClient.chat.completions.create({
       model: "sonar-pro",
       messages: [{
         role: "user",
         content: `Based on these values: ${companyValues.join(", ")}
         and vision: ${companyVision}
         and field: ${jobField}
         
         Find 5 matching quotes from:
         - CEOs/Founders in ${jobField}
         - Thought leaders (NOT Steve Jobs unless perfect match)
         - Historical innovators
         
         Criteria:
         - Directly related to values
         - Not overused/cliché
         - Authentic and inspiring
         - German or English (matching job language)
         
         Return JSON:
         {
           "quote": "...",
           "author": "Name (Role/Company)",
           "relevance_score": 0-1,
           "value_connection": "...",
           "why_not_cliche": "..."
         }`
       }]
     })
     
     // Score each quote using OpenAI embeddings
     const scoredQuotes = await scoreQuoteRelevance(quotes, companyValues)
     
     // Return top 3, sorted by score
     return scoredQuotes.slice(0, 3)
   }
   ```

2. Add scoring function using OpenAI embeddings:
   ```typescript
   async function scoreQuoteRelevance(
     quotes: any[], 
     companyValues: string[]
   ): Promise<QuoteSuggestion[]> {
     const valueEmbedding = await openai.embeddings.create({
       model: "text-embedding-3-small",
       input: companyValues.join(" ")
     })
     
     const scoredQuotes = await Promise.all(
       quotes.map(async (quote) => {
         const quoteEmbedding = await openai.embeddings.create({
           model: "text-embedding-3-small",
           input: quote.quote + " " + quote.value_connection
         })
         
         const similarity = cosineSimilarity(
           valueEmbedding.data[0].embedding,
           quoteEmbedding.data[0].embedding
         )
         
         return { ...quote, match_score: similarity }
       })
     )
     
     return scoredQuotes.sort((a, b) => b.match_score - a.match_score)
   }
   ```

### 2.1.3: Frontend Display Enhancement
**Goal:** Show research results in a beautiful, scannable format.

**Implementation:**
1. Update `components/onboarding/profile-confirmation.tsx` or create new step:
   ```tsx
   <div className="bg-white rounded-lg p-6 shadow-sm border border-[#E7E7E5]">
     <h3 className="text-lg font-semibold text-[#37352F] mb-4">
       📊 Company Research
     </h3>
     
     {/* Company Overview */}
     <div className="space-y-2 mb-6">
       <p className="text-sm text-[#73726E]">
         Founded: {research.founded}
       </p>
       <p className="text-sm text-[#73726E]">
         Values: {research.core_values.join(", ")}
       </p>
     </div>
     
     {/* Quote Selection (choose 1) */}
     <div className="mb-6">
       <h4 className="font-medium text-[#37352F] mb-3">
         💡 Matching Quotes (choose 1):
       </h4>
       {suggestedQuotes.map((quote, idx) => (
         <label key={idx} className="flex items-start gap-3 p-3 rounded-md hover:bg-[#F5F5F4] cursor-pointer">
           <input type="radio" name="quote" value={quote.quote} />
           <div>
             <p className="text-sm text-[#37352F]">"{quote.quote}"</p>
             <p className="text-xs text-[#73726E] mt-1">
               — {quote.author}
             </p>
             <span className="inline-block mt-2 text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
               {Math.round(quote.match_score * 100)}% Match
               {idx === 0 && " · RECOMMENDED"}
             </span>
           </div>
         </label>
       ))}
       <label className="flex items-start gap-3 p-3 rounded-md hover:bg-[#F5F5F4] cursor-pointer">
         <input type="radio" name="quote" value="custom" />
         <span className="text-sm text-[#73726E]">Enter custom quote</span>
       </label>
     </div>
     
     {/* Recent News */}
     <div>
       <h4 className="font-medium text-[#37352F] mb-3">📰 Recent News:</h4>
       <ul className="space-y-2">
         {research.recent_news.slice(0, 3).map((news, idx) => (
           <li key={idx} className="text-sm text-[#73726E]">
             • {news.title}
           </li>
         ))}
       </ul>
     </div>
   </div>
   ```

## VERIFICATION CHECKLIST

- [ ] `lib/services/company-enrichment.ts` enhanced with LinkedIn extraction
- [ ] `lib/services/quote-matcher.ts` created with scoring algorithm
- [ ] Quote suggestions have 85%+ match scores
- [ ] Frontend displays top 3 quotes with scores
- [ ] User can select or enter custom quote
- [ ] Data stored in `company_research` table
- [ ] 7-day cache still works
- [ ] Browser test: Navigate to profile step, see company research
- [ ] Browser test: Select quote, verify it's used in cover letter

## SUCCESS CRITERIA
✅ LinkedIn activity extracted (5-7 posts per company)
✅ Quote match scores ≥ 85% for top suggestions
✅ UI matches Notion aesthetic (clean, scannable)
✅ User can choose from 3 quotes or enter custom
✅ All data cached properly (7 days TTL)
✅ No breaking changes to existing flow

## EXECUTION ORDER
1. Read all prerequisite documents
2. Enhance `company-enrichment.ts` (LinkedIn)
3. Create `quote-matcher.ts` (scoring)
4. Update/create frontend component
5. Test with browser
6. Create walkthrough.md with screenshots

## IMPORTANT NOTES
- **Keep it simple!** Don't over-engineer.
- Use existing patterns from `lib/services/cover-letter-generator.ts`
- Follow the same error handling as existing services
- Maintain 7-day cache TTL
- Test with real company names (e.g., "Tesla", "Stripe")
