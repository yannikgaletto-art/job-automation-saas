#!/usr/bin/env python3
"""
Agent 5: Cover Letter Generation Execution Script

Directive: directives/cover_letter_generation.md
Purpose: Generate cover letter with 3-stage QA (Generate → Judge → Iterate)
"""

import os
import sys
import json
import argparse
from datetime import datetime
from typing import Dict, List, Optional

# Import skills
try:
    from skills.claude_client import generate_cover_letter, judge_cover_letter
    from skills.database import (
        get_job,
        get_company_intel,
        get_optimized_cv,
        get_reference_letters,
        save_cover_letter
    )
except ImportError as e:
    print(f"ERROR: Missing required skill module: {e}")
    sys.exit(1)


# Writing rules from ARCHITECTURE.md
WRITING_RULES = {
    "min_conjunctions": 3,
    "conjunctions": ["Daher", "Deshalb", "Gleichzeitig", "Während"],
    "forbidden_phrases": [
        "hiermit bewerbe ich mich",
        "I am excited to apply",
        "mit großem Interesse",
        "freue mich auf"
    ],
    "sentence_length_range": (15, 25),
    "structure": {
        "paragraph_1": "Quote + Company connection (optional)",
        "paragraph_2": "Relevant experience",
        "paragraph_3": "Additional expertise",
        "paragraph_4": "Cultural fit",
        "closing": "Personal, not generic"
    }
}

MAX_ITERATIONS = 3
MIN_QUALITY_SCORE = 8.0


def generate_cover_letter_with_qa(
    job_id: str,
    user_id: str,
    language: str = "de",
    dry_run: bool = False
) -> Dict:
    """
    Execute Agent 5: Cover Letter Generation with 3-stage QA
    
    Args:
        job_id: UUID of job
        user_id: UUID of user
        language: Target language (de/en)
        dry_run: If True, don't save to database
    
    Returns:
        Dict with final cover letter and quality scores
    """
    
    result = {
        "job_id": job_id,
        "user_id": user_id,
        "language": language,
        "cover_letter_markdown": None,
        "quality_scores": None,
        "iterations": 0,
        "status": "pending",
        "created_at": datetime.utcnow().isoformat()
    }
    
    iteration_logs = []
    
    try:
        # ===== 1. LOAD CONTEXT =====
        print(f"[Agent 5] Loading job {job_id}...")
        job = get_job(job_id)
        
        if not job:
            raise ValueError(f"Job {job_id} not found")
        
        print(f"[Agent 5] Loading company intel...")
        company_intel = get_company_intel(job.get("company"))
        
        print(f"[Agent 5] Loading optimized CV...")
        optimized_cv = get_optimized_cv(user_id, job_id)
        
        print(f"[Agent 5] Loading reference letters...")
        reference_letters = get_reference_letters(user_id)
        
        # ===== 2. 3-STAGE GENERATION LOOP =====
        feedback = None
        
        for iteration in range(1, MAX_ITERATIONS + 1):
            result["iterations"] = iteration
            
            print(f"\n{'='*60}")
            print(f"[Agent 5] ITERATION {iteration}/{MAX_ITERATIONS}")
            print(f"{'='*60}\n")
            
            # --- STAGE 1: GENERATE (Claude Sonnet) ---
            print(f"[Agent 5] Stage 1: Generating cover letter...")
            
            cover_letter = generate_cover_letter(
                job=job,
                company_intel=company_intel,
                optimized_cv_markdown=optimized_cv["content_markdown"],
                reference_letters=reference_letters,
                writing_rules=WRITING_RULES,
                language=language,
                previous_feedback=feedback
            )
            
            print(f"[Agent 5] ✓ Generated {len(cover_letter.split())} words")
            
            # --- STAGE 2: JUDGE (Claude Haiku) ---
            print(f"[Agent 5] Stage 2: Quality assessment...")
            
            judge_result = judge_cover_letter(
                cover_letter=cover_letter,
                reference_letter=reference_letters[0] if reference_letters else None,
                company_intel=company_intel,
                writing_rules=WRITING_RULES
            )
            
            # Parse judge result
            scores = judge_result["quality_scores"]
            overall_score = scores["overall_score"]
            
            print(f"[Agent 5] Quality Scores:")
            print(f"  Naturalness: {scores['naturalness_score']}/10")
            print(f"  Style Match: {scores['style_match_score']}/10")
            print(f"  Factual Accuracy: {scores['factual_accuracy_score']}/10")
            print(f"  Individuality: {scores['individuality_score']}/10")
            print(f"  OVERALL: {overall_score}/10")
            
            # Log iteration
            iteration_logs.append({
                "iteration": iteration,
                "overall_score": overall_score,
                "issues": judge_result.get("issues_found", []),
                "suggestions": judge_result.get("suggestions", [])
            })
            
            # --- STAGE 3: DECISION ---
            if overall_score >= MIN_QUALITY_SCORE:
                print(f"[Agent 5] ✓ APPROVED (score >= {MIN_QUALITY_SCORE})")
                result["cover_letter_markdown"] = cover_letter
                result["quality_scores"] = scores
                result["status"] = "ready_for_review"
                break
            
            elif iteration < MAX_ITERATIONS:
                print(f"[Agent 5] → ITERATE (score < {MIN_QUALITY_SCORE})")
                feedback = {
                    "issues": judge_result.get("issues_found", []),
                    "suggestions": judge_result.get("suggestions", [])
                }
                continue
            
            else:
                # Max iterations reached, still not approved
                print(f"[Agent 5] ⚠️ Max iterations reached, needs manual review")
                result["cover_letter_markdown"] = cover_letter
                result["quality_scores"] = scores
                result["status"] = "needs_review"
                break
        
        # ===== 3. SAVE COVER LETTER =====
        if not dry_run:
            cover_letter_id = save_cover_letter(
                user_id=user_id,
                job_id=job_id,
                content=result["cover_letter_markdown"],
                quality_scores=result["quality_scores"],
                iterations=result["iterations"],
                status=result["status"],
                iteration_logs=iteration_logs
            )
            
            result["cover_letter_id"] = cover_letter_id
            print(f"[Agent 5] ✓ Saved cover letter {cover_letter_id}")
        else:
            print(f"[Agent 5] DRY RUN: Would save cover letter")
        
    except Exception as e:
        print(f"[Agent 5] ERROR: {e}")
        result["error"] = str(e)
        result["status"] = "failed"
    
    return result


def main():
    parser = argparse.ArgumentParser(
        description="Agent 5: Cover Letter Generation - Generate with 3-stage QA"
    )
    
    parser.add_argument("--job-id", required=True, help="Job UUID")
    parser.add_argument("--user-id", required=True, help="User UUID")
    parser.add_argument("--language", default="de", choices=["de", "en"])
    parser.add_argument("--dry-run", action="store_true", help="Don't save to database")
    
    args = parser.parse_args()
    
    try:
        result = generate_cover_letter_with_qa(
            job_id=args.job_id,
            user_id=args.user_id,
            language=args.language,
            dry_run=args.dry_run
        )
        
        print(f"\n{'='*60}")
        print(f"JOB ID: {result['job_id']}")
        print(f"STATUS: {result['status']}")
        print(f"ITERATIONS: {result['iterations']}")
        
        if result.get('quality_scores'):
            print(f"FINAL SCORE: {result['quality_scores']['overall_score']}/10")
        
        print(f"{'='*60}\n")
        
        sys.exit(0 if result['status'] in ['ready_for_review', 'needs_review'] else 1)
        
    except Exception as e:
        print(f"FATAL ERROR: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
