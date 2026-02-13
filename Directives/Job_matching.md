AGENT 2 – JOB MATCHING DIRECTIVE

**Agent:** 2 – Job Matching (Matcher)  
**For:** Pillar 2 (Automation only)  
**Execution Script:** `execution/match_job.py`  
**Related Docs:**  
- `AGENTS.md` – Agent overview and match_score concept  
- `docs/ARCHITECTURE.md` – Automated pipeline and thresholds  

---

## 1. GOAL

Compute a reliable match score between a user's profile and each scraped job to filter out low-quality opportunities and prioritize high-fit jobs for downstream agents.

---

## 2. TRIGGERS

### Pillar 1 – Manual Application

- Not used. User explicitly chooses jobs; no automatic filtering.

### Pillar 2 – Automation

- After Agent 1 stores new jobs with `status = 'scraped'` in `job_queue` for a given user/search profile.
- Trigger: `on_jobs_scraped(user_id, search_profile_id)`.

---

## 3. INPUT / OUTPUT CONTRACT

### Input

```json
{
  "user_id": "uuid",
  "job_id": "uuid",
  "job": {
    "title": "Senior Software Engineer",
    "company": "TechCorp GmbH",
    "location": "Berlin, Germany",
    "description": "Full job description...",
    "requirements": [
      "5+ years Python",
      "AWS",
      "Docker"
    ]
  },
  "user_profile": {
    "skills": ["Python", "Django", "PostgreSQL", "AWS"],
    "experience_years": 6,
    "preferred_locations": ["Berlin, Germany"],
    "seniority": "Senior"
  }
}
Output

Updated job_queue entry:

json
{
  "job_id": "uuid",
  "user_id": "uuid",
  "match_score": 0.82,
  "status": "matched",
  "matching_version": "v1.0",
  "matched_at": "ISO-8601 timestamp"
}
Jobs below threshold are marked:

json
{
  "status": "rejected",
  "match_score": 0.42
}
4. PROCESS
Load Context

Fetch job data from job_queue.

Fetch user profile (skills, experience, preferences) from the user/profile tables.

Feature Extraction

Extract structured features:

Skill sets (job vs user).

Seniority (junior/mid/senior).

Location/remote compatibility.

Create combined text blobs for embeddings:

Job: title + description + requirements.

User: summary of experience + skills.

Embedding and Similarity

Use OpenAI text-embedding-3-small (or configured provider) to embed both texts.

Compute cosine similarity as base score between job and user embeddings.

Rule-Based Adjustments

Apply small boosts/penalties:

+0.05 if location matches preferred location.

+0.05 if seniority matches.

-0.10 if key required skill missing.

Clamp score to [0,1].

Thresholding

Default threshold: 0.70 (70%).

If final match_score >= threshold → mark status = 'matched'.

Else → status = 'rejected'.

Store Results

Write match_score, status, and matched_at to job_queue.

Version the algorithm using matching_version.

5. EDGE CASES & PLAYBOOKS
Situation	Action
Embedding API unavailable	Fallback to TF-IDF similarity; log degraded mode.
User has very few skills (<3)	Rely more on generic profile, reduce threshold (e.g. to 0.6) for this user.
Job description extremely short	Lower confidence flag; rely more on requirements list.
All jobs get low scores (<0.4)	Likely mismatch of search profile; suggest user to adjust filters.
Many user rejections of high-score jobs	Decrease threshold slowly or adjust weighting (skills vs location).
6. ERROR HANDLING
Wrap embedding and DB operations in try/except.

On any failure per job:

Set status = 'matching_failed' for that job.

Leave job available for manual review.

If systemic failure (e.g. embeddings down for many jobs):

Abort the batch, raise a system alert, and retry later.

7. TESTING & DONE CRITERIA
Test Checklist

 Run matching for 100 test jobs across 5–10 user profiles.

 Manually verify that top 10 jobs per user look reasonable.

 Simulate embedding failure and confirm fallback behavior.

Definition of Done

Matching completes for a standard batch (e.g. 100 jobs) in under 10 seconds.

Precision of "matched" jobs (user agrees they are relevant) is at least 75% in manual evaluation.

No critical unhandled exceptions in logs for at least 1 week of real usage.

8. METRICS TO TRACK
avg_match_score per user and per search profile.

match_rate = matched / total.

User override rate:

Jobs auto-rejected but manually re-activated.

Jobs auto-matched but manually rejected.
