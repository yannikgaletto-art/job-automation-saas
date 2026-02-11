#!/usr/bin/env python3
"""
Agent 4: CV Optimization Execution Script

Directive: directives/cv_optimization.md
Purpose: Optimize master CV for specific job using Claude
"""

import os
import sys
import json
import argparse
from datetime import datetime
from typing import Dict, Optional

# Import skills
try:
    from skills.claude_client import optimize_cv_with_claude
    from skills.pdf_generator import markdown_to_pdf
    from skills.database import (
        get_job,
        get_company_intel,
        get_master_cv,
        save_cv_version,
        get_match_score
    )
except ImportError as e:
    print(f"ERROR: Missing required skill module: {e}")
    sys.exit(1)


def optimize_cv(
    job_id: str,
    user_id: str,
    mode: str = "pillar_2",  # 'pillar_1' or 'pillar_2'
    dry_run: bool = False
) -> Dict:
    """
    Execute Agent 4: CV Optimization
    
    Args:
        job_id: UUID of job
        user_id: UUID of user
        mode: 'pillar_1' (manual) or 'pillar_2' (auto)
        dry_run: If True, don't save to database
    
    Returns:
        Dict with optimized CV and metadata
    """
    
    result = {
        "job_id": job_id,
        "user_id": user_id,
        "mode": mode,
        "optimized_cv_markdown": None,
        "optimized_cv_pdf_url": None,
        "match_score_before": None,
        "match_score_after": None,
        "match_score_delta": None,
        "pages_estimate": None,
        "created_at": datetime.utcnow().isoformat()
    }
    
    try:
        # ===== 1. LOAD CONTEXT =====
        print(f"[Agent 4] Loading job {job_id}...")
        job = get_job(job_id)
        
        if not job:
            raise ValueError(f"Job {job_id} not found")
        
        print(f"[Agent 4] Loading company intel...")
        company_intel = get_company_intel(job.get("company"))
        
        print(f"[Agent 4] Loading master CV for user {user_id}...")
        master_cv = get_master_cv(user_id)
        
        if not master_cv:
            raise ValueError(f"No master CV found for user {user_id}")
        
        # ===== 2. GET BASELINE MATCH SCORE (Pillar 2 only) =====
        if mode == "pillar_2":
            print(f"[Agent 4] Getting baseline match score...")
            result["match_score_before"] = get_match_score(job_id)
            print(f"[Agent 4] Baseline score: {result['match_score_before']}")
        else:
            print(f"[Agent 4] Pillar 1 mode: Skipping match score")
        
        # ===== 3. OPTIMIZE WITH CLAUDE =====
        print(f"[Agent 4] Optimizing CV with Claude Sonnet...")
        
        optimized_markdown = optimize_cv_with_claude(
            job=job,
            company_intel=company_intel,
            master_cv_markdown=master_cv["content_markdown"],
            max_pages=2
        )
        
        result["optimized_cv_markdown"] = optimized_markdown
        
        # Estimate pages (rough: ~50 lines per page)
        line_count = len(optimized_markdown.split('\n'))
        result["pages_estimate"] = max(1, min(2, line_count // 50))
        
        print(f"[Agent 4] ✓ Optimized CV ({result['pages_estimate']} pages)")
        
        # ===== 4. GENERATE PDF =====
        if not dry_run:
            print(f"[Agent 4] Generating PDF...")
            
            pdf_url = markdown_to_pdf(
                markdown_content=optimized_markdown,
                user_id=user_id,
                job_id=job_id,
                filename=f"cv_{job_id}.pdf"
            )
            
            result["optimized_cv_pdf_url"] = pdf_url
            print(f"[Agent 4] ✓ PDF saved: {pdf_url}")
        
        # ===== 5. RECOMPUTE MATCH SCORE (Pillar 2 only) =====
        if mode == "pillar_2" and not dry_run:
            print(f"[Agent 4] Recomputing match score...")
            
            # This would require re-running Agent 2 logic with optimized CV
            # For now, we'll estimate improvement
            from skills.embeddings import compute_similarity
            
            job_text = f"{job['title']} {job['description']}"
            cv_text = optimized_markdown[:1000]  # First 1000 chars
            
            new_score = compute_similarity(job_text, cv_text)
            result["match_score_after"] = round(new_score, 2)
            result["match_score_delta"] = round(
                result["match_score_after"] - result["match_score_before"], 
                2
            )
            
            print(f"[Agent 4] New score: {result['match_score_after']} "
                  f"(Δ {result['match_score_delta']:+.2f})")
        
        # ===== 6. SAVE VERSION =====
        if not dry_run:
            cv_version_id = save_cv_version(
                user_id=user_id,
                job_id=job_id,
                content_markdown=result["optimized_cv_markdown"],
                pdf_url=result["optimized_cv_pdf_url"],
                match_score_before=result["match_score_before"],
                match_score_after=result["match_score_after"],
                pages_estimate=result["pages_estimate"]
            )
            
            result["cv_version_id"] = cv_version_id
            print(f"[Agent 4] ✓ Saved CV version {cv_version_id}")
        else:
            print(f"[Agent 4] DRY RUN: Would save CV version")
        
    except Exception as e:
        print(f"[Agent 4] ERROR: {e}")
        result["error"] = str(e)
        result["status"] = "failed"
    
    return result


def main():
    parser = argparse.ArgumentParser(
        description="Agent 4: CV Optimization - Tailor CV for specific job"
    )
    
    parser.add_argument("--job-id", required=True, help="Job UUID")
    parser.add_argument("--user-id", required=True, help="User UUID")
    parser.add_argument("--mode", choices=["pillar_1", "pillar_2"], default="pillar_2")
    parser.add_argument("--dry-run", action="store_true", help="Don't save to database")
    
    args = parser.parse_args()
    
    try:
        result = optimize_cv(
            job_id=args.job_id,
            user_id=args.user_id,
            mode=args.mode,
            dry_run=args.dry_run
        )
        
        print(f"\n{'='*60}")
        print(f"JOB ID: {result['job_id']}")
        print(f"MODE: {result['mode']}")
        print(f"PAGES: {result['pages_estimate']}")
        
        if result.get('match_score_delta'):
            print(f"MATCH SCORE: {result['match_score_before']:.2f} → "
                  f"{result['match_score_after']:.2f} "
                  f"({result['match_score_delta']:+.2f})")
        
        print(f"{'='*60}\n")
        
        sys.exit(0 if not result.get('error') else 1)
        
    except Exception as e:
        print(f"FATAL ERROR: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
