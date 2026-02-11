#!/usr/bin/env python3
"""
Jina Reader API Wrapper

Purpose: Convert HTML to LLM-ready Markdown for job descriptions.

Why Jina Reader?
- Traditional: HTML → BeautifulSoup → Regex → JSON → LLM (slow, brittle)
- Jina Reader: HTML → 1 API Call → Clean Markdown → LLM (fast, reliable)

Features:
- Automatic HTML → Markdown conversion
- Redis caching (avoid duplicate conversions)
- Cost tracking (important for free tier: 1M tokens)
- Retry logic with exponential backoff
- Error handling

Usage:
    from skills.jina_reader import JinaReader
    
    reader = JinaReader(api_key=os.getenv('JINA_READER_API_KEY'))
    
    # Convert HTML to Markdown
    markdown = reader.html_to_markdown(html_content)
    
    # Or directly from URL
    markdown = reader.url_to_markdown('https://linkedin.com/jobs/view/12345')

Cost Estimation:
- Free Tier: 1M tokens/month
- Paid: $0.20 per 1M tokens
- Average job: ~2k tokens
- Free tier = ~500 jobs/month
- 100k jobs/month = ~$40

See: https://jina.ai/reader
"""

import os
import requests
import hashlib
import json
from typing import Optional, Dict, Any
from datetime import datetime, timedelta
import logging
import time

logger = logging.getLogger(__name__)


class JinaReaderError(Exception):
    """Custom exception for Jina Reader API errors"""
    pass


