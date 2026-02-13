#!/usr/bin/env python3
"""
Company Research Skill - Perplexity API Integration

Uses Perplexity Sonar API to research companies for personalized cover letters.
Caches results in Supabase for 7 days.

Author: Pathly Team
Date: 2026-02-13
"""

import os
import json
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
import requests
from retry import retry


class CompanyResearcher:
    """
    Research companies using Perplexity API.
    
    Features:
    - Company values & mission
    - Recent news (6 months)
    - 7-day caching in Supabase
    - Citations for transparency
    """
    
    def __init__(self, supabase_client=None):
        self.api_key = os.getenv("PERPLEXITY_API_KEY")
        if not self.api_key:
            raise ValueError("PERPLEXITY_API_KEY not found in environment")
        
        self.api_url = "https://api.perplexity.ai/chat/completions"
        self.model = "sonar-pro"
        self.supabase = supabase_client
        
    def research_company(self, company_name: str, force_refresh: bool = False) -> Dict[str, Any]:
        """
        Research a company. Checks cache first unless force_refresh=True.
        
        Args:
            company_name: Company name to research
            force_refresh: Skip cache and force new research
            
        Returns:
            Dict with company intel and citations
        """
        # Check cache
        if not force_refresh and self.supabase:
            cached = self._get_cached_research(company_name)
            if cached:
                print(f"✅ Using cached research for {company_name}")
                return cached
        
        # Perform research
        print(f"🔍 Researching {company_name}...")
        intel = self._fetch_from_perplexity(company_name)
        
        # Cache result
        if self.supabase:
            self._cache_research(company_name, intel)
        
        return intel
    
    def _get_cached_research(self, company_name: str) -> Optional[Dict[str, Any]]:
        """
        Get cached research from Supabase if not expired.
        """
        try:
            result = self.supabase.table("company_research").select("*").eq(
                "company_name", company_name
            ).gte(
                "expires_at", datetime.utcnow().isoformat()
            ).execute()
            
            if result.data and len(result.data) > 0:
                data = result.data[0]
                return {
                    "company_name": data["company_name"],
                    "intel_data": data["intel_data"],
                    "perplexity_citations": data["perplexity_citations"],
                    "researched_at": data["researched_at"],
                    "cached": True
                }
        except Exception as e:
            print(f"⚠️  Cache lookup failed: {e}")
        
        return None
    
    @retry(tries=3, delay=2, backoff=2)
    def _fetch_from_perplexity(self, company_name: str) -> Dict[str, Any]:
        """
        Fetch company research from Perplexity API.
        """
        prompt = f"""
Research the company "{company_name}" and provide:

1. Company Mission & Values (2-3 sentences)
2. Recent News (last 6 months, top 3 stories with dates)
3. Culture & Work Environment (2-3 key points)
4. Notable Achievements or Recognition

Provide factual, up-to-date information with sources.
"""
        
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": self.model,
            "messages": [
                {
                    "role": "system",
                    "content": "You are a professional company researcher. Provide accurate, sourced information."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            "temperature": 0.2,
            "max_tokens": 1000,
            "return_citations": True
        }
        
        response = requests.post(self.api_url, headers=headers, json=payload, timeout=30)
        response.raise_for_status()
        
        data = response.json()
        
        # Extract content and citations
        content = data["choices"][0]["message"]["content"]
        citations = data.get("citations", [])
        
        # Parse structured data (simple extraction)
        intel = self._parse_research_content(content)
        intel["raw_content"] = content
        intel["citations"] = citations
        
        return intel
    
    def _parse_research_content(self, content: str) -> Dict[str, Any]:
        """
        Parse Perplexity response into structured format.
        Simple extraction - can be enhanced with LLM parsing later.
        """
        lines = content.split("\n")
        
        intel = {
            "mission": "",
            "recent_news": [],
            "culture": [],
            "achievements": []
        }
        
        current_section = None
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
            
            # Detect sections
            if "mission" in line.lower() or "values" in line.lower():
                current_section = "mission"
                continue
            elif "news" in line.lower() or "recent" in line.lower():
                current_section = "news"
                continue
            elif "culture" in line.lower() or "environment" in line.lower():
                current_section = "culture"
                continue
            elif "achievement" in line.lower() or "recognition" in line.lower():
                current_section = "achievements"
                continue
            
            # Add content to current section
            if current_section == "mission" and intel["mission"] == "":
                intel["mission"] = line
            elif current_section == "news" and line.startswith("-"):
                intel["recent_news"].append(line[1:].strip())
            elif current_section == "culture" and line.startswith("-"):
                intel["culture"].append(line[1:].strip())
            elif current_section == "achievements" and line.startswith("-"):
                intel["achievements"].append(line[1:].strip())
        
        return intel
    
    def _cache_research(self, company_name: str, intel: Dict[str, Any]):
        """
        Cache research in Supabase for 7 days.
        """
        try:
            expires_at = (datetime.utcnow() + timedelta(days=7)).isoformat()
            
            # Prepare data without raw citations (too large)
            cache_data = {
                "company_name": company_name,
                "intel_data": {
                    "mission": intel.get("mission", ""),
                    "recent_news": intel.get("recent_news", []),
                    "culture": intel.get("culture", []),
                    "achievements": intel.get("achievements", [])
                },
                "perplexity_citations": intel.get("citations", [])[:10],  # Limit to 10
                "expires_at": expires_at
            }
            
            # Upsert (insert or update)
            self.supabase.table("company_research").upsert(
                cache_data,
                on_conflict="company_name"
            ).execute()
            
            print(f"✅ Cached research for {company_name} (expires: {expires_at})")
        except Exception as e:
            print(f"⚠️  Failed to cache research: {e}")


if __name__ == "__main__":
    # Test mode
    print("=" * 60)
    print("COMPANY RESEARCH TEST")
    print("=" * 60)
    
    researcher = CompanyResearcher()
    
    test_company = "SAP SE"
    print(f"\nResearching: {test_company}\n")
    
    intel = researcher.research_company(test_company)
    
    print("\n" + "=" * 60)
    print("RESULTS")
    print("=" * 60)
    print(f"\nMission: {intel.get('mission', 'N/A')}")
    print(f"\nRecent News:")
    for news in intel.get("recent_news", []):
        print(f"  - {news}")
    print(f"\nCulture:")
    for culture in intel.get("culture", []):
        print(f"  - {culture}")
    print(f"\nCitations: {len(intel.get('citations', []))} sources")
