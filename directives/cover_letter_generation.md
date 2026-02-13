# AGENT 5: COVER LETTER GENERATION DIRECTIVE

**Version:** 1.0 (MVP)  
**Last Updated:** 2026-02-13  
**Agent:** Cover Letter Generation (Writer Agent)  
**Implementation:** `skills/cover_letter_generator.py`  
**Execution:** `execution/generate_cover_letter.py`  

---

## 🎯 RULE #0: REDUCE COMPLEXITY

**Principle:** MVP over Perfection. Ship fast, iterate later.

**Applied to Cover Letter Generation:**
- ✅ **Single generation (no QA loop)** → Phase 1 MVP, add Quality Judge iteration in Phase 2
- ✅ **One tone (professional)** → Don't overcomplicate with 5 tone variations
- ✅ **Claude Sonnet 4 only** → Don't A/B test multiple models at launch
- ✅ **250-350 words fixed** → Simple constraint, easy to validate
- ❌ **Multi-variant generation** → Generating 3 versions is overkill for MVP
- ❌ **Real-time style matching** → Use simple prompt engineering, add ML later
- ❌ **Perfect grammar scoring** → User can edit, don't block on perfect validation

**Quality Guard:**
- MVP = One good cover letter that user can edit
- Phase 2 = Quality Judge loop for iteration
- Phase 3 = Style matching from reference letters

**Motto:** "One authentic cover letter beats three mediocre variations."

---

## 1. PURPOSE

Generate personalized, authentic cover letters using job data + user profile + company research.

### Why This Agent Exists

**Problem:** Generic AI cover letters are obvious and ineffective.

**Solution:** Integrate real company intel + user's voice + specific job requirements.

**Impact:** Cover letters that sound human, reference real company news, and match user's style.

---

## 2. WHEN TO EXECUTE

**Triggers:**
- After Agent 3 completes company research
- For BOTH Pillar 1 (Manual) and Pillar 2 (Automation)

**Frequency:**
- On-demand (Pillar 1)
- Batch (Pillar 2, after job matching)

---

## 3. INPUT REQUIREMENTS

```python
{
  "job_data": {
    "title": "Senior Python Developer",
    "company": "SAP SE",
    "location": "Berlin, Germany",
    "description": "...",
    "requirements": [...]
  },
  "user_profile": {
    "name": "Max Mustermann",
    "current_role": "Software Engineer",
    "skills": ["Python", "Django", "AWS"],
    "experience_years": 5,
    "achievements": [...]
  },
  "company_intel": {
    "mission": "...",
    "recent_news": [...],
    "culture": [...],
    "achievements": [...]
  },
  "tone": "professional"  // or "enthusiastic", "technical"
}
```

---

## 4. PROCESS (MVP - Single Generation)

### Step 1: Build System Prompt

```python
system_prompt = """
You are an expert cover letter writer specializing in job applications.

Your cover letters are:
- Personalized and authentic
- Concise (250-350 words)
- Achievement-focused
- Company-aware (when research provided)
- Formatted in clean Markdown

Structure:
1. Opening (why this role + company resonates)
2. Key Qualifications (2-3 relevant achievements)
3. Company Fit (connect to company values/news)
4. Closing (enthusiasm + call to action)

Avoid:
- Generic phrases ("I am writing to apply...")
- Repetition of resume
- Desperation or over-eagerness
- Buzzwords without substance
"""
```

---

### Step 2: Build User Prompt (Full Context)

```python
user_prompt = f"""
# COVER LETTER REQUEST

## JOB POSTING
**Position:** {job_data['title']}
**Company:** {job_data['company']}
**Location:** {job_data['location']}

**Description:**
{job_data['description']}

**Key Requirements:**
{', '.join(job_data['requirements'])}

## APPLICANT PROFILE
**Name:** {user_profile['name']}
**Current Role:** {user_profile['current_role']}
**Skills:** {', '.join(user_profile['skills'])}
**Years of Experience:** {user_profile['experience_years']}

**Key Achievements:**
{format_achievements(user_profile['achievements'])}

## COMPANY RESEARCH
**Mission:** {company_intel['mission']}

**Recent News:**
{format_news(company_intel['recent_news'])}

**Culture Highlights:**
{format_culture(company_intel['culture'])}

---

**TASK:** Write a compelling cover letter in Markdown format.
Make it personal and authentic. Connect my background to this specific role and company.
Target length: 250-350 words.
"""
```

---

### Step 3: Generate with Claude Sonnet 4

```python
from anthropic import Anthropic

client = Anthropic(api_key=os.getenv('ANTHROPIC_API_KEY'))

response = client.messages.create(
    model="claude-sonnet-4-20250514",
    max_tokens=1024,
    temperature=0.7,  # Balanced creativity
    system=system_prompt,
    messages=[{
        "role": "user",
        "content": user_prompt
    }]
)

cover_letter = response.content[0].text
```

---

### Step 4: Validate Output

