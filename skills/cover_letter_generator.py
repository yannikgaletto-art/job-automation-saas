#!/usr/bin/env python3
"""
Cover Letter Generator - Claude Sonnet 4 Integration

Generates personalized cover letters using job data, user profile, and company research.

Author: Pathly Team
Date: 2026-02-13
"""

import os
import json
from typing import Dict, Any, Optional
from anthropic import Anthropic
from retry import retry


class CoverLetterGenerator:
    """
    Generate personalized cover letters using Claude Sonnet 4.
    
    Features:
    - Uses company research for personalization
    - Adapts tone based on job requirements
    - Generates multiple drafts on request
    - Markdown output format
    """
    
    def __init__(self):
        self.api_key = os.getenv("ANTHROPIC_API_KEY")
        if not self.api_key:
            raise ValueError("ANTHROPIC_API_KEY not found in environment")
        
        self.client = Anthropic(api_key=self.api_key)
        self.model = "claude-sonnet-4-20250514"
        
    @retry(tries=3, delay=2, backoff=2)
    def generate(
        self,
        job_data: Dict[str, Any],
        user_profile: Dict[str, Any],
        company_intel: Optional[Dict[str, Any]] = None,
        tone: str = "professional"
    ) -> Dict[str, Any]:
        """
        Generate a cover letter.
        
        Args:
            job_data: Job title, description, requirements, company
            user_profile: User's skills, experience, achievements
            company_intel: Optional company research data
            tone: "professional", "enthusiastic", "technical"
            
        Returns:
            Dict with cover_letter (markdown), word_count, reasoning
        """
        # Build system prompt
        system_prompt = self._build_system_prompt(tone)
        
        # Build user prompt
        user_prompt = self._build_user_prompt(job_data, user_profile, company_intel)
        
        # Call Claude
        print(f"✍️  Generating cover letter for {job_data.get('title', 'Unknown Role')}...")
        
        response = self.client.messages.create(
            model=self.model,
            max_tokens=2000,
            temperature=0.7,
            system=system_prompt,
            messages=[
                {"role": "user", "content": user_prompt}
            ]
        )
        
        # Extract content
        cover_letter = response.content[0].text
        
        # Calculate metrics
        word_count = len(cover_letter.split())
        
        result = {
            "cover_letter": cover_letter,
            "word_count": word_count,
            "tone": tone,
            "model": self.model,
            "company_intel_used": company_intel is not None,
            "usage": {
                "input_tokens": response.usage.input_tokens,
                "output_tokens": response.usage.output_tokens
            }
        }
        
        print(f"✅ Generated {word_count} words")
        return result
    
    def _build_system_prompt(self, tone: str) -> str:
        """
        Build system prompt based on desired tone.
        """
        base = """
You are an expert cover letter writer specializing in job applications.

Your cover letters are:
- Personalized and authentic
- Concise (250-350 words)
- Achievement-focused
- Company-aware (when research provided)
- Formatted in clean Markdown

Structure:
1. Opening (why this role + company resonates)
2. Key Qualifications (2-3 relevant achievements)
3. Company Fit (connect to company values/news)
4. Closing (enthusiasm + call to action)

Avoid:
- Generic phrases ("I am writing to apply...")
- Repetition of resume
- Desperation or over-eagerness
- Buzzwords without substance
"""
        
        tone_guidance = {
            "professional": "\nTone: Professional, confident, warm.",
            "enthusiastic": "\nTone: Enthusiastic, energetic, genuine excitement.",
            "technical": "\nTone: Technical, detail-oriented, competency-focused."
        }
        
        return base + tone_guidance.get(tone, tone_guidance["professional"])
    
    def _build_user_prompt(self, job_data, user_profile, company_intel) -> str:
        """
        Build comprehensive user prompt with all context.
        """
        prompt = "# COVER LETTER REQUEST\n\n"
        
        # Job info
        prompt += "## JOB POSTING\n\n"
        prompt += f"**Position:** {job_data.get('title', 'N/A')}\n"
        prompt += f"**Company:** {job_data.get('company', 'N/A')}\n"
        prompt += f"**Location:** {job_data.get('location', 'N/A')}\n\n"
        
        if job_data.get("description"):
            # Truncate if too long
            desc = job_data["description"]
            if len(desc) > 2000:
                desc = desc[:2000] + "..."
            prompt += f"**Description:**\n{desc}\n\n"
        
        if job_data.get("requirements"):
            prompt += "**Key Requirements:**\n"
            reqs = job_data["requirements"]
            if isinstance(reqs, list):
                for req in reqs[:10]:  # Limit to 10
                    prompt += f"- {req}\n"
            else:
                prompt += f"{reqs}\n"
            prompt += "\n"
        
        # User profile
        prompt += "## APPLICANT PROFILE\n\n"
        prompt += f"**Name:** {user_profile.get('name', 'N/A')}\n"
        
        if user_profile.get("current_role"):
            prompt += f"**Current Role:** {user_profile['current_role']}\n"
        
        if user_profile.get("skills"):
            skills = user_profile["skills"]
            if isinstance(skills, list):
                prompt += f"**Skills:** {', '.join(skills[:15])}\n"  # Limit to 15
            else:
                prompt += f"**Skills:** {skills}\n"
        
        if user_profile.get("experience_years"):
            prompt += f"**Years of Experience:** {user_profile['experience_years']}\n"
        
        prompt += "\n**Key Achievements:**\n"
        if user_profile.get("achievements"):
            achievements = user_profile["achievements"]
            if isinstance(achievements, list):
                for achievement in achievements[:5]:  # Limit to 5
                    prompt += f"- {achievement}\n"
            else:
                prompt += f"{achievements}\n"
        else:
            prompt += "- (Highlight relevant experience from skills/background)\n"
        
        prompt += "\n"
        
        # Company intel
        if company_intel:
            prompt += "## COMPANY RESEARCH\n\n"
            
            if company_intel.get("mission"):
                prompt += f"**Mission:** {company_intel['mission']}\n\n"
            
            if company_intel.get("recent_news"):
                prompt += "**Recent News:**\n"
                for news in company_intel["recent_news"][:3]:
                    prompt += f"- {news}\n"
                prompt += "\n"
            
            if company_intel.get("culture"):
                prompt += "**Culture Highlights:**\n"
                for culture in company_intel["culture"][:3]:
                    prompt += f"- {culture}\n"
                prompt += "\n"
        
        # Instruction
        prompt += "---\n\n"
        prompt += "**TASK:** Write a compelling cover letter in Markdown format. "
        prompt += "Make it personal and authentic. Connect my background to this specific role and company.\n"
        
        return prompt


