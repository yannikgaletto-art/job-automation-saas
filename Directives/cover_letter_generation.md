AGENT 5 – COVER LETTER GENERATION DIRECTIVE

**Agent:** 5 – Cover Letter Generation (with integrated QA)  
**For:** Pillar 1 (Manual) and Pillar 2 (Automation)  
**Execution Script:** `execution/generate_cover_letter.py`  
**Related Docs:**  
- `AGENTS.md` – 3-stage generation concept  
- `docs/ARCHITECTURE.md` – Writing style rules and tone requirements  

---

## 1. GOAL

Generate individualized, natural-sounding cover letters that match the user’s writing style and company context, using a 3-stage process (Generate → Judge → Iterate) to enforce quality and avoid hallucinations.

---

## 2. TRIGGERS

### Pillar 1 – Manual Application

- After Agent 4 successfully optimizes the CV for a manually selected job.
- Trigger: `on_manual_cv_optimized(job_id)`.

### Pillar 2 – Automation

- After Agent 4 optimizes CVs for matched jobs in a batch.
- Trigger: `on_auto_cv_optimized(job_id)` for each job.

---

## 3. INPUT / OUTPUT CONTRACT

### Input

```json
{
  "job_id": "uuid",
  "user_id": "uuid",
  "job": {
    "title": "UX Designer",
    "company": "Acme Inc.",
    "location": "Remote",
    "description": "Job description...",
    "requirements": ["Figma", "User interviews"]
  },
  "company_intel": {
    "core_values": ["User-first"],
    "vision": "Democratize design tools",
    "recent_news": []
  },
  "optimized_cv_markdown": "Tailored CV content...",
  "user_reference_letters": [
    "Example reference cover letter 1...",
    "Example reference cover letter 2..."
  ],
  "language": "de"
}
Output

json
{
  "job_id": "uuid",
  "user_id": "uuid",
  "cover_letter_markdown": "Final approved cover letter...",
  "quality_scores": {
    "naturalness_score": 9,
    "style_match_score": 8,
    "factual_accuracy_score": 10,
    "individuality_score": 9,
    "overall_score": 9
  },
  "iterations": 2,
  "status": "ready_for_review",
  "created_at": "ISO-8601 timestamp"
}
Stored in cover_letters (or equivalent) and linked to the job/application record.

4. PROCESS
Stage 1 – Generate (Claude Sonnet)

Provide full context:

Job data and requirements.

Relevant company intel (values, news, vision).

Optimized CV content.

Reference letters representing the user’s style.

Writing rules (structure, conjunction usage, forbidden phrases).

Ask Sonnet to produce a complete draft in the target language.

Stage 2 – Judge (Claude Haiku)

Feed Haiku:

The generated cover letter.

At least one reference letter.

Company intel.

Ask for a strict JSON evaluation with scores (1–10) for:

Naturalness.

Style match.

Factual accuracy.

Individuality.

Require an overall_score plus:

issues_found list.

suggestions list.

hallucinations_detected list.

decision field: "APPROVE" or "ITERATE".

Stage 3 – Decision and Iteration

If overall_score >= 8 and decision == "APPROVE":

Accept letter and stop.

Else:

Use suggestions and issues_found to instruct Sonnet to regenerate an improved version.

Repeat up to MAX_ITERATIONS = 3.

User-Feedback Loop (if 3x < 8)

If after 3 iterations overall_score < 8:

Mark letter as status = 'needs_review'.

Store latest draft and QA feedback.

Do not attempt further auto-fixes.

The dashboard must:

Show draft + issues + suggestions to the user.

Allow user to:

Approve as-is.

Edit manually and save.

Request one more regeneration with custom feedback.

Finalization

Once approved by either QA or user:

Set status = 'ready_for_review' (system-level) and/or ready_to_apply once user explicitly confirms for submission step.

Store logs of iterations and scores for analytics.

5. EDGE CASES & PLAYBOOKS
Situation	Action
Company intel missing	Generate letter without company-specific details; focus on role and generic alignment.
Haiku detects hallucinations	Force "ITERATE", explicitly instruct Sonnet to remove or correct specific sentences.
Haiku repeatedly complains about clichés	Strengthen constraints in Sonnet prompt (e.g. ban additional phrases, require new openings).
User reference letters are very short or noisy	Fall back to a simpler style template defined in ARCHITECTURE, still avoiding clichés.
User always edits letters heavily	Log high manual-edit rate; later use edits as new references for better style matching.
6. ERROR HANDLING
If Sonnet fails:

Retry up to 2 times.

On persistent failure: mark as generation_failed and notify the user to write manually.

If Haiku fails:

Retry once; if still failing, use a lightweight scripted check (regex for some forbidden phrases) and mark quality_scores as partial.

7. TESTING & DONE CRITERIA
Test Checklist

 Generate cover letters for at least 10 jobs across different companies.

 Confirm that at least 80% achieve overall_score >= 8 within ≤2 iterations.

 Manually check that no hallucinated company facts appear.

Definition of Done

Average overall_score ≥ 8.5 across test set.

Majority of letters require at most 2 iterations.

No critical style violations of the writing rules defined in docs/ARCHITECTURE.md.

8. METRICS TO TRACK
Distribution of iterations (1, 2, 3).

Average scores per dimension (naturalness, factual accuracy, etc.).

Percentage of letters flagged as needs_review.

Ratio of user-approved vs. heavily edited letters.
