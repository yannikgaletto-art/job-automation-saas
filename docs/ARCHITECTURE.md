# PATHLY V2.0 - COMPLETE SYSTEM ARCHITECTURE

**Status:** Production-Ready Design
**Last Updated:** 2026-02-07
**Version:** 3.0 (Hybrid Client-Server Model)

---

## TABLE OF CONTENTS

1. [Writing Style Analysis](#1-writing-style-analysis)
2. [Manual Application Workflow](#2-manual-application-workflow)
3. [Automated Application Workflow](#3-automated-application-workflow)
4. [Database Schema](#4-database-schema)
5. [Chrome Extension Architecture](#5-chrome-extension-architecture)
6. [Security & Compliance](#6-security--compliance)
7. [Cost Calculation](#7-cost-calculation)

---

## 1. WRITING STYLE ANALYSIS

### Extracted from Reference Cover Letters

```json
{
  "opening_style": {
    "pattern": "Quote from relevant thought leader",
    "structure": [
      "Personal greeting ('Liebes X-Team')",
      "Quote introduction ('neulich bin ich über...', 'ich möchte gerne ein Zitat teilen')",
      "Relevant quote with attribution",
      "Connection to company/job"
    ],
    "examples": [
      "Tim Brown (CEO von IDEO) - Empathy in Design",
      "Grace Hopper - Challenging status quo"
    ]
  },
  
  "sentence_structure": {
    "average_length": "15-25 words",
    "complexity": "Medium (main + subordinate clause)",
    "conjunctions_used": [
      "Daher", "Deshalb", "Gleichzeitig", 
      "Und da genau dieses...", "Denn gerade..."
    ],
    "paragraph_flow": "Thematic transitions with conjunctions"
  },
  
  "tone": {
    "formality": "Professional but personal",
    "pronouns": "First-person, formal 'Sie' for address",
    "enthusiasm": "Moderate (not overly enthusiastic)",
    "key_phrases": [
      "möchte ich gerne... einbringen",
      "durfte ich eigenverantwortlich",
      "fühle ich mich wohl",
      "resoniert stark mit mir"
    ]
  },
  
  "content_structure": {
    "paragraph_1": "Quote + Company connection",
    "paragraph_2": "Relevant experience + concrete skills",
    "paragraph_3": "Additional qualification/expertise",
    "paragraph_4": "Cultural fit + company values",
    "closing": "Friendly, not generic"
  },
  
  "vocabulary": {
    "preference": "Technical terms with context",
    "style": "Academic-practical",
    "examples": [
      "nutzerzentrierter Ansatz",
      "methodisch fundiert",
      "an der Schnittstelle zwischen...",
      "iterativ entwickeln"
    ]
  }
}
```

### AI Generation Rules

**CRITICAL REQUIREMENTS:**
1. **Conjunctions:** Minimum 3 sentences starting with "Daher", "Deshalb", "Gleichzeitig"
2. **No clichés:** Never use "hiermit bewerbe ich mich", "I am excited to apply"
3. **Sentence variety:** Mix 15-25 word sentences with occasional shorter ones
4. **Company integration:** Subtle references to recent news/values from Perplexity research
5. **User voice:** Must sound like the user, not generic AI

---

## 2. MANUAL APPLICATION WORKFLOW

### STEP 1: DSGVO/NIS2 Consent

```
User lands on landing page
  ↓
Clicks "Start Free Trial"
  ↓
Consent Screen appears:
  ┌────────────────────────────────┐
  │ ☑ Privacy Policy (v1.2)        │
  │ ☑ Terms of Service (v1.2)       │
  │ ☑ AI Processing of my texts     │
  │ ☑ Cookie Guidelines             │
  └────────────────────────────────┘
  ↓
Backend: INSERT INTO consent_history
  (user_id, document_type='privacy_policy', 
   document_version='v1.2', consent_given=TRUE,
   ip_address='88.217.142.12', consented_at=NOW())
  ↓
Redirect to Dashboard
```

### STEP 2: Upload Training Material

```typescript
// Frontend Validation with Zod
const fileSchema = z.object({
  cv: z.instanceof(File).refine(f => 
    f.size < 5_000_000 && 
    ['application/pdf', 'application/vnd.openxmlformats'].includes(f.type)
  ),
  coverLetters: z.array(z.instanceof(File)).min(2).max(3)
})
```

**Backend Processing:**

```python
# POST /api/documents/upload

# 1. Upload to Supabase Storage (encrypted)
file_url = supabase.storage.from_('cvs').upload(
    f"{user_id}/{uuid4()}.pdf.enc",
    file_bytes,
    file_options={"contentType": "application/pdf"}
)

# 2. Extract Text (PDF Parser)
extracted_text = extract_text_from_pdf(file_bytes)

# 3. PII Extraction (spaCy NER)
pii = extract_pii(extracted_text)
# Returns: {"name": "Max Mustermann", "email": "...", "phone": "...", "address": "..."}

# 4. Encrypt PII
pii_encrypted = encrypt_with_fernet(json.dumps(pii))

# 5. Extract Metadata (Skills, Experience)
metadata = extract_cv_metadata(extracted_text)
# Returns: {"skills": ["Python", "AWS"], "years_experience": 8}

# 6. Generate Writing Style Embedding
style_analysis = anthropic.messages.create(
    model="claude-sonnet-4.5",
    messages=[{
        "role": "user",
        "content": f"""
        Analyze writing style from these cover letters:
        {cover_letter_texts}
        
        Extract:
        - Tone (formal/casual)
        - Sentence length (short/long)
        - Opening style (quote/question/direct)
        - Common phrases
        
        JSON format.
        """
    }]
)

writing_style_embedding = generate_embedding(style_analysis.content)

# 7. Store in Database
supabase.table('documents').insert({
    'user_id': user_id,
    'pii_encrypted': pii_encrypted,
    'metadata': metadata,
    'writing_style_embedding': writing_style_embedding,
    'file_url_encrypted': encrypt(file_url)
})
```

### STEP 2.5: CV Template Selection ✨ NEW

```
User sees template gallery:
  ┌──────────────────────────────────────┐
  │  Choose your CV Template:              │
  │  ┌────────┐ ┌────────┐ ┌────────┐   │
  │  │ Modern │ │Classic │ │ATS-Opt.│   │
  │  │  ████  │ │  ████  │ │  ████  │   │
  │  │ Notion │ │Harvard │ │McKinsey│   │
  │  └────────┘ └────────┘ └────────┘   │
  │                                      │
  │  Live Preview with your data:         │
  │  [Preview renders with extracted]     │
  │  [CV data filled in]                  │
  └──────────────────────────────────────┘
  ↓
UPDATE user_profiles
SET preferred_cv_template = 'notion_modern'
WHERE id = user_id
```

### STEP 3: Job URL Input & Scraping

```python
# POST /api/jobs/scrape

# 1. Determine Scraping Strategy
def choose_scraper(url: str):
    if 'linkedin.com' in url:
        return scrape_with_brightdata  # LinkedIn = hard
    elif 'company-website' in url:
        return scrape_with_playwright_stealth  # Cheaper
    else:
        return scrape_with_scraper_api  # Default

# 2. Execute with Retry
@backoff.on_exception(backoff.expo, Exception, max_tries=3)
def scrape_job_with_fallback(url: str):
    try:
        return scrape_with_scraper_api(url)
    except RateLimitError:
        return scrape_with_playwright_stealth(url)
    except Exception as e:
        log_failed_job(url, error=str(e))
        raise

# 3. Extract Structured Data
job_data = {
    "title": "Senior Business Development Manager",
    "company": "TechCorp GmbH",
    "location": "Berlin, Remote möglich",
    "description": "Wir suchen einen...",
    "requirements": [
        "5+ Jahre Erfahrung in SaaS Sales",
        "Fließend Deutsch & Englisch"
    ],
    "salary_range": "70.000 - 90.000 EUR",
    "application_url": "https://...",
    "scraped_at": "2026-02-07T10:39:00Z"
}

# 4. INSERT INTO scraped_jobs
supabase.table('scraped_jobs').insert(job_data)
```

### STEP 4: Profile Confirmation (Steckbrief)

```
Frontend shows extracted data:
  ┌──────────────────────────────────────┐
  │  Bestätige dein Profil              │
  │  --------------------------------  │
  │  Name: Max Mustermann             │
  │  Email: max@example.com           │
  │  Skills: [Python, AWS, React]     │
  │  Years: 8                          │
  │                                    │
  │  [✏️ Bearbeiten] [✅ Bestätigen]   │
  └──────────────────────────────────────┘
```

### STEP 5: CV Optimization

```python
# POST /api/cv/optimize

optimized_cv = anthropic.messages.create(
    model="claude-sonnet-4.5",
    messages=[{
        "role": "user",
        "content": f"""
        Optimize this CV for this job:
        
        CV: {cv_text}
        Job Requirements: {job_requirements}
        
        Rules:
        1. Keep all facts truthful (no hallucinations)
        2. Reorder bullet points (most relevant first)
        3. Add missing keywords from job description
        4. Quantify achievements where possible
        5. Keep length under 2 pages
        
        Return optimized CV in Markdown.
        """
    }]
)
```

### STEP 6: Company Research via Perplexity ✨ NEW

```python
# POST /api/research/company

from perplexity import Client

client = Client(api_key=os.getenv('PERPLEXITY_API_KEY'))

# 1. Deep Company Research
research = client.chat.completions.create(
    model="sonar-pro",  # Deep Search Model
    messages=[{
        "role": "user",
        "content": f"""
        Research comprehensively about {company_name}:
        
        1. Company founding & history
        2. Core values & mission statement
        3. Recent LinkedIn posts (last 3 months)
        4. Press releases & milestones (2024-2026)
        5. Vision & strategic goals
        6. Company culture & employer brand
        
        Format: Structured JSON with sources
        """
    }],
    return_citations=True,
    search_recency_filter="month"  # Only current info
)

company_intel = {
    "founded": "2010",
    "core_values": ["Innovation", "Empathy", "Impact"],
    "recent_news": [
        {
            "title": "VRG wins Innovation Award 2025",
            "date": "2025-11-15",
            "url": "...",
            "relevance": "High"
        }
    ],
    "linkedin_activity": [
        {
            "post": "We're looking for doers who...",
            "theme": "Team Culture",
            "engagement": 250
        }
    ],
    "vision": "Digitization of social economy"
}

# 2. Generate Quote Suggestions
quotes = client.chat.completions.create(
    model="sonar-pro",
    messages=[{
        "role": "user",
        "content": f"""
        Based on these company values:
        {company_intel['core_values']}
        
        Find 3 matching quotes from notable figures:
        - CEOs/Founders of relevant companies
        - Thought leaders in {job_field}
        - Historical innovators
        
        Criteria:
        - Related to values
        - Not overused (not Steve Jobs)
        - Authentic & inspiring
        
        Format:
        {{
          "quote": "...",
          "author": "Name (Role)",
          "relevance_explanation": "...",
          "connection_to_values": "..."
        }}
        """
    }]
)

suggested_quotes = [
    {
        "quote": "Empathy is the heart of design...",
        "author": "Tim Brown (CEO IDEO)",
        "relevance": "Fits VRG's user-centric approach",
        "match_score": 0.95
    },
    {
        "quote": "Technology is best when it brings people together",
        "author": "Matt Mullenweg (WordPress Founder)",
        "relevance": "Social economy & community",
        "match_score": 0.87
    },
    {
        "quote": "Design is not just what it looks like...",
        "author": "Steve Jobs",
        "relevance": "Design Thinking approach",
        "match_score": 0.72  # Lower due to overuse
    }
]

# 3. Store Research
supabase.table('company_research').insert({
    'job_id': job_id,
    'company_name': company_name,
    'intel_data': company_intel,
    'suggested_quotes': suggested_quotes,
    'perplexity_citations': research.citations
})
```

**Frontend Display:**

```
┌──────────────────────────────────────┐
│  📊 Company Research              │
│                                    │
│  Founded: 2010                     │
│  Values: Innovation, Empathy       │
│                                    │
│  💡 Matching Quotes (choose 1):  │
│  ☐ Tim Brown: "Empathy is..."    │
│     (95% Match - RECOMMENDED)      │
│  ☐ Matt Mullenweg: "Technology"│
│     (87% Match)                    │
│  ☐ Enter custom quote            │
│                                    │
│  📰 Recent News:                 │
│  - Innovation Award 2025 won      │
│  - New care software launched     │
└──────────────────────────────────────┘
```

### STEP 7: Cover Letter Generation (3-Stage) ✨ NEW

```python
# POST /api/cover-letter/generate-advanced

MAX_ITERATIONS = 3

for iteration in range(MAX_ITERATIONS):
    # STAGE 1: Generation (Sonnet 4.5)
    cover_letter = anthropic.messages.create(
        model="claude-sonnet-4.5",
        messages=[{
            "role": "user",
            "content": f"""
            CONTEXT:
            - Job: {job_title} at {company_name}
            - Company values: {company_values}
            - Recent news: {recent_milestones}
            
            USER PROFILE:
            {cv_text}
            
            WRITING STYLE (CRITICAL - EXACT IMITATION):
            Analysis from 2 reference cover letters:
            
            Structure:
            - Paragraph 1: Quote opening
            - Paragraph 2: Relevant experience
            - Paragraph 3: Additional expertise
            - Paragraph 4: Cultural fit
            - Closing: Personal, not generic
            
            Sentence starters MUST vary:
            - Conjunctions: "Daher", "Deshalb", "Gleichzeitig"
            - Temporal markers: "Während meiner Zeit..."
            - Causal connections: "Denn gerade..."
            
            Tone:
            - Professional but personal
            - First-person perspective
            - Moderately enthusiastic (not overly)
            
            Key Phrases (User's Voice):
            - "möchte ich gerne... einbringen"
            - "durfte ich eigenverantwortlich"
            - "fühle ich mich wohl"
            - "resoniert stark mit mir"
            
            QUOTE (if selected):
            {selected_quote}
            
            COMPANY CONNECTION:
            Integrate subtly:
            - {recent_news[0]['title']} (if relevant to CV)
            - Values: {core_values[0]}
            - Vision: {company_vision}
            
            FORBIDDEN:
            - "I am excited to apply"
            - "I believe I would be a great fit"
            - "hiermit bewerbe ich mich"
            - Any standard phrases
            - More than 2 sentences without conjunction start
            
            Write the cover letter NOW.
            """
        }],
        temperature=0.7  # Some creativity allowed
    )
    
    # STAGE 2: Judge (Haiku 4)
    judge = anthropic.messages.create(
        model="claude-haiku-4",
        messages=[{
            "role": "user",
            "content": f"""
            TASK: Strict quality check
            
            TEXT:
            {cover_letter}
            
            REFERENCE STYLE (the goal):
            {reference_letter_1}
            
            EVALUATE (1-10):
            
            1. Naturalness (no AI language)
               - Conjunctions at sentence start? (min 3x)
               - Sentence length varies? (15-25 words avg)
               - No clichés?
            
            2. Style Congruence (matches references)
               - Tone match?
               - User's voice recognizable?
               - Structure followed?
            
            3. Company Relevance (relevant & subtle)
               - Values mentioned?
               - News integrated (if fitting)?
               - Not generic?
            
            4. Individuality (unique)
               - Concrete examples?
               - Not interchangeable?
            
            FORMAT:
            {{
              "naturalness_score": 8,
              "style_match_score": 7,
              "company_relevance_score": 9,
              "individuality_score": 8,
              "overall_score": 8,
              "issues": [
                "Only 1x conjunction at sentence start (too few)",
                "Phrase 'freue mich auf' sounds standard"
              ],
              "suggestions": [
                "More 'Daher', 'Deshalb' at sentence start",
                "Make closing more personal"
              ]
            }}
            """
        }]
    )
    
    # CHECK SCORE
    if judge['overall_score'] >= 8:
        break  # PASSED ✅
    else:
        # Retry with detailed feedback
        previous_issues = judge['issues']
        continue
    
    # LOG ITERATION
    supabase.table('generation_logs').insert({
        'iteration': iteration,
        'scores': judge,
        'feedback': previous_issues
    })

return {
    'cover_letter': cover_letter,
    'quality_scores': judge,
    'iterations': iteration + 1
}
```

### STEP 8: Manual Application Tracking ✨ NEW

```typescript
// When user manually applies

// CRITICAL: Save immediately to application_history
await supabase.from('application_history').insert({
  user_id: user.id,
  job_url: currentJobUrl,
  company_name: scrapedData.company,
  job_title: scrapedData.title,
  url_hash: md5(currentJobUrl),
  company_slug: slugify(scrapedData.company),
  applied_at: new Date().toISOString(),
  application_method: 'manual'
})

// This triggers:
// 1. Double-apply prevention
// 2. Visual table update
// 3. Statistics refresh
```

**Visual Table (shadcn/ui):**

See `/components/ApplicationHistoryTable.tsx` for full implementation.

Key features:
- 🏢 Company logos (via Clearbit API)
- 📅 Formatted dates
- 🏷️ Badges (Auto vs Manual)
- 🔗 Quick actions (Open URL, Download docs)
- 📊 Statistics cards (Week/Month/Total)

---

## 3. AUTOMATED APPLICATION WORKFLOW

### Architecture: Hybrid Client-Server

```
┌────────────────────────────────────────────────────────────┐
│  CLOUD (Backend - Python/Supabase)                          │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  1. Job Scout (Cron with Jitter)                     │  │
│  │     - Runs between 08:00-10:00 (randomized)          │  │
│  │     - SerpAPI Query                                  │  │
│  │     - INSERT INTO search_trigger_queue               │  │
│  │                                                      │  │
│  │  2. Worker (Queue Processor)                         │  │
│  │     - Fetches jobs from queue (rate limited)        │  │
│  │     - Scrapes with Sentinel/Playwright              │  │
│  │     - Company Research (Perplexity)                 │  │
│  │     - Generate CV + Cover Letter                    │  │
│  │     - Status: ready_for_review                      │  │
│  │     - Push Notification to User                     │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
                            ↓
┌────────────────────────────────────────────────────────────┐
│  FRONTEND DASHBOARD (Next.js)                                │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Inbox View:                                        │  │
│  │  ┌──────────────────────────────────────────────┐  │  │
│  │  │  🔵 New (5)                                  │  │  │
│  │  │  📝 Draft (3) ← AI generated                 │  │  │
│  │  │  ✅ Approved (2) ← Ready for Extension       │  │  │
│  │  │  📤 Sent (12)                                │  │  │
│  │  └──────────────────────────────────────────────┘  │  │
│  │                                                      │  │
│  │  User clicks on "Draft":                            │  │
│  │  - Reads cover letter                              │  │
│  │  - Edits (optional)                                │  │
│  │  - Clicks "Approve & Queue"                        │  │
│  │  → Status: ready_to_apply                          │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

See [Chrome Extension Architecture](#5-chrome-extension-architecture) for details.

---

## 4. DATABASE SCHEMA

See `/database/schema.sql` for complete SQL.

### Key Tables

#### application_history (Manual Tracking)

```sql
CREATE TABLE application_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  
  company_name TEXT NOT NULL,
  job_url TEXT NOT NULL,
  job_title TEXT,
  
  -- Detection Fields
  url_hash TEXT,  -- MD5(job_url)
  company_slug TEXT,  -- Normalized: "tech-corp-gmbh"
  
  -- NEW: Method Tracking
  application_method TEXT CHECK (application_method IN ('manual', 'auto', 'extension')) DEFAULT 'manual',
  
  applied_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Prevent duplicates
  UNIQUE(user_id, url_hash),
  UNIQUE(user_id, company_slug, job_title)
);

-- Indexes
CREATE INDEX idx_application_history_method ON application_history(application_method);
CREATE INDEX idx_application_history_week ON application_history(applied_at) 
  WHERE applied_at > NOW() - INTERVAL '7 days';
```

#### company_research (Perplexity Cache)

```sql
CREATE TABLE company_research (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES job_queue(id),
  company_name TEXT NOT NULL,
  
  intel_data JSONB,  -- Founded, values, vision, culture
  suggested_quotes JSONB[],  -- Array of quote objects
  recent_news JSONB[],
  linkedin_activity JSONB[],
  
  perplexity_citations JSONB[],  -- For transparency
  
  researched_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days',
  
  UNIQUE(company_name)  -- Cache by company
);
```

#### form_selectors (Learning System)

```sql
CREATE TABLE form_selectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_name TEXT NOT NULL,  -- 'greenhouse', 'workday'
  company_domain TEXT,  -- 'jobs.techcorp.com' (optional)
  
  field_name TEXT NOT NULL,  -- 'email', 'first_name'
  css_selector TEXT NOT NULL,  -- 'input[id="email"]'
  
  -- Confidence Scoring
  trust_score FLOAT DEFAULT 0.9,
  success_count INT DEFAULT 0,
  failure_count INT DEFAULT 0,
  
  last_verified_at TIMESTAMPTZ DEFAULT NOW(),
  verified_by_user_id UUID REFERENCES auth.users(id),
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 5. CHROME EXTENSION ARCHITECTURE

### Tech Stack
- **Framework:** Plasmo (React-based)
- **Manifest:** V3 (required by Chrome)
- **Language:** TypeScript

### Components

#### 1. Background Service Worker

```typescript
// background/index.ts

import { supabase } from '@/lib/supabase'

// Listen for approved applications
chrome.alarms.create('check-queue', { periodInMinutes: 5 })

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'check-queue') {
    const { data } = await supabase
      .from('job_queue')
      .select('*')
      .eq('status', 'ready_to_apply')
      .limit(10)
    
    if (data.length > 0) {
      // Update badge
      chrome.action.setBadgeText({ text: String(data.length) })
      chrome.action.setBadgeBackgroundColor({ color: '#3B82F6' })
    }
  }
})
```

#### 2. Content Script (Form Filler)

```typescript
// content-script.tsx

import type { PlasmoCSConfig } from "plasmo"
import { supabase } from "@/lib/supabase"

export const config: PlasmoCSConfig = {
  matches: [
    "https://jobs.lever.co/*",
    "https://*.greenhouse.io/*",
    "https://*.myworkdayjobs.com/*",
    "https://www.linkedin.com/jobs/*"
  ]
}

const fillApplication = async () => {
  const currentUrl = window.location.href
  
  // 1. Fetch application data
  const { data: appData } = await supabase
    .from('job_queue')
    .select('*, form_data')
    .eq('job_url', currentUrl)
    .eq('status', 'ready_to_apply')
    .single()
  
  if (!appData) return
  
  // 2. Get form selectors for this platform
  const platform = detectPlatform(currentUrl)
  const { data: selectors } = await supabase
    .from('form_selectors')
    .select('*')
    .eq('platform_name', platform)
    .order('trust_score', { ascending: false })
  
  // 3. Fill text fields
  selectors.forEach(selector => {
    const field = document.querySelector(selector.css_selector)
    if (field && appData.form_data[selector.field_name]) {
      field.value = appData.form_data[selector.field_name]
      field.dispatchEvent(new Event('input', { bubbles: true }))
      
      // Report success
      updateSelectorTrust(selector.id, true)
    }
  })
  
  // 4. Upload CV (DataTransfer API)
  const fileInput = document.querySelector('input[type="file"]')
  if (fileInput && appData.cv_url) {
    const blob = await fetch(appData.cv_url).then(r => r.blob())
    const file = new File([blob], 'CV.pdf', { type: 'application/pdf' })
    const dt = new DataTransfer()
    dt.items.add(file)
    fileInput.files = dt.files
    fileInput.dispatchEvent(new Event('change', { bubbles: true }))
  }
  
  // 5. Fill cover letter
  const textarea = document.querySelector('textarea#message')
  if (textarea && appData.cover_letter) {
    textarea.value = appData.cover_letter
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
  }
  
  // 6. Show confirmation UI
  showConfirmationOverlay()
}

function detectPlatform(url: string): string {
  if (url.includes('greenhouse')) return 'greenhouse'
  if (url.includes('lever')) return 'lever'
  if (url.includes('workday')) return 'workday'
  if (url.includes('linkedin')) return 'linkedin'
  return 'unknown'
}

function showConfirmationOverlay() {
  const overlay = document.createElement('div')
  overlay.innerHTML = `
    <div style="position: fixed; top: 20px; right: 20px; 
                background: white; padding: 20px; border-radius: 12px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 9999;">
      <h3>✅ Application Pre-filled</h3>
      <p>Review the data and click Submit when ready.</p>
      <button id="pathly-done">Done</button>
    </div>
  `
  document.body.appendChild(overlay)
  
  // User clicks "Done"
  document.getElementById('pathly-done').addEventListener('click', async () => {
    // Wait for user to submit manually
    observeForSuccessScreen()
    overlay.remove()
  })
}

function observeForSuccessScreen() {
  const observer = new MutationObserver(async () => {
    // Check for success indicators
    const successTexts = [
      'Thank you for applying',
      'Application submitted',
      'Successfully applied'
    ]
    
    const bodyText = document.body.innerText.toLowerCase()
    if (successTexts.some(text => bodyText.includes(text.toLowerCase()))) {
      // Update status
      await supabase
        .from('job_queue')
        .update({ status: 'submitted', processed_at: new Date() })
        .eq('job_url', window.location.href)
      
      // Also insert into application_history
      await supabase
        .from('application_history')
        .insert({
          user_id: user.id,
          job_url: window.location.href,
          company_name: appData.company,
          job_title: appData.job_title,
          application_method: 'extension'
        })
      
      observer.disconnect()
    }
  })
  
  observer.observe(document.body, { childList: true, subtree: true })
}
```

#### 3. Popup (User Interface)

```typescript
// popup.tsx

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

export default function Popup() {
  const [pendingApps, setPendingApps] = useState([])
  
  useEffect(() => {
    loadPendingApplications()
  }, [])
  
  const loadPendingApplications = async () => {
    const { data } = await supabase
      .from('job_queue')
      .select('*')
      .eq('status', 'ready_to_apply')
      .order('created_at', { ascending: false })
    
    setPendingApps(data)
  }
  
  const startApplication = async (app) => {
    // Open job URL in new tab
    chrome.tabs.create({ url: app.job_url })
  }
  
  return (
    <div className="w-80 p-4">
      <h2 className="text-xl font-bold mb-4">💼 Pathly Assistant</h2>
      
      {pendingApps.length === 0 ? (
        <p>No pending applications</p>
      ) : (
        <div className="space-y-3">
          {pendingApps.map(app => (
            <div key={app.id} className="p-3 border rounded-lg">
              <p className="font-medium">{app.company}</p>
              <p className="text-sm text-gray-600">{app.job_title}</p>
              <button
                onClick={() => startApplication(app)}
                className="mt-2 px-4 py-2 bg-blue-500 text-white rounded"
              >
                Start Application
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

---

## 6. SECURITY & COMPLIANCE

### DSGVO Art. 22 Compliance

**Why no full automation:**

1. Legal requirement: No "solely automated decision-making"
2. User MUST review and approve before submission
3. Status flow enforces human-in-the-loop:
   ```
   pending → ready_for_review → ready_to_apply → submitted
              ↑ AI generates     ↑ User approves  ↑ User clicks
   ```

### NIS2 Compliance

- ✅ Incident response plan documented
- ✅ Supply chain audits (API vendors)
- ✅ Backup & recovery (Supabase point-in-time)
- ✅ Security patches (Dependabot)

### Data Encryption

```python
from cryptography.fernet import Fernet

# PII Encryption
cipher = Fernet(os.getenv('ENCRYPTION_KEY'))
encrypted_pii = cipher.encrypt(json.dumps(pii).encode())

# Decryption (only when needed)
decrypted_pii = json.loads(cipher.decrypt(encrypted_pii).decode())
```

---

## 7. COST CALCULATION

| Service | MVP (0-100 users) | Scale (100-1000 users) |
|---------|-------------------|------------------------|
| **Scraping** | €0 (Playwright) | €49/mo (ScraperAPI) |
| **Perplexity** | €20/mo (50 calls) | €200/mo (500 calls) |
| **AI (Claude)** | €100/mo | €500/mo |
| **Supabase** | €0 (Free tier) | €25/mo (Pro) |
| **Vercel** | €0 (Hobby) | €20/mo (Pro) |
| **Extension** | €5 (one-time) | €5 (one-time) |
| **Monitoring** | €0 (Sentry Free) | €26/mo |
| **TOTAL** | **~€125/mo** | **~€825/mo** |

**Break-Even:**
- @ €29/mo subscription
- MVP: 5 paying users
- Scale: 29 paying users

---

**Last Updated:** 2026-02-07
**Version:** 3.0
**Status:** ✅ Production-Ready
