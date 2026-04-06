# AGENT 2.0: CV Match — Scoring Intelligence Module

**Status:** ACTIVE  
**Version:** 1.1 (QA-Hardened)  
**Owner:** Antigravity / Pathly  
**Depends on:** AGENT_1.1_JOB_SCRAPING.md (job_category field), directives/01_database.supabase.md

---

## Goal

Score a candidate CV against a job description and return a **structured JSON result** that can be consumed directly by the UI and written to Supabase. The agent must never guess — all classification logic has deterministic fallbacks.

---

## Inputs

| Field | Type | Source | Required |
|---|---|---|---|
| `cv_text` | string | User upload / parsed PDF | ✅ |
| `job_description` | string | Supabase `jobs` table | ✅ |
| `job_category` | string | Supabase `jobs.job_category` (set by Agent 1.1) | ✅ |
| `job_id` | uuid | Supabase `jobs.id` | ✅ |
| `candidate_id` | uuid | Supabase `candidates.id` | ✅ |

> **Rule:** `job_category` is NOT re-classified by this agent. It is read directly from the database. Agent 1.1 owns classification. This agent consumes it. No duplicate logic, no silent conflicts.

---

## Preset Library (5 Profiles)

Each preset defines weights across 4 scoring vectors. Weights must sum to 1.0.

### TECH
```
skills_match:     0.45
experience_depth: 0.30
culture_signals:  0.10
education:        0.15
```
**KO Signals:** Missing primary language/framework from job description requirements.  
**Positive Signals:** Open source contributions, system design experience, specific toolchain matches.

### SALES
```
skills_match:     0.25
experience_depth: 0.40
culture_signals:  0.25
education:        0.10
```
**KO Signals:** No quota-bearing role in history, no revenue numbers mentioned.  
**Positive Signals:** ARR/MRR figures, specific deal sizes, named enterprise accounts.

### LEADERSHIP
```
skills_match:     0.20
experience_depth: 0.35
culture_signals:  0.30
education:        0.15
```
**KO Signals:** No direct reports mentioned, no P&L or budget responsibility.  
**Positive Signals:** Team size, org transformation, cross-functional ownership.

### OPERATIONS
```
skills_match:     0.30
experience_depth: 0.35
culture_signals:  0.20
education:        0.15
```
**KO Signals:** No process ownership or tooling experience.  
**Positive Signals:** Measurable efficiency improvements, tool certifications, automation history.

### CREATIVE
```
skills_match:     0.35
experience_depth: 0.25
culture_signals:  0.25
education:        0.15
```
**KO Signals:** No portfolio link or work samples referenced.  
**Positive Signals:** Brand names, agency experience, awards, published work.

### UNKNOWN (Fallback)
Used when `job_category` does not match any of the 5 presets above.
```
skills_match:     0.30
experience_depth: 0.30
culture_signals:  0.20
education:        0.20
```
> When UNKNOWN preset is applied, `requires_manual_review` is automatically set to `true` and `preset_confidence` is set to `0.0`.

---

## Scoring Vectors

### 1. Skills Match (Essential vs. Optional)
- **Essential skills** (explicitly stated as required in job description): 2× weight
- **Optional skills** (listed as "nice to have"): 1× weight
- **Missing essential skill** = KO trigger (see KO Filter below)
- **Action Verb Quality:** CVs using specific, quantified verbs ("scaled to 10M users", "reduced churn by 23%") score higher than generic verbs ("responsible for", "involved in")

### 2. Experience Depth
- Years in directly relevant roles (not total career years)
- Seniority signal: title progression must match or exceed job level
- Recency: roles from the last 3 years carry full weight; 3–7 years carry 0.7×; 7+ years carry 0.4×
- **Note:** Recency multipliers only apply when CV contains explicit date ranges. If dates are absent, apply neutral weight (1.0×) — do not penalise for missing data.

### 3. Culture Signals
- Company stage match (startup vs. enterprise vs. scale-up)
- Industry vertical relevance
- Demonstrated ownership language vs. execution-only language

### 4. Education
- Degree relevance to role (not prestige)
- Certifications and continuing education are weighted equally to formal degrees for tech and operations roles

---

## KO Filter Logic

The KO filter runs **before** scoring. If triggered, scoring still completes, but `ko_triggered: true` is set in output.

**Hard KOs** (auto-flag `requires_manual_review: true`):
- Missing a skill explicitly marked as "required" in the job description
- Total relevant experience < 50% of stated minimum (e.g., job requires 5 years, CV shows 2)
- Seniority mismatch ≥ 2 levels (e.g., applying for VP with only IC history)

**Soft KOs** (lower score, no hard flag):
- Recency gap > 18 months in primary skill
- No direct industry experience (adjacent is acceptable)

---

## Output Schema (JSON — Mandatory)

The agent MUST return this exact structure. No free-text responses. The calling script writes this directly to Supabase.

