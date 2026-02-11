#!/usr/bin/env python3
"""
Agent 3: Company Research Execution Script

Directive: directives/company_research.md
Purpose: Research company using Perplexity API with smart caching
"""

import os
import sys
import json
import argparse
from datetime import datetime, timedelta
from typing import Dict, Optional

# Import skills
try:
    from skills.perplexity_client import research_company_with_perplexity
    from skills.serp_search import fallback_company_research
    from skills.database import get_company_intel, save_company_intel
except ImportError as e:
    print(f"ERROR: Missing required skill module: {e}")
    sys.exit(1)


def research_company(
    company_name: str,
    job_id: Optional[str] = None,
    force_refresh: bool = False,
    dry_run: bool = False
) -> Dict:
    """
    Execute Agent 3: Company Research
    
    Args:
        company_name: Name of company to research
        job_id: Optional job ID for linking
        force_refresh: Ignore cache, always fetch fresh data
        dry_run: If True, don't save to database
    
    Returns:
        Dict with company intel
    """
    
    result = {
        "company_name": company_name,
        "job_id": job_id,
        "intel": None,
        "cache_used": False,
        "source": None,
        "researched_at": datetime.utcnow().isoformat()
    }
    
    try:
        # ===== 1. CHECK CACHE =====
        if not force_refresh:
            print(f"[Agent 3] Checking cache for {company_name}...")
            cached_intel = get_company_intel(company_name)
            
            if cached_intel:
                cached_at = datetime.fromisoformat(cached_intel["researched_at"])
                age_days = (datetime.utcnow() - cached_at).days
                
                # Cache rules from directive:
                # - Structural data (values, vision): 30 days
                # - Recent news: 7 days
                
                if age_days < 7:
                    # Full cache hit
                    print(f"[Agent 3] ✓ Cache hit ({age_days} days old)")
                    result["intel"] = cached_intel
                    result["cache_used"] = True
                    result["source"] = "cache_full"
                    return result
                
                elif age_days < 30:
                    # Partial cache hit (reuse structure, refresh news)
                    print(f"[Agent 3] Partial cache hit ({age_days} days old), refreshing news...")
                    result["cache_used"] = True
                    result["source"] = "cache_partial"
                    
                    # Keep old intel, will merge with fresh news below
                    old_intel = cached_intel
        
        # ===== 2. FETCH FRESH DATA (PERPLEXITY) =====
        print(f"[Agent 3] Researching {company_name} with Perplexity...")
        
        try:
            fresh_intel = research_company_with_perplexity(
                company_name=company_name,
                search_recency="month"  # Last 3 months news
            )
            
            result["intel"] = fresh_intel
            result["source"] = "perplexity"
            
        except Exception as perplexity_error:
            print(f"[Agent 3] Perplexity failed: {perplexity_error}")
            
            # ===== 3. FALLBACK TO SERP API =====
            print(f"[Agent 3] Trying SERP fallback...")
            
            try:
                fallback_intel = fallback_company_research(company_name)
                result["intel"] = fallback_intel
                result["source"] = "serp_fallback"
                
            except Exception as serp_error:
                print(f"[Agent 3] SERP failed: {serp_error}")
                
                # ===== 4. MINIMAL INTEL =====
                result["intel"] = {
                    "company_name": company_name,
                    "founded": None,
                    "core_values": [],
                    "recent_news": [],
                    "vision": None,
                    "culture_notes": [],
                    "suggested_quotes": [],
                    "citations": [],
                    "intel_source": "sparse"
                }
                result["source"] = "sparse"
                print(f"[Agent 3] ⚠️ Minimal intel only")
        
        # ===== 5. MERGE WITH PARTIAL CACHE (if applicable) =====
        if result.get("cache_used") and result["source"] == "cache_partial":
            # Keep old structural data, use new news
            result["intel"]["founded"] = old_intel.get("founded")
            result["intel"]["core_values"] = old_intel.get("core_values", [])
            result["intel"]["vision"] = old_intel.get("vision")
            result["intel"]["culture_notes"] = old_intel.get("culture_notes", [])
        
        # ===== 6. SAVE TO DATABASE =====
        if not dry_run and result["source"] != "cache_full":
            save_company_intel(
                company_name=company_name,
                intel=result["intel"],
                source=result["source"]
            )
            print(f"[Agent 3] ✓ Saved intel for {company_name}")
        elif dry_run:
            print(f"[Agent 3] DRY RUN: Would save intel")
        
    except Exception as e:
        print(f"[Agent 3] ERROR: {e}")
        result["intel"] = None
        result["error"] = str(e)
    
    return result


def main():
    parser = argparse.ArgumentParser(
        description="Agent 3: Company Research - Fetch company intelligence"
    )
    
    parser.add_argument("--company", required=True, help="Company name")
    parser.add_argument("--job-id", help="Job UUID (optional)")
    parser.add_argument("--force-refresh", action="store_true", help="Ignore cache")
    parser.add_argument("--dry-run", action="store_true", help="Don't save to database")
    
    args = parser.parse_args()
    
    try:
        result = research_company(
            company_name=args.company,
            job_id=args.job_id,
            force_refresh=args.force_refresh,
            dry_run=args.dry_run
        )
        
        print(f"\n{'='*60}")
        print(f"COMPANY: {result['company_name']}")
        print(f"SOURCE: {result['source']}")
        print(f"CACHE USED: {result['cache_used']}")
        
        if result['intel']:
            print(f"\nINTEL SUMMARY:")
            print(f"  Founded: {result['intel'].get('founded', 'N/A')}")
            print(f"  Values: {len(result['intel'].get('core_values', []))} items")
            print(f"  News: {len(result['intel'].get('recent_news', []))} items")
            print(f"  Vision: {result['intel'].get('vision', 'N/A')[:50]}...")
        
        print(f"{'='*60}\n")
        
        sys.exit(0 if result['intel'] else 1)
        
    except Exception as e:
        print(f"FATAL ERROR: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
