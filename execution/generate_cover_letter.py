#!/usr/bin/env python3
"""
Cover Letter Generation - Execution Script

Orchestrates company research + cover letter generation.

Usage:
    python execution/generate_cover_letter.py --job-id <uuid> --user-id <uuid>
    python execution/generate_cover_letter.py --job-id <uuid> --user-id <uuid> --dry-run

Author: Pathly Team
Date: 2026-02-13
"""

import sys
import os
import argparse
import json
from datetime import datetime
from typing import Optional, Dict, Any

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from skills.company_research import CompanyResearcher
from skills.cover_letter_generator import CoverLetterGenerator

# Supabase (lazy import)
try:
    from supabase import create_client, Client
    SUPABASE_AVAILABLE = True
except ImportError:
    SUPABASE_AVAILABLE = False
    print("⚠️  supabase-py not installed. Run: pip install supabase")


class CoverLetterOrchestrator:
    """
    Orchestrates cover letter generation pipeline.
    
    Pipeline:
    1. Fetch job data from Supabase
    2. Fetch user profile
    3. Research company (with caching)
    4. Generate cover letter
    5. Store result in Supabase
    """
    
    def __init__(self, dry_run: bool = False):
        self.dry_run = dry_run
        self.supabase = self._init_supabase()
        
        # Initialize skills
        self.researcher = CompanyResearcher(supabase_client=self.supabase)
        self.generator = CoverLetterGenerator()
        
        print(f"\n{'=' * 60}")
        print(f"COVER LETTER GENERATOR{' (DRY RUN)' if dry_run else ''}")
        print(f"{'=' * 60}\n")
    
    def _init_supabase(self) -> Optional[Client]:
        """
        Initialize Supabase client.
        """
        if self.dry_run:
            print("🔍 Dry run mode - Supabase disabled\n")
            return None
        
        if not SUPABASE_AVAILABLE:
            raise ImportError("supabase-py required. Install: pip install supabase")
        
        url = os.getenv("SUPABASE_URL")
        key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        
        if not url or not key:
            raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required")
        
        return create_client(url, key)
    
    def generate(self, job_id: str, user_id: str, tone: str = "professional") -> Dict[str, Any]:
        """
        Generate cover letter for job + user.
        
        Args:
            job_id: Job UUID
            user_id: User UUID
            tone: professional|enthusiastic|technical
            
        Returns:
            Result dict with cover_letter, stats, etc.
        """
        print(f"🎯 Job ID: {job_id}")
        print(f"👤 User ID: {user_id}")
        print(f"🎨 Tone: {tone}\n")
        
        # Step 1: Fetch job data
        print("[1/5] Fetching job data...")
        job_data = self._fetch_job_data(job_id)
        company_name = job_data.get("company", "Unknown Company")
        print(f"  ✅ {job_data.get('title')} @ {company_name}\n")
        
        # Step 2: Fetch user profile
        print("[2/5] Fetching user profile...")
        user_profile = self._fetch_user_profile(user_id)
        print(f"  ✅ {user_profile.get('name', 'Unknown User')}\n")
        
        # Step 3: Research company
        print("[3/5] Researching company...")
        company_intel = None
        try:
            company_intel = self.researcher.research_company(company_name)
            print(f"  ✅ Research complete ({len(company_intel.get('citations', []))} sources)\n")
        except Exception as e:
            print(f"  ⚠️  Research failed: {e}")
            print("  ↪ Continuing without company intel\n")
        
        # Step 4: Generate cover letter
        print("[4/5] Generating cover letter...")
        result = self.generator.generate(
            job_data=job_data,
            user_profile=user_profile,
            company_intel=company_intel,
            tone=tone
        )
        print(f"  ✅ Generated {result['word_count']} words\n")
        
        # Step 5: Store in database
        print("[5/5] Storing result...")
        if not self.dry_run:
            stored_id = self._store_cover_letter(job_id, user_id, result)
            print(f"  ✅ Stored with ID: {stored_id}\n")
        else:
            print("  🔍 Skipped (dry run)\n")
        
        # Final output
        print("=" * 60)
        print("GENERATED COVER LETTER")
        print("=" * 60)
        print(result["cover_letter"])
        print("\n" + "=" * 60)
        print(f"Word Count: {result['word_count']}")
        print(f"Tokens: {result['usage']['input_tokens']} in / {result['usage']['output_tokens']} out")
        print("=" * 60 + "\n")
        
        return result
    
    def _fetch_job_data(self, job_id: str) -> Dict[str, Any]:
        """
        Fetch job data from job_queue.
        """
        if self.dry_run:
            # Mock data for dry run
            return {
                "job_id": job_id,
                "title": "Senior Software Engineer",
                "company": "Example Corp",
                "location": "Berlin, Germany",
                "description": "We're looking for a skilled engineer...",
                "requirements": ["Python", "Docker", "AWS"]
            }
        
        result = self.supabase.table("job_queue").select("*").eq("job_id", job_id).execute()
        
        if not result.data or len(result.data) == 0:
            raise ValueError(f"Job {job_id} not found")
        
        return result.data[0]
    
    def _fetch_user_profile(self, user_id: str) -> Dict[str, Any]:
        """
        Fetch user profile from users table.
        """
        if self.dry_run:
            # Mock data for dry run
            return {
                "user_id": user_id,
                "name": "Max Mustermann",
                "email": "max@example.com",
                "skills": ["Python", "JavaScript", "PostgreSQL"],
                "experience_years": 5,
                "achievements": [
                    "Built platform serving 500K users",
                    "Led team of 4 developers"
                ]
            }
        
        result = self.supabase.table("users").select("*").eq("user_id", user_id).execute()
        
        if not result.data or len(result.data) == 0:
            raise ValueError(f"User {user_id} not found")
        
        return result.data[0]
    
    def _store_cover_letter(self, job_id: str, user_id: str, result: Dict[str, Any]) -> str:
        """
        Store generated cover letter in cover_letters table.
        """
        data = {
            "job_id": job_id,
            "user_id": user_id,
            "cover_letter_markdown": result["cover_letter"],
            "word_count": result["word_count"],
            "tone": result["tone"],
            "model_used": result["model"],
            "company_intel_used": result["company_intel_used"],
            "generation_metadata": result["usage"]
        }
        
        stored = self.supabase.table("cover_letters").insert(data).execute()
        
        if not stored.data or len(stored.data) == 0:
            raise ValueError("Failed to store cover letter")
        
        return stored.data[0]["cover_letter_id"]


def main():
    parser = argparse.ArgumentParser(
        description="Generate personalized cover letter for job application"
    )
    parser.add_argument(
        "--job-id",
        required=True,
        help="Job UUID from job_queue"
    )
    parser.add_argument(
        "--user-id",
        required=True,
        help="User UUID"
    )
    parser.add_argument(
        "--tone",
        choices=["professional", "enthusiastic", "technical"],
        default="professional",
        help="Cover letter tone"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Test mode - don't access database"
    )
    
    args = parser.parse_args()
    
    try:
        orchestrator = CoverLetterOrchestrator(dry_run=args.dry_run)
        result = orchestrator.generate(
            job_id=args.job_id,
            user_id=args.user_id,
            tone=args.tone
        )
        
        print("✅ SUCCESS!\n")
        sys.exit(0)
        
    except Exception as e:
        print(f"\n❌ ERROR: {e}\n")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
