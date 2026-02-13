AGENT 4 – CV OPTIMIZATION DIRECTIVE

**Agent:** 4 – CV Optimization  
**For:** Pillar 1 (Manual) and Pillar 2 (Automation)  
**Execution Script:** `execution/optimize_cv.py`  
**Related Docs:**  
- `AGENTS.md` – Role of CV optimization and versioning  
- `docs/ARCHITECTURE.md` – Writing rules and match-score concept  

---

## 1. GOAL

Transform the user’s master CV into a tailored CV for a specific job, increasing relevance and match score while strictly preserving truthfulness and staying within a 2-page limit.

---

## 2. TRIGGERS

### Pillar 1 – Manual Application

- After Agent 1 scrapes the job and Agent 3 provides company intel (or marks intel as unavailable).
- Trigger: `on_manual_job_researched(job_id)`.

### Pillar 2 – Automation

- After Agent 2 marks a job as `matched` and Agent 3 completes research.
- Trigger: `on_matched_job_researched(job_id)`.

---

## 3. INPUT / OUTPUT CONTRACT

### Input

```json
{
  "job_id": "uuid",
  "user_id": "uuid",
  "job": {
    "title": "Product Designer",
    "company": "Acme Inc.",
    "location": "Berlin",
    "requirements": ["Figma", "User research", "Prototyping"]
  },
  "company_intel": {
    "core_values": ["User-first", "Experimentation"],
    "vision": "Make design accessible",
    "recent_news": []
  },
  "master_cv": {
    "content_markdown": "Full master CV in markdown...",
    "pages_estimate": 3
  }
}
Output

json
{
  "job_id": "uuid",
  "user_id": "uuid",
  "optimized_cv_markdown": "Tailored CV content...",
  "optimized_cv_pdf_url": "storage/cvs/user_id/cv_job_id.pdf",
  "match_score_before": 0.65,
  "match_score_after": 0.80,
  "pages_estimate": 2,
  "created_at": "ISO-8601 timestamp"
}
Stored in cv_versions (or equivalent).

4. PROCESS
Load Context

Fetch job, company intel, and master CV.

Compute baseline match score (reusing Agent 2's logic where possible).

Prompt Construction

Provide Claude Sonnet with:

Job description, requirements, and company intel (if available).

Full master CV in markdown.

Clear rules: no hallucinations, preserve structure, emphasize relevant experiences/skills.

Optimization Rules

Reorder experiences so the most relevant roles/apparently matching experiences come first.

Reorder or filter bullet points to emphasize technologies and tasks matching the job.

Add missing truthful details where the master CV is vague (e.g. quantifying impact), but never invent employers, roles, or companies.

2-Page Enforcement Strategy

Estimate page length from markdown (e.g. via line/section count).

If >2 pages:

First remove or shorten:

Oldest roles older than 5–7 years with low relevance.

Side projects unrelated to the job.

Hobbies and non-critical extras.

Keep:

Recent and highly relevant roles.

Skills, tools, and education sections.

If still >2 pages after trimming:

Shorten bullet points to 1–2 lines each while preserving meaning.

Validation

Optionally run a lightweight sanity check (internal function or Haiku) to ensure:

No company-specific facts appear that are not present in company_intel.

No obvious contradictions (e.g. overlapping dates that weren’t in the master CV).

PDF Generation

Convert final markdown to PDF.

Store file in storage and metadata in cv_versions.

Recompute Match Score

Run the same matching logic as Agent 2 to compute match_score_after.

5. EDGE CASES & PLAYBOOKS
Situation	Action
Master CV already < 1 page	Only reorder / enrich; do not aggressively trim.
Company intel missing	Optimize only to job description; skip company-specific tailoring.
Match score does not improve	Mark as no_improvement; keep version but track for future tuning.
User has multiple profiles (e.g. PM/SWE)	Use the profile explicitly linked to the current job/application.
6. ERROR HANDLING
If Claude API fails:

Retry up to 2 times.

On failure: mark optimization as failed, keep master CV as fallback.

If PDF generation fails:

Keep markdown only; mark PDF as missing, allow user to export manually later.

7. TESTING & DONE CRITERIA
Test Checklist

 Optimize CVs for at least 5 diverse jobs (different roles).

 Ensure all outputs are ≤2 pages.

 Verify that match score improved in at least 4/5 cases.

 Manually inspect for hallucinated company-specific facts (should be zero).

Definition of Done

Average match score improvement across test set ≥10 percentage points.

No hallucinations detected in manual review.

Stable behavior across multiple runs (same input → same output, within deterministic settings).

8. METRICS TO TRACK
avg_match_score_delta per job type.

Percentage of optimizations that exceed 2 pages (should trend to 0).

User satisfaction rating (if you later collect it).