```python
def validate_cover_letter(text: str) -> dict:
    """
    Basic quality checks for MVP.
    """
    word_count = len(text.split())
    
    issues = []
    
    # Word count check
    if word_count < 250:
        issues.append("Too short (< 250 words)")
    elif word_count > 350:
        issues.append("Too long (> 350 words)")
    
    # Generic phrase detection
    generic_phrases = [
        "I am writing to apply",
        "hiermit bewerbe ich mich",
        "I am excited to apply",
        "mit großem Interesse"
    ]
    
    for phrase in generic_phrases:
        if phrase.lower() in text.lower():
            issues.append(f"Contains generic phrase: '{phrase}'")
    
    # Company name mentioned?
    if company_name.lower() not in text.lower():
        issues.append("Company name not mentioned")
    
    return {
        "valid": len(issues) == 0,
        "word_count": word_count,
        "issues": issues
    }
```

---

### Step 5: Store in Database

```python
supabase.table('cover_letters').insert({
    'job_id': job_id,
    'user_id': user_id,
    'cover_letter_markdown': cover_letter,
    'word_count': word_count,
    'tone': tone,
    'model_used': 'claude-sonnet-4-20250514',
    'company_intel_used': True,
    'generation_metadata': {
        'input_tokens': response.usage.input_tokens,
        'output_tokens': response.usage.output_tokens
    },
    'status': 'generated',
    'generated_at': datetime.now().isoformat()
}).execute()
```

---

## 5. OUTPUT SCHEMA

```json
{
  "cover_letter_id": "uuid",
  "job_id": "uuid",
  "user_id": "uuid",
  "cover_letter_markdown": "# Cover Letter\n\n...",
  "word_count": 285,
  "tone": "professional",
  "model_used": "claude-sonnet-4-20250514",
  "company_intel_used": true,
  "generation_metadata": {
    "input_tokens": 1523,
    "output_tokens": 342
  },
  "quality_score": null,
  "status": "generated",
  "generated_at": "2026-02-13T08:25:00Z"
}
```

---

## 6. ERROR HANDLING

### Retry Logic

```python
from tenacity import retry, stop_after_attempt, wait_exponential

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=2, min=2, max=10)
)
def generate_with_retry(job_data, user_profile, company_intel):
    return claude_api_call(...)
```

**Fallback:**
```
Claude Sonnet 4 (Primary)
    ↓ [FAIL after 3 retries]
Generate WITHOUT company intel
    (Flag as "limited_intel")
    ↓ [Still FAIL]
Notify user + provide template
```

---

## 7. SUCCESS CRITERIA (MVP)

**Per Cover Letter:**
- ✅ Generation completes in < 15 seconds
- ✅ Word count 250-350 words
- ✅ Company intel successfully integrated
- ✅ No generic opening phrases detected
- ✅ Company name mentioned

**System-Wide:**
- ✅ API success rate > 95%
- ✅ Average generation time < 10 seconds
- ✅ Cost per cover letter < $0.02
- ✅ User satisfaction > 4/5 stars

---

## 8. COST STRUCTURE

**Per Generation:**
- Claude Sonnet 4: ~$0.015 (avg 1500 input + 350 output tokens)
- Company Research (cached 70%): ~$0.006
- **Total:** ~$0.021 per cover letter

**Monthly Projection (10,000 cover letters):**
- Cover letter generation: $150
- Company research: $60
- **Total:** $210/month

---

## 9. MONITORING

**Track in:** `stats.md` and `cover_letter_stats` table

**Key Metrics:**
```
Success Rate: 97.8% (target: >95%)
Average Generation Time: 8.2s (target: <15s)
Average Word Count: 287 words (target: 250-350)
Cost Per Letter: $0.019 (target: <$0.02)
User Approval Rate: 89% (target: >80%)
```

**Alerts:**
- Success rate < 90% for 24 hours
- Average generation time > 20s
- Cost per letter > $0.03

---

## 10. PHASE 2 ENHANCEMENTS (Future)

**Quality Judge Loop:**
- Add Claude Haiku 4 validation
- Iterate up to 3x if quality score < 8/10
- Track improvement metrics

**Style Matching:**
- Analyze user's reference cover letters
- Extract writing style patterns
- Adapt tone dynamically

**Multi-Variant:**
- Generate 3 versions (professional, enthusiastic, technical)
- Let user pick best
- Learn from choices

---

## 11. USAGE EXAMPLE

```python
from skills.cover_letter_generator import CoverLetterGenerator

# Initialize
generator = CoverLetterGenerator()

# Generate
result = generator.generate(
    job_data=job,
    user_profile=profile,
    company_intel=intel,
    tone="professional"
)

# Output
print(f"Cover Letter:\n{result['cover_letter']}")
print(f"Word Count: {result['word_count']}")
print(f"Cost: ${result['cost']:.4f}")
```

---

## 12. NEXT STEPS

**Phase 1 (MVP - DONE ✅):**
- [x] Claude Sonnet 4 integration
- [x] Company intel integration
- [x] Basic validation
- [x] Database storage

**Phase 2 (Quality Judge):**
- [ ] Add Claude Haiku 4 validation
- [ ] Implement iteration loop (max 3x)
- [ ] Track quality scores

**Phase 3 (Style Matching):**
- [ ] Reference letter analysis
- [ ] Writing style extraction
- [ ] Dynamic tone adaptation

---

**Status:** ✅ ACTIVE (Phase 1 MVP Complete)  
**Next Review:** After 500 cover letters generated  
**Owner:** Agent 5 (Cover Letter Generation)  