class JinaReader:
    """
    Wrapper for Jina Reader API.
    
    Converts HTML to LLM-ready Markdown with caching and cost tracking.
    """
    
    BASE_URL = "https://r.jina.ai/"
    
    def __init__(
        self,
        api_key: Optional[str] = None,
        redis_client: Optional[Any] = None,
        cache_ttl: int = 604800,  # 7 days in seconds
        max_retries: int = 3
    ):
        """
        Initialize Jina Reader.
        
        Args:
            api_key: Jina API key (optional for public endpoints)
            redis_client: Redis client for caching (optional)
            cache_ttl: Cache time-to-live in seconds (default: 7 days)
            max_retries: Maximum retry attempts (default: 3)
        """
        self.api_key = api_key or os.getenv('JINA_READER_API_KEY')
        self.redis_client = redis_client
        self.cache_ttl = cache_ttl
        self.max_retries = max_retries
        
        # Cost tracking
        self.tokens_used = 0
        self.requests_count = 0
        
        logger.info(
            f"JinaReader initialized. "
            f"API Key: {'✓' if self.api_key else '✗'}, "
            f"Cache: {'✓' if self.redis_client else '✗'}"
        )
    
    def _get_cache_key(self, content: str) -> str:
        """
        Generate cache key from content hash.
        
        Args:
            content: HTML content or URL
            
        Returns:
            Cache key (MD5 hash)
        """
        return f"jina:md:{hashlib.md5(content.encode()).hexdigest()}"
    
    def _get_from_cache(self, cache_key: str) -> Optional[str]:
        """
        Retrieve markdown from cache.
        
        Args:
            cache_key: Redis cache key
            
        Returns:
            Cached markdown or None
        """
        if not self.redis_client:
            return None
        
        try:
            cached = self.redis_client.get(cache_key)
            if cached:
                logger.info(f"Cache HIT: {cache_key[:16]}...")
                return cached.decode('utf-8') if isinstance(cached, bytes) else cached
        except Exception as e:
            logger.warning(f"Cache retrieval failed: {e}")
        
        return None
    
    def _set_cache(self, cache_key: str, markdown: str) -> None:
        """
        Store markdown in cache.
        
        Args:
            cache_key: Redis cache key
            markdown: Markdown content to cache
        """
        if not self.redis_client:
            return
        
        try:
            self.redis_client.setex(
                cache_key,
                self.cache_ttl,
                markdown
            )
            logger.info(f"Cache SET: {cache_key[:16]}... (TTL: {self.cache_ttl}s)")
        except Exception as e:
            logger.warning(f"Cache storage failed: {e}")
    
    def _make_request(
        self,
        url: str,
        params: Optional[Dict[str, Any]] = None,
        headers: Optional[Dict[str, str]] = None
    ) -> str:
        """
        Make request to Jina Reader API with retry logic.
        
        Args:
            url: Target URL or data URI
            params: Query parameters
            headers: Request headers
            
        Returns:
            Markdown response
            
        Raises:
            JinaReaderError: If request fails after retries
        """
        if headers is None:
            headers = {}
        
        # Add API key if available
        if self.api_key:
            headers['Authorization'] = f'Bearer {self.api_key}'
        
        # Retry with exponential backoff
        for attempt in range(self.max_retries):
            try:
                response = requests.get(
                    url,
                    params=params,
                    headers=headers,
                    timeout=30
                )
                
                response.raise_for_status()
                
                # Track usage
                self.requests_count += 1
                
                # Estimate tokens (rough: 1 token ≈ 4 chars)
                markdown = response.text
                self.tokens_used += len(markdown) // 4
                
                logger.info(
                    f"Jina API success (attempt {attempt + 1}). "
                    f"Output: {len(markdown)} chars, ~{len(markdown) // 4} tokens"
                )
                
                return markdown
                
            except requests.exceptions.HTTPError as e:
                if e.response.status_code == 429:  # Rate limit
                    wait_time = 2 ** attempt  # Exponential backoff
                    logger.warning(
                        f"Rate limit hit. Waiting {wait_time}s (attempt {attempt + 1}/{self.max_retries})"
                    )
                    time.sleep(wait_time)
                    continue
                else:
                    logger.error(f"HTTP error: {e.response.status_code} - {e.response.text}")
                    raise JinaReaderError(f"HTTP {e.response.status_code}: {e.response.text}")
            
            except requests.exceptions.RequestException as e:
                logger.warning(f"Request failed (attempt {attempt + 1}/{self.max_retries}): {e}")
                if attempt == self.max_retries - 1:
                    raise JinaReaderError(f"Request failed after {self.max_retries} attempts: {e}")
                time.sleep(2 ** attempt)
        
        raise JinaReaderError("Max retries exceeded")
    
    def html_to_markdown(self, html: str, include_links_summary: bool = True) -> str:
        """
        Convert HTML to Markdown.
        
        Args:
            html: Raw HTML content
            include_links_summary: Include summary of all links (default: True)
            
        Returns:
            Clean Markdown
            
        Example:
            >>> html = '<h1>Job Title</h1><p>Description...</p>'
            >>> markdown = reader.html_to_markdown(html)
            >>> print(markdown)
            # Job Title
            Description...
        """
        # Check cache
        cache_key = self._get_cache_key(html)
        cached_markdown = self._get_from_cache(cache_key)
        if cached_markdown:
            return cached_markdown
        
        # Convert HTML to data URI
        # Note: For large HTML, consider using base64 encoding
        data_uri = f"data:text/html,{html}"
        
        # Prepare headers
        headers = {}
        if include_links_summary:
            headers['X-With-Links-Summary'] = 'true'
        
        # Make request
        markdown = self._make_request(
            self.BASE_URL,
            params={'url': data_uri},
            headers=headers
        )
        
        # Cache result
        self._set_cache(cache_key, markdown)
        
        return markdown
    
    def url_to_markdown(self, url: str, include_links_summary: bool = True) -> str:
        """
        Convert URL to Markdown (Jina fetches and converts).
        
        Args:
            url: Job posting URL
            include_links_summary: Include summary of all links (default: True)
            
        Returns:
            Clean Markdown
            
        Example:
            >>> url = 'https://boards.greenhouse.io/company/jobs/12345'
            >>> markdown = reader.url_to_markdown(url)
            >>> print(markdown)
            # Senior Python Developer
            ...
        """
        # Check cache
        cache_key = self._get_cache_key(url)
        cached_markdown = self._get_from_cache(cache_key)
        if cached_markdown:
            return cached_markdown
        
        # Prepare headers
        headers = {}
        if include_links_summary:
            headers['X-With-Links-Summary'] = 'true'
        
        # Make request
        markdown = self._make_request(
            f"{self.BASE_URL}{url}",
            headers=headers
        )
        
        # Cache result
        self._set_cache(cache_key, markdown)
        
        return markdown
    
    def get_usage_stats(self) -> Dict[str, Any]:
        """
        Get usage statistics.
        
        Returns:
            Dictionary with usage stats
            
        Example:
            >>> stats = reader.get_usage_stats()
            >>> print(stats)
            {
                'requests': 42,
                'tokens_used': 84000,
                'estimated_cost': 0.017,
                'free_tier_remaining': 916000
            }
        """
        FREE_TIER_LIMIT = 1_000_000  # 1M tokens
        COST_PER_MILLION = 0.20
        
        free_tier_remaining = max(0, FREE_TIER_LIMIT - self.tokens_used)
        estimated_cost = max(0, (self.tokens_used - FREE_TIER_LIMIT) / 1_000_000 * COST_PER_MILLION)
        
        return {
            'requests': self.requests_count,
            'tokens_used': self.tokens_used,
            'estimated_cost': round(estimated_cost, 3),
            'free_tier_remaining': free_tier_remaining,
            'free_tier_percentage': round((free_tier_remaining / FREE_TIER_LIMIT) * 100, 1)
        }
    
    def reset_stats(self) -> None:
        """Reset usage statistics."""
        self.tokens_used = 0
        self.requests_count = 0
        logger.info("Usage stats reset")


# Example usage
if __name__ == "__main__":
    # Initialize
    reader = JinaReader()
    
    # Test HTML conversion
    test_html = """
    <div class="job-posting">
        <h1>Senior Python Developer</h1>
        <h2>Requirements</h2>
        <ul>
            <li>5+ years Python experience</li>
            <li>Django/Flask knowledge</li>
            <li>AWS/GCP deployment</li>
        </ul>
        <h2>Benefits</h2>
        <p>Remote work, competitive salary, health insurance.</p>
    </div>
    """
    
    markdown = reader.html_to_markdown(test_html)
    print("\n=== MARKDOWN OUTPUT ===")
    print(markdown)
    
    # Show usage stats
    print("\n=== USAGE STATS ===")
    stats = reader.get_usage_stats()
    print(json.dumps(stats, indent=2))