```json
{
  "candidate_id": "uuid",
  "job_id": "uuid",
  "preset_used": "TECH | SALES | LEADERSHIP | OPERATIONS | CREATIVE | UNKNOWN",
  "preset_confidence": 1.0,
  "score_total": 78,
  "score_breakdown": {
    "skills_match": 82,
    "experience_depth": 75,
    "culture_signals": 70,
    "education": 80
  },
  "ko_triggered": false,
  "ko_reasons": [],
  "requires_manual_review": false,
  "manual_review_reason": null,
  "top_strengths": ["string", "string", "string"],
  "gap_summary": "One concise sentence. Max 30 words.",
  "scoring_version": "1.1",
  "timestamp": "ISO-8601"
}
```

**Rules:**
- `score_total` and all `score_breakdown` values are integers 0–100
- `top_strengths` is exactly 3 items — never more, never less
- `gap_summary` is a single sentence — no bullet points, no lists
- `preset_confidence` is always `1.0` for named presets, `0.0` for UNKNOWN
- `scoring_version` is hardcoded to match this directive's version

---

## Supabase Write (Mandatory)

After every scoring run, the result is written to the `match_results` table. The execution script handles this — not the LLM.

**Table:** `match_results`  
**Schema:**

```sql
candidate_id          uuid references candidates(id)
job_id                uuid references jobs(id)
preset_used           text
preset_confidence     float
score_total           integer
score_breakdown       jsonb
ko_triggered          boolean
requires_manual_review boolean
manual_review_reason  text
top_strengths         text[]
gap_summary           text
scoring_version       text
created_at            timestamptz default now()
```

**RLS Policy:** Only the authenticated service role can INSERT. Users can only SELECT their own candidate records.

---

## Fallback Chain

```
1. job_category from Supabase → map to preset
2. If job_category is NULL → set preset = UNKNOWN, requires_manual_review = true
3. If job_category value not in preset library → set preset = UNKNOWN, requires_manual_review = true
4. If LLM call fails → Circuit Breaker activates (see 02_self_healing_error_handling.md)
5. If Supabase write fails → Retry 3×, then log to .tmp/failed_writes.json
```

**Never silently fail.** Every error path produces a loggable output.

---

## Process

### Step 1 — Read Inputs
```python
# execution/cv_scorer.py
job = supabase.table("jobs").select("*").eq("id", job_id).single().execute()
candidate = supabase.table("candidates").select("*").eq("id", candidate_id).single().execute()
job_category = job.data["job_category"]  # Do NOT re-classify
```

### Step 2 — Load Preset
```python
preset = PRESET_LIBRARY.get(job_category.upper(), PRESET_LIBRARY["UNKNOWN"])
```

### Step 3 — Call LLM (Claude 3.5 Sonnet — Phase B)
Pass `cv_text`, `job_description`, `preset`, and output schema to the model. Instruct it to return valid JSON only.

### Step 4 — Validate JSON
Parse and validate the response against the output schema. If invalid, retry once. If second attempt fails, trigger circuit breaker (directive 02).

### Step 5 — Write to Supabase
```python
supabase.table("match_results").insert(validated_result).execute()
```

### Step 6 — Return to UI
The execution script returns the JSON to the calling function. The UI reads `requires_manual_review` to determine display state.

---

## Testing Protocol

### Unit Tests
- Each preset's weights sum to exactly 1.0
- UNKNOWN preset sets `requires_manual_review: true`
- Missing essential skill triggers `ko_triggered: true`
- Date-absent CVs receive neutral recency weight (not penalised)

### Integration Tests
- Valid job_category → correct preset loaded
- NULL job_category → UNKNOWN preset, manual review flag
- Supabase write succeeds with correct schema
- Supabase write failure → retry logic activates

### E2E Test
```bash
python3 execution/cv_scorer.py \
  --job_id test-job-uuid \
  --candidate_id test-candidate-uuid \
  --dry_run true  # Skips Supabase write, outputs JSON to stdout
```

---

## Edge Cases

| Scenario | Handling |
|---|---|
| CV in non-English language | Score with available signals; flag `requires_manual_review: true`; add note in `gap_summary` |
| CV has no dates | Apply neutral recency weight (1.0×); do not penalise |
| job_category not in preset library | Apply UNKNOWN preset; `requires_manual_review: true` |
| LLM returns invalid JSON | Retry once; circuit breaker on second failure |
| Supabase write timeout | Retry 3× with exponential backoff; log to `.tmp/failed_writes.json` |
| Batch of 100+ CVs | Throttle to 10 concurrent LLM calls max (Modal worker handles queue) |

---

## Self-Annealing

Per directive `02_self_healing_error_handling.md`:  
If a scoring error occurs and a fix is found, update this directive's **Edge Cases** table with the new scenario. The system hardens with every failure.

**Last hardened:** 2026-04-05 (initial QA pass — JSON output, UNKNOWN fallback, neutral recency weight for date-absent CVs, multilingual flag)