if __name__ == "__main__":
    # Test mode
    print("=" * 60)
    print("COVER LETTER GENERATOR TEST")
    print("=" * 60)
    
    generator = CoverLetterGenerator()
    
    # Test data
    test_job = {
        "title": "Senior Python Developer",
        "company": "TechCorp GmbH",
        "location": "Berlin, Germany",
        "description": "We're looking for an experienced Python developer to join our AI team...",
        "requirements": [
            "5+ years Python experience",
            "Django/FastAPI",
            "AWS/Docker",
            "Team leadership experience"
        ]
    }
    
    test_profile = {
        "name": "Max Mustermann",
        "current_role": "Python Developer at StartupCo",
        "skills": ["Python", "Django", "PostgreSQL", "AWS", "Docker", "CI/CD"],
        "experience_years": 6,
        "achievements": [
            "Built microservices platform serving 1M+ users",
            "Reduced API latency by 60% through optimization",
            "Mentored 3 junior developers"
        ]
    }
    
    test_intel = {
        "mission": "TechCorp democratizes AI for small businesses.",
        "recent_news": [
            "Series B funding €50M (January 2026)",
            "Launched new AI platform (December 2025)"
        ],
        "culture": [
            "Remote-first company",
            "Strong focus on work-life balance"
        ]
    }
    
    result = generator.generate(test_job, test_profile, test_intel)
    
    print("\n" + "=" * 60)
    print("GENERATED COVER LETTER")
    print("=" * 60)
    print(f"\nWord Count: {result['word_count']}")
    print(f"Model: {result['model']}")
    print(f"\n{result['cover_letter']}")
