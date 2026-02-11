#!/usr/bin/env python3
"""
Agent 2: Job Matching Execution Script

Directive: directives/job_matching.md
Purpose: Calculate match score between user profile and job (Pillar 2 only)
"""

import os
import sys
import json
import argparse
from datetime import datetime
from typing import Dict, Optional

# Import skills
try:
    from skills.embeddings import compute_similarity
    from skills.database import get_job, get_user_profile, update_job_status
except ImportError as e:
    print(f"ERROR: Missing required skill module: {e}")
    sys.exit(1)


def match_job(
    job_id: str,
    user_id: str,
    threshold: float = 0.70,
    dry_run: bool = False
) -> Dict:
    """
    Execute Agent 2: Job Matching
    
    Args:
        job_id: UUID of job to match
        user_id: UUID of user
        threshold: Match threshold (default 0.70 = 70%)
        dry_run: If True, don't update database
    
    Returns:
        Dict with match_score and decision
    """
    
    result = {
        "job_id": job_id,
        "user_id": user_id,
        "match_score": 0.0,
        "status": "pending",
        "threshold": threshold,
        "matched_at": datetime.utcnow().isoformat()
    }
    
    try:
        # ===== 1. LOAD CONTEXT =====
        print(f"[Agent 2] Loading job {job_id}...")
        job = get_job(job_id)
        
        if not job:
            raise ValueError(f"Job {job_id} not found")
        
        print(f"[Agent 2] Loading user profile {user_id}...")
        user_profile = get_user_profile(user_id)
        
        if not user_profile:
            raise ValueError(f"User {user_id} not found")
        
        # ===== 2. CREATE TEXT BLOBS FOR EMBEDDING =====
        job_text = create_job_text_blob(job)
        user_text = create_user_text_blob(user_profile)
        
        # ===== 3. COMPUTE SIMILARITY =====
        print(f"[Agent 2] Computing similarity...")
        base_score = compute_similarity(job_text, user_text)
        
        # ===== 4. RULE-BASED ADJUSTMENTS =====
        adjusted_score = base_score
        
        # Location match
        if user_profile.get("preferred_locations"):
            if job.get("location") in user_profile["preferred_locations"]:
                adjusted_score += 0.05
                print(f"[Agent 2] +0.05 for location match")
        
        # Seniority match
        if job.get("seniority") == user_profile.get("seniority"):
            adjusted_score += 0.05
            print(f"[Agent 2] +0.05 for seniority match")
        
        # Missing critical skills
        job_skills = set(job.get("requirements", []))
        user_skills = set(user_profile.get("skills", []))
        
        missing_critical = job_skills - user_skills
        if len(missing_critical) > 3:
            adjusted_score -= 0.10
            print(f"[Agent 2] -0.10 for {len(missing_critical)} missing skills")
        
        # Clamp to [0, 1]
        final_score = max(0.0, min(1.0, adjusted_score))
        
        result["match_score"] = round(final_score, 2)
        
        # ===== 5. THRESHOLD DECISION =====
        if final_score >= threshold:
            result["status"] = "matched"
            print(f"[Agent 2] ✓ MATCHED (score: {final_score:.2f} >= {threshold})")
        else:
            result["status"] = "rejected"
            print(f"[Agent 2] ✗ REJECTED (score: {final_score:.2f} < {threshold})")
        
        # ===== 6. UPDATE DATABASE =====
        if not dry_run:
            update_job_status(
                job_id=job_id,
                status=result["status"],
                match_score=result["match_score"],
                matching_version="v1.0"
            )
            print(f"[Agent 2] Updated job_queue for {job_id}")
        else:
            print(f"[Agent 2] DRY RUN: Would update job_queue")
        
    except Exception as e:
        print(f"[Agent 2] ERROR: {e}")
        result["status"] = "matching_failed"
        result["error"] = str(e)
    
    return result


def create_job_text_blob(job: Dict) -> str:
    """Create text representation of job for embedding"""
    parts = [
        job.get("title", ""),
        job.get("description", ""),
        " ".join(job.get("requirements", []))
    ]
    return " ".join(parts)


def create_user_text_blob(user_profile: Dict) -> str:
    """Create text representation of user for embedding"""
    parts = [
        user_profile.get("summary", ""),
        " ".join(user_profile.get("skills", [])),
        f"{user_profile.get('experience_years', 0)} years experience"
    ]
    return " ".join(parts)


def main():
    parser = argparse.ArgumentParser(
        description="Agent 2: Job Matching - Calculate match score"
    )
    
    parser.add_argument("--job-id", required=True, help="Job UUID")
    parser.add_argument("--user-id", required=True, help="User UUID")
    parser.add_argument("--threshold", type=float, default=0.70, help="Match threshold (0.0-1.0)")
    parser.add_argument("--dry-run", action="store_true", help="Don't update database")
    
    args = parser.parse_args()
    
    try:
        result = match_job(
            job_id=args.job_id,
            user_id=args.user_id,
            threshold=args.threshold,
            dry_run=args.dry_run
        )
        
        print(f"\n{'='*60}")
        print(f"JOB ID: {result['job_id']}")
        print(f"MATCH SCORE: {result['match_score']:.2f}")
        print(f"STATUS: {result['status']}")
        print(f"THRESHOLD: {result['threshold']}")
        print(f"{'='*60}\n")
        
        sys.exit(0 if result["status"] == "matched" else 1)
        
    except Exception as e:
        print(f"FATAL ERROR: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
