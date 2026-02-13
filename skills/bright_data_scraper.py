#!/usr/bin/env python3
"""
Bright Data LinkedIn Scraper

Wrapper for Bright Data API to scrape LinkedIn job postings.
Uses Bright Data's managed LinkedIn Jobs Dataset for high success rates (98%).

API Documentation:
https://docs.brightdata.com/scraping-automation/web-data-apis/web-scraper-api/overview

Dataset: LinkedIn Jobs (gd_l4dx9j9sscpvs7no2)
Cost: $3-9 per 1k jobs (depending on job complexity)
Success Rate: 98%
"""

import os
import time
import logging
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
import requests
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type
)

logger = logging.getLogger(__name__)


class BrightDataError(Exception):
    """Base exception for Bright Data scraper errors."""
    pass


class BrightDataRateLimitError(BrightDataError):
    """Raised when rate limit is exceeded."""
    pass


class BrightDataTimeoutError(BrightDataError):
    """Raised when scraping times out."""
    pass


class BrightDataScraper:
    """
    Bright Data API client for LinkedIn job scraping.
    
    Environment Variables Required:
        BRIGHT_DATA_API_KEY: Your Bright Data API key
    
    Usage:
        scraper = BrightDataScraper()
        job_data = scraper.scrape_job_url("https://www.linkedin.com/jobs/view/12345")
    """
    
    # API Configuration
    BASE_URL = "https://api.brightdata.com/datasets/v3"
    LINKEDIN_DATASET_ID = "gd_l4dx9j9sscpvs7no2"
    
    # Rate Limits
    MAX_REQUESTS_PER_MINUTE = 60
    MAX_CONCURRENT_REQUESTS = 10
    
    # Timeouts
    DEFAULT_TIMEOUT = 30  # seconds for API request
    MAX_POLLING_TIME = 300  # seconds (5 minutes) for job completion
    POLLING_INTERVAL = 5  # seconds between status checks
    
    # Cost Estimation (per 1k jobs)
    COST_PER_1K_JOBS_MIN = 3.0  # USD
    COST_PER_1K_JOBS_MAX = 9.0  # USD
    COST_PER_1K_JOBS_AVG = 6.0  # USD
    
    def __init__(self, api_key: Optional[str] = None):
        """
        Initialize Bright Data scraper.
        
        Args:
            api_key: Bright Data API key (default: from BRIGHT_DATA_API_KEY env var)
        """
        self.api_key = api_key or os.getenv('BRIGHT_DATA_API_KEY')
        
        if not self.api_key:
            raise ValueError(
                "Bright Data API key not found. Set BRIGHT_DATA_API_KEY environment variable."
            )
        
        self.session = requests.Session()
        self.session.headers.update({
            'Authorization': f'Bearer {self.api_key}',
            'Content-Type': 'application/json'
        })
        
        # Stats tracking
        self.stats = {
            'requests_made': 0,
            'jobs_scraped': 0,
            'errors': 0,
            'total_cost_usd': 0.0
        }
        
        logger.info("Bright Data scraper initialized")
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=2, min=4, max=30),
        retry=retry_if_exception_type(BrightDataRateLimitError),
        reraise=True
    )
    def scrape_job_url(
        self,
        job_url: str,
        timeout: Optional[int] = None,
        wait_for_completion: bool = True
    ) -> Dict[str, Any]:
        """
        Scrape a single LinkedIn job URL.
        
        Args:
            job_url: LinkedIn job URL (e.g., https://www.linkedin.com/jobs/view/12345)
            timeout: Maximum time to wait for completion (seconds)
            wait_for_completion: If True, poll until job completes. If False, return snapshot_id immediately.
        
        Returns:
            Job data dictionary with standardized schema
        
        Raises:
            BrightDataError: On API errors
            BrightDataTimeoutError: On timeout
            BrightDataRateLimitError: On rate limit exceeded
        """
        timeout = timeout or self.MAX_POLLING_TIME
        
        logger.info(f"Scraping LinkedIn job: {job_url}")
        
        try:
            # Trigger scraping job
            snapshot_id = self._trigger_scrape(job_url)
            
            if not wait_for_completion:
                logger.info(f"Scrape triggered, snapshot_id: {snapshot_id}")
                return {'snapshot_id': snapshot_id, 'status': 'pending'}
            
            # Poll for completion
            job_data = self._poll_for_completion(snapshot_id, timeout)
            
            # Transform to standardized schema
            standardized_data = self._transform_to_standard_schema(job_data, job_url)
            
            # Update stats
            self.stats['jobs_scraped'] += 1
            self.stats['total_cost_usd'] += self.COST_PER_1K_JOBS_AVG / 1000
            
            logger.info(f"Successfully scraped job: {standardized_data.get('title', 'Unknown')}")
            
            return standardized_data
            
        except BrightDataRateLimitError:
            logger.warning(f"Rate limit exceeded, retrying with backoff...")
            raise  # Will be retried by @retry decorator
            
        except Exception as e:
            self.stats['errors'] += 1
            logger.error(f"Failed to scrape {job_url}: {e}")
            raise BrightDataError(f"Scraping failed: {e}") from e
    
    def scrape_job_urls_batch(
        self,
        job_urls: List[str],
        max_concurrent: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """
        Scrape multiple LinkedIn job URLs in batch.
        
        Args:
            job_urls: List of LinkedIn job URLs
            max_concurrent: Maximum concurrent requests (default: MAX_CONCURRENT_REQUESTS)
        
        Returns:
            List of job data dictionaries
        """
        max_concurrent = max_concurrent or self.MAX_CONCURRENT_REQUESTS
        
        logger.info(f"Batch scraping {len(job_urls)} jobs (max concurrent: {max_concurrent})")
        
        results = []
        
        # Trigger all jobs (non-blocking)
        snapshot_ids = []
        for url in job_urls:
            try:
                snapshot_id = self._trigger_scrape(url)
                snapshot_ids.append((url, snapshot_id))
                time.sleep(1)  # Rate limiting
            except Exception as e:
                logger.error(f"Failed to trigger scrape for {url}: {e}")
                results.append({'url': url, 'error': str(e), 'success': False})
        
        # Poll all jobs
        for url, snapshot_id in snapshot_ids:
            try:
                job_data = self._poll_for_completion(snapshot_id, self.MAX_POLLING_TIME)
                standardized_data = self._transform_to_standard_schema(job_data, url)
                results.append(standardized_data)
                self.stats['jobs_scraped'] += 1
            except Exception as e:
                logger.error(f"Failed to retrieve {url}: {e}")
                results.append({'url': url, 'error': str(e), 'success': False})
                self.stats['errors'] += 1
        
        # Update cost
        successful_jobs = sum(1 for r in results if r.get('success', False))
        self.stats['total_cost_usd'] += (successful_jobs * self.COST_PER_1K_JOBS_AVG / 1000)
        
        logger.info(f"Batch scraping complete: {successful_jobs}/{len(job_urls)} successful")
        
        return results
    
    def _trigger_scrape(self, job_url: str) -> str:
        """
        Trigger a scraping job via Bright Data API.
        
        Args:
            job_url: LinkedIn job URL
        
        Returns:
            Snapshot ID for polling
        
        Raises:
            BrightDataError: On API errors
            BrightDataRateLimitError: On rate limit
        """
        endpoint = f"{self.BASE_URL}/trigger"
        
        payload = {
            "dataset_id": self.LINKEDIN_DATASET_ID,
            "endpoint": "discover_new",
            "url": job_url,
            "format": "json",
            "include_errors": True
        }
        
        try:
            response = self.session.post(
                endpoint,
                json=payload,
                timeout=self.DEFAULT_TIMEOUT
            )
            
            self.stats['requests_made'] += 1
            
            # Handle rate limiting
            if response.status_code == 429:
                retry_after = int(response.headers.get('Retry-After', 60))
                logger.warning(f"Rate limited, retry after {retry_after}s")
                raise BrightDataRateLimitError(f"Rate limit exceeded, retry after {retry_after}s")
            
            # Handle errors
            if response.status_code not in [200, 201]:
                error_msg = response.text
                logger.error(f"API error ({response.status_code}): {error_msg}")
                raise BrightDataError(f"API returned {response.status_code}: {error_msg}")
            
            data = response.json()
            snapshot_id = data.get('snapshot_id')
            
            if not snapshot_id:
                raise BrightDataError("No snapshot_id in API response")
            
            logger.debug(f"Scrape triggered: snapshot_id={snapshot_id}")
            
            return snapshot_id
            
        except requests.RequestException as e:
            raise BrightDataError(f"Request failed: {e}") from e
    
    def _poll_for_completion(
        self,
        snapshot_id: str,
        timeout: int
    ) -> Dict[str, Any]:
        """
        Poll Bright Data API until scraping job completes.
        
        Args:
            snapshot_id: Snapshot ID from trigger
            timeout: Maximum time to wait (seconds)
        
        Returns:
            Job data from completed snapshot
        
        Raises:
            BrightDataTimeoutError: On timeout
            BrightDataError: On API errors
        """
        endpoint = f"{self.BASE_URL}/snapshot/{snapshot_id}"
        start_time = time.time()
        
        logger.debug(f"Polling for completion: {snapshot_id}")
        
        while True:
            elapsed = time.time() - start_time
            
            if elapsed > timeout:
                raise BrightDataTimeoutError(
                    f"Scraping timed out after {timeout}s (snapshot_id: {snapshot_id})"
                )
            
            try:
                response = self.session.get(endpoint, timeout=self.DEFAULT_TIMEOUT)
                
                if response.status_code == 429:
                    time.sleep(10)  # Wait longer on rate limit
                    continue
                
                if response.status_code != 200:
                    raise BrightDataError(f"Status check failed: {response.status_code}")
                
                data = response.json()
                status = data.get('status')
                
                if status == 'ready':
                    logger.debug(f"Scrape completed: {snapshot_id}")
                    return self._get_snapshot_data(snapshot_id)
                
                elif status == 'failed':
                    error = data.get('error', 'Unknown error')
                    raise BrightDataError(f"Scraping failed: {error}")
                
                elif status in ['running', 'pending']:
                    logger.debug(f"Still running... ({elapsed:.1f}s elapsed)")
                    time.sleep(self.POLLING_INTERVAL)
                
                else:
                    logger.warning(f"Unknown status: {status}")
                    time.sleep(self.POLLING_INTERVAL)
                    
            except requests.RequestException as e:
                logger.warning(f"Polling request failed: {e}, retrying...")
                time.sleep(self.POLLING_INTERVAL)
    
    def _get_snapshot_data(self, snapshot_id: str) -> Dict[str, Any]:
        """
        Retrieve data from completed snapshot.
        
        Args:
            snapshot_id: Snapshot ID
        
        Returns:
            Raw job data from Bright Data
        
        Raises:
            BrightDataError: On API errors
        """
        endpoint = f"{self.BASE_URL}/snapshot/{snapshot_id}/data"
        
        try:
            response = self.session.get(endpoint, timeout=self.DEFAULT_TIMEOUT)
            
            if response.status_code != 200:
                raise BrightDataError(f"Data retrieval failed: {response.status_code}")
            
            data = response.json()
            
            # Bright Data returns array of results (usually 1 for single URL)
            if isinstance(data, list) and len(data) > 0:
                return data[0]
            elif isinstance(data, dict):
                return data
            else:
                raise BrightDataError(f"Unexpected data format: {type(data)}")
                
        except requests.RequestException as e:
            raise BrightDataError(f"Data retrieval failed: {e}") from e
    
    def _transform_to_standard_schema(
        self,
        raw_data: Dict[str, Any],
        job_url: str
    ) -> Dict[str, Any]:
        """
        Transform Bright Data response to standardized job schema.
        
        Args:
            raw_data: Raw data from Bright Data API
            job_url: Original job URL
        
        Returns:
            Standardized job data dictionary
        """
        return {
            # Job Details
            'title': raw_data.get('title', ''),
            'company': raw_data.get('company', ''),
            'location': raw_data.get('location', ''),
            'department': raw_data.get('department'),
            'employment_type': raw_data.get('employment_type', 'Full-time'),
            'seniority_level': raw_data.get('seniority_level'),
            'salary_range': raw_data.get('salary_range'),
            
            # Descriptions
            'description': raw_data.get('description', ''),
            'description_markdown': None,  # Will be set by Jina Reader later
            
            # URLs
            'job_url': job_url,
            'apply_url': raw_data.get('apply_url') or job_url,
            
            # Metadata
            'source': 'linkedin',
            'platform': 'linkedin',
            'scraping_method': 'bright_data',
            'success': True,
            'posted_date': raw_data.get('posted_date'),
            'scraped_at': datetime.utcnow().isoformat(),
            'scraping_duration_seconds': None,  # Set by caller
            
            # Raw Data (for debugging)
            'raw_data': raw_data
        }
    
    def get_usage_stats(self) -> Dict[str, Any]:
        """
        Get usage statistics.
        
        Returns:
            Dictionary with usage stats
        """
        return {
            **self.stats,
            'cost_per_job': (
                self.stats['total_cost_usd'] / self.stats['jobs_scraped']
                if self.stats['jobs_scraped'] > 0 else 0
            ),
            'success_rate': (
                (self.stats['jobs_scraped'] / self.stats['requests_made']) * 100
                if self.stats['requests_made'] > 0 else 0
            )
        }
    
    def estimate_cost(self, num_jobs: int) -> Dict[str, float]:
        """
        Estimate cost for scraping N jobs.
        
        Args:
            num_jobs: Number of jobs to scrape
        
        Returns:
            Dictionary with cost estimates (min, max, avg)
        """
        return {
            'num_jobs': num_jobs,
            'cost_min_usd': (num_jobs / 1000) * self.COST_PER_1K_JOBS_MIN,
            'cost_max_usd': (num_jobs / 1000) * self.COST_PER_1K_JOBS_MAX,
            'cost_avg_usd': (num_jobs / 1000) * self.COST_PER_1K_JOBS_AVG
        }


# ============================================================================
# CLI for Testing
# ============================================================================

if __name__ == "__main__":
    import sys
    
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    if len(sys.argv) < 2:
        print("Usage: python bright_data_scraper.py <linkedin_job_url>")
        print("Example: python bright_data_scraper.py https://www.linkedin.com/jobs/view/12345")
        sys.exit(1)
    
    job_url = sys.argv[1]
    
    try:
        scraper = BrightDataScraper()
        
        print(f"\n{'='*60}")
        print(f"Scraping LinkedIn Job")
        print(f"{'='*60}")
        print(f"URL: {job_url}\n")
        
        start = time.time()
        job_data = scraper.scrape_job_url(job_url)
        duration = time.time() - start
        
        print(f"{'='*60}")
        print(f"SUCCESS! (Duration: {duration:.2f}s)")
        print(f"{'='*60}\n")
        
        print(f"Title: {job_data.get('title')}")
        print(f"Company: {job_data.get('company')}")
        print(f"Location: {job_data.get('location')}")
        print(f"Employment Type: {job_data.get('employment_type')}")
        print(f"\nDescription (first 500 chars):")
        print(job_data.get('description', '')[:500])
        
        print(f"\n{'='*60}")
        print(f"Usage Stats")
        print(f"{'='*60}")
        stats = scraper.get_usage_stats()
        for key, value in stats.items():
            print(f"{key}: {value}")
        
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        sys.exit(1)
