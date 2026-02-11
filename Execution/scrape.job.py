#!/usr/bin/env python3
"""
Agent 1: Job Discovery Execution Script

Directive: directives/job_discovery.md
Purpose: Scrape job data with 3-stage fallback (Playwright → ScraperAPI → Alternative Sources)
"""

import os
import sys
import json
import argparse
from datetime import datetime
from typing import Optional, Dict, List

# Import skills
try:
    from skills.web_scraper import scrape_with_playwright, scrape_with_scraper_api
    from skills.serp_search import find_alternative_job_urls
    from skills.database import save_job_to_queue, check_job_duplicate
except ImportError as e:
    print(f"ERROR: Missing required skill module: {e}")
    print("Make sure skills/ folder contains: web_scraper.py, serp_search.py, database.py")
    sys.exit(1)


def scrape_job(
    mode: str,
    job_url: Optional[str] = None,
    search_query: Optional[str] = None,
    location: Optional[str] = None,
    user_id: Optional[str] = None,
    dry_run: bool = False
) -> Dict:
    """
    Execute Agent 1: Job Discovery
    
    Args:
        mode: 'manual' or 'auto'
        job_url: URL for manual mode
        search_query: Query for auto mode
        location: Location for auto mode
        user_id: User ID for tracking
        dry_run: If True, don't save to database
    
    Returns:
        Dict with job data or error info
    """
    
    result = {
        "status": "pending",
        "job_data": None,
        "error": None,
        "fallback_used": None,
        "scraped_at": datetime.utcnow().isoformat()
    }
    
    try:
        # ===== STAGE 1: PRIMARY SCRAPE (PLAYWRIGHT) =====
        print(f"[Agent 1] Starting primary scrape...")
        
        if mode == "manual":
            if not job_url:
                raise ValueError("job_url required for manual mode")
            
            job_data = scrape_with_playwright(job_url)
            
        elif mode == "auto":
            if not search_query or not location:
                raise ValueError("search_query and location required for auto mode")
            
            # For auto mode, scrape_with_playwright should handle platform-specific search
            job_data = scrape_with_playwright(
                search_query=search_query,
                location=location,
                limit=50
            )
        else:
            raise ValueError(f"Invalid mode: {mode}")
        
        # Validate scraped data
        if not validate_job_data(job_data):
            raise ValueError("Primary scrape failed validation")
        
        result["status"] = "success"
        result["job_data"] = job_data
        result["fallback_used"] = "none"
        
    except Exception as primary_error:
        print(f"[Agent 1] Primary scrape failed: {primary_error}")
        
        # ===== STAGE 2: FALLBACK TO SCRAPERAPI =====
        try:
            print(f"[Agent 1] Trying ScraperAPI fallback...")
            job_data = scrape_with_scraper_api(job_url or search_query)
            
            if validate_job_data(job_data):
                result["status"] = "success"
                result["job_data"] = job_data
                result["fallback_used"] = "scraper_api"
            else:
                raise ValueError("ScraperAPI data invalid")
                
        except Exception as scraper_api_error:
            print(f"[Agent 1] ScraperAPI failed: {scraper_api_error}")
            
            # ===== STAGE 3: ALTERNATIVE SOURCE DISCOVERY =====
            try:
                print(f"[Agent 1] Searching for alternative sources...")
                
                # Extract what we know about the job
                company = job_data.get("company") if job_data else None
                title = job_data.get("title") if job_data else search_query
                loc = job_data.get("location") if job_data else location
                
                # Find alternative URLs (max 2)
                alternative_urls = find_alternative_job_urls(
                    job_title=title,
                    company=company,
                    location=loc
                )
                
                # Try each alternative
                for alt_url in alternative_urls[:2]:
                    print(f"[Agent 1] Trying alternative: {alt_url}")
                    
                    try:
                        alt_job_data = scrape_with_playwright(alt_url)
                        
                        if validate_job_data(alt_job_data):
                            result["status"] = "success"
                            result["job_data"] = alt_job_data
                            result["fallback_used"] = f"alternative_source:{alt_url}"
                            break
                    except:
                        continue
                
                if result["status"] != "success":
                    raise ValueError("All alternative sources failed")
                    
            except Exception as alt_error:
                print(f"[Agent 1] All scraping methods failed: {alt_error}")
                result["status"] = "failed"
                result["error"] = "all_sources_failed"
    
    # ===== DEDUPLICATION CHECK =====
    if result["status"] == "success" and not dry_run:
        is_duplicate = check_job_duplicate(
            job_url=result["job_data"].get("job_url"),
            company=result["job_data"].get("company"),
            title=result["job_data"].get("title"),
            location=result["job_data"].get("location")
        )
        
        if is_duplicate:
            print(f"[Agent 1] Duplicate detected, updating last_seen_at")
            result["status"] = "duplicate"
    
    # ===== SAVE TO DATABASE =====
    if result["status"] == "success" and not dry_run:
        job_id = save_job_to_queue(
            job_data=result["job_data"],
            user_id=user_id,
            status="scraped",
            fallback_used=result["fallback_used"]
        )
        result["job_id"] = job_id
        print(f"[Agent 1] ✓ Saved job {job_id} to job_queue")
    
    elif dry_run:
        print(f"[Agent 1] DRY RUN: Would save {result['job_data']['title']}")
    
    return result


def validate_job_data(job_data: Optional[Dict]) -> bool:
    """
    Validate that job data has minimum required fields
    """
    if not job_data:
        return False
    
    required = ["title", "company", "location", "description"]
    
    for field in required:
        if not job_data.get(field):
            return False
        
        # Check minimum length
        if len(str(job_data[field])) < 3:
            return False
    
    return True


def main():
    parser = argparse.ArgumentParser(
        description="Agent 1: Job Discovery - Scrape job postings with smart fallback"
    )
    
    parser.add_argument("--mode", required=True, choices=["manual", "auto"])
    parser.add_argument("--job-url", help="Job URL for manual mode")
    parser.add_argument("--search-query", help="Search query for auto mode")
    parser.add_argument("--location", help="Location for auto mode")
    parser.add_argument("--user-id", help="User ID for tracking")
    parser.add_argument("--dry-run", action="store_true", help="Don't save to database")
    
    args = parser.parse_args()
    
    try:
        result = scrape_job(
            mode=args.mode,
            job_url=args.job_url,
            search_query=args.search_query,
            location=args.location,
            user_id=args.user_id,
            dry_run=args.dry_run
        )
        
        print(f"\n{'='*60}")
        print(f"STATUS: {result['status']}")
        print(f"FALLBACK USED: {result['fallback_used']}")
        if result['job_data']:
            print(f"JOB: {result['job_data']['title']} at {result['job_data']['company']}")
        print(f"{'='*60}\n")
        
        # Exit code
        sys.exit(0 if result["status"] in ["success", "duplicate"] else 1)
        
    except Exception as e:
        print(f"FATAL ERROR: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
