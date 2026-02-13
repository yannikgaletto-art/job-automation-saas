#!/usr/bin/env python3
"""
Platform-Intelligent Scraping Router

Purpose: Route job scraping requests to the optimal scraper based on platform.

Strategy Decision Matrix (from Deep Research):
- LinkedIn → Bright Data API (98% success, $3-9/1k, GDPR-compliant)
- Greenhouse/Lever/Workday → Direct JSON APIs (99% success, $0.2/1k, free)
- StepStone → Patchright Self-Hosted (75-85% success, $5-8/1k)
- Indeed → ScraperAPI (future, 96% success, $0.5-2/1k)
- Others → Firecrawl (future, 90% success, $1-3/1k)

Architecture:
    Job URL → Platform Detection → Router → Appropriate Scraper → Raw Data
           ↓
    Jina Reader (HTML → Markdown)
           ↓
    Structured Extraction (GPT-4o-mini)
           ↓
    Store in job_queue

Usage:
    from skills.scraping_router import ScrapeRouter
    
    router = ScrapeRouter()
    job_data = router.scrape("https://linkedin.com/jobs/view/12345")
    
    print(job_data)
    # {
    #   'title': 'Senior Python Developer',
    #   'company': 'Tech GmbH',
    #   'description_markdown': '# Requirements\n- 5+ years...',
    #   'location': 'Berlin, Germany',
    #   'url': '...',
    #   'source': 'linkedin',
    #   'scraped_at': '2026-02-12T17:30:00Z',
    #   'success': True
    # }

See: directives/job_discovery.md for complete strategy
"""

import os
import logging
from typing import Dict, Any, Optional, Literal
from urllib.parse import urlparse
from enum import Enum
from datetime import datetime
import hashlib

logger = logging.getLogger(__name__)

# Strategy Types
ScrapingMethod = Literal["api", "self_hosted", "direct_api", "fallback"]


class ScrapingStrategy(Enum):
    """Scraping strategy enum."""
    BRIGHT_DATA = "bright_data"
    PATCHRIGHT = "patchright"
    DIRECT_API = "direct_api"
    SCRAPERAPI = "scraperapi"  # Future
    FIRECRAWL = "firecrawl"  # Future


class PlatformConfig:
    """Configuration for each platform."""
    
    def __init__(
        self,
        strategy: ScrapingStrategy,
        method: ScrapingMethod,
        cost_per_1k: float,
        success_rate: float,
        priority: Literal["high", "medium", "low"],
        enabled: bool = True
    ):
        self.strategy = strategy
        self.method = method
        self.cost_per_1k = cost_per_1k
        self.success_rate = success_rate
        self.priority = priority
        self.enabled = enabled


class ScrapeRouter:
    """
    Platform-intelligent job scraping router.
    
    Routes scraping requests to the optimal scraper based on:
    - Platform detection (domain parsing)
    - Cost-performance trade-offs
    - Success rates
    - User budget constraints
    """
    
    # Platform routing table (based on Deep Research)
    ROUTING_TABLE = {
        # LinkedIn (High Priority - User has API)
        "linkedin.com": PlatformConfig(
            strategy=ScrapingStrategy.BRIGHT_DATA,
            method="api",
            cost_per_1k=6.0,
            success_rate=0.98,
            priority="high"
        ),
        
        # ATS Systems - Direct JSON APIs (Easy wins!)
        "greenhouse.io": PlatformConfig(
            strategy=ScrapingStrategy.DIRECT_API,
            method="direct_api",
            cost_per_1k=0.2,
            success_rate=0.99,
            priority="high"
        ),
        "boards.greenhouse.io": PlatformConfig(
            strategy=ScrapingStrategy.DIRECT_API,
            method="direct_api",
            cost_per_1k=0.2,
            success_rate=0.99,
            priority="high"
        ),
        "lever.co": PlatformConfig(
            strategy=ScrapingStrategy.DIRECT_API,
            method="direct_api",
            cost_per_1k=0.2,
            success_rate=0.99,
            priority="high"
        ),
        "jobs.lever.co": PlatformConfig(
            strategy=ScrapingStrategy.DIRECT_API,
            method="direct_api",
            cost_per_1k=0.2,
            success_rate=0.99,
            priority="high"
        ),
        "myworkdayjobs.com": PlatformConfig(
            strategy=ScrapingStrategy.DIRECT_API,
            method="direct_api",
            cost_per_1k=0.3,
            success_rate=0.95,
            priority="high"
        ),
        
        # German Job Boards - Self-Hosted
        "stepstone.de": PlatformConfig(
            strategy=ScrapingStrategy.PATCHRIGHT,
            method="self_hosted",
            cost_per_1k=6.5,
            success_rate=0.80,
            priority="medium"
        ),
        "monster.de": PlatformConfig(
            strategy=ScrapingStrategy.PATCHRIGHT,
            method="self_hosted",
            cost_per_1k=3.0,
            success_rate=0.85,
            priority="medium"
        ),
        "xing.com": PlatformConfig(
            strategy=ScrapingStrategy.PATCHRIGHT,
            method="self_hosted",
            cost_per_1k=4.0,
            success_rate=0.80,
            priority="medium"
        ),
        
        # Future platforms (parked)
        "indeed.com": PlatformConfig(
            strategy=ScrapingStrategy.SCRAPERAPI,
            method="api",
            cost_per_1k=1.0,
            success_rate=0.96,
            priority="low",
            enabled=False  # Not yet implemented
        ),
        "glassdoor.de": PlatformConfig(
            strategy=ScrapingStrategy.FIRECRAWL,
            method="api",
            cost_per_1k=2.0,
            success_rate=0.90,
            priority="low",
            enabled=False  # Not yet implemented
        ),
    }
    
    def __init__(
        self,
        jina_reader=None,
        bright_data_client=None,
        patchright_scraper=None,
        direct_api_scraper=None
    ):
        """
        Initialize router with scraper dependencies.
        
        Args:
            jina_reader: JinaReader instance for post-processing
            bright_data_client: Bright Data API client (for LinkedIn)
            patchright_scraper: Patchright scraper (for StepStone etc.)
            direct_api_scraper: Direct API scraper (for Greenhouse etc.)
        """
        self.jina_reader = jina_reader
        self.bright_data_client = bright_data_client
        self.patchright_scraper = patchright_scraper
        self.direct_api_scraper = direct_api_scraper
        
        # Lazy import to avoid circular dependencies
        if self.jina_reader is None:
            try:
                from skills.jina_reader import JinaReader
                self.jina_reader = JinaReader()
            except ImportError:
                logger.warning("JinaReader not available")
        
        # Stats tracking
        self.stats = {
            "total_requests": 0,
            "successful_scrapes": 0,
            "failed_scrapes": 0,
            "by_platform": {},
            "total_cost": 0.0
        }
        
        logger.info("ScrapeRouter initialized")
    
    def _extract_domain(self, url: str) -> str:
        """
        Extract domain from URL.
        
        Args:
            url: Job URL
            
        Returns:
            Domain (e.g., 'linkedin.com')
        """
        parsed = urlparse(url)
        domain = parsed.netloc.lower()
        
        # Remove www. prefix
        if domain.startswith('www.'):
            domain = domain[4:]
        
        return domain
    
    def _detect_platform(self, url: str) -> tuple[str, PlatformConfig]:
        """
        Detect platform from URL and return config.
        
        Args:
            url: Job URL
            
        Returns:
            Tuple of (domain, platform_config)
        """
        domain = self._extract_domain(url)
        
        # Direct match
        if domain in self.ROUTING_TABLE:
            config = self.ROUTING_TABLE[domain]
            logger.info(f"Platform detected: {domain} → {config.strategy.value}")
            return domain, config
        
        # Partial match (e.g., subdomain.greenhouse.io → greenhouse.io)
        for platform_domain, config in self.ROUTING_TABLE.items():
            if platform_domain in domain:
                logger.info(f"Platform detected (partial): {domain} → {platform_domain} → {config.strategy.value}")
                return platform_domain, config
        
        # Unknown platform → Use fallback
        logger.warning(f"Unknown platform: {domain}, using fallback (Patchright)")
        fallback_config = PlatformConfig(
            strategy=ScrapingStrategy.PATCHRIGHT,
            method="self_hosted",
            cost_per_1k=5.0,
            success_rate=0.70,
            priority="low"
        )
        return domain, fallback_config
    
    def _scrape_with_bright_data(self, url: str) -> Dict[str, Any]:
        """
        Scrape using Bright Data API (LinkedIn).
        
        Args:
            url: Job URL
            
        Returns:
            Job data dict
        """
        if not self.bright_data_client:
            raise NotImplementedError(
                "Bright Data client not initialized. "
                "Import from skills.bright_data_scraper"
            )
        
        logger.info(f"Scraping with Bright Data: {url}")
        return self.bright_data_client.scrape_linkedin_job(url)
    
    def _scrape_with_patchright(self, url: str) -> Dict[str, Any]:
        """
        Scrape using Patchright self-hosted (StepStone, Monster, etc.).
        
        Args:
            url: Job URL
            
        Returns:
            Job data dict
        """
        if not self.patchright_scraper:
            # Lazy import
            try:
                from skills.patchright_scraper import PatchrightScraper
                self.patchright_scraper = PatchrightScraper()
            except ImportError:
                raise NotImplementedError(
                    "Patchright scraper not available. "
                    "Install: pip install patchright-python"
                )
        
        logger.info(f"Scraping with Patchright: {url}")
        return self.patchright_scraper.scrape(url)
    
    def _scrape_with_direct_api(self, url: str) -> Dict[str, Any]:
        """
        Scrape using Direct JSON APIs (Greenhouse, Lever, Workday).
        
        Args:
            url: Job URL
            
        Returns:
            Job data dict
        """
        if not self.direct_api_scraper:
            # Lazy import
            try:
                from skills.direct_api_scraper import DirectAPIScraper
                self.direct_api_scraper = DirectAPIScraper()
            except ImportError:
                raise NotImplementedError(
                    "Direct API scraper not available. "
                    "Check skills/direct_api_scraper.py"
                )
        
        logger.info(f"Scraping with Direct API: {url}")
        return self.direct_api_scraper.scrape(url)
    
    def _post_process_with_jina(self, raw_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Post-process scraped data with Jina Reader.
        
        Converts HTML description → Clean Markdown.
        
        Args:
            raw_data: Raw scraped data
            
        Returns:
            Enhanced data with Markdown description
        """
        if not self.jina_reader:
            logger.warning("Jina Reader not available, skipping post-processing")
            return raw_data
        
        # Convert description HTML → Markdown
        if 'description' in raw_data and raw_data['description']:
            try:
                html = raw_data['description']
                markdown = self.jina_reader.html_to_markdown(html)
                raw_data['description_markdown'] = markdown
                logger.info(f"Jina post-processing: {len(html)} chars HTML → {len(markdown)} chars Markdown")
            except Exception as e:
                logger.error(f"Jina post-processing failed: {e}")
                raw_data['description_markdown'] = raw_data['description']  # Fallback
        
        return raw_data
    
    def scrape(self, url: str, pillar: Optional[str] = None) -> Dict[str, Any]:
        """
        Main scraping method - routes to appropriate scraper.
        
        Args:
            url: Job URL to scrape
            pillar: Optional pillar context ('manual' or 'automation')
            
        Returns:
            Job data dict with standardized schema:
            {
                'title': str,
                'company': str,
                'description': str (HTML),
                'description_markdown': str (Markdown),
                'location': str,
                'salary': Optional[str],
                'url': str,
                'source': str (platform name),
                'scraped_at': str (ISO timestamp),
                'scraping_method': str,
                'success': bool,
                'error': Optional[str]
            }
            
        Raises:
            Exception: If scraping fails completely
        """
        self.stats['total_requests'] += 1
        start_time = datetime.now()
        
        # Detect platform
        domain, config = self._detect_platform(url)
        
        # Check if platform enabled
        if not config.enabled:
            error_msg = f"Platform {domain} not yet implemented (strategy: {config.strategy.value})"
            logger.error(error_msg)
            self.stats['failed_scrapes'] += 1
            return {
                'url': url,
                'source': domain,
                'success': False,
                'error': error_msg,
                'scraped_at': datetime.now().isoformat()
            }
        
        # Route to appropriate scraper
        try:
            if config.strategy == ScrapingStrategy.BRIGHT_DATA:
                raw_data = self._scrape_with_bright_data(url)
            elif config.strategy == ScrapingStrategy.DIRECT_API:
                raw_data = self._scrape_with_direct_api(url)
            elif config.strategy == ScrapingStrategy.PATCHRIGHT:
                raw_data = self._scrape_with_patchright(url)
            else:
                raise NotImplementedError(f"Strategy {config.strategy.value} not implemented")
            
            # Post-process with Jina Reader
            enhanced_data = self._post_process_with_jina(raw_data)
            
            # Add metadata
            enhanced_data.update({
                'url': url,
                'source': domain,
                'scraping_method': config.strategy.value,
                'scraped_at': datetime.now().isoformat(),
                'success': True,
                'scraping_duration_seconds': (datetime.now() - start_time).total_seconds()
            })
            
            # Update stats
            self.stats['successful_scrapes'] += 1
            self.stats['by_platform'][domain] = self.stats['by_platform'].get(domain, 0) + 1
            self.stats['total_cost'] += config.cost_per_1k / 1000
            
            logger.info(
                f"✓ Scrape successful: {domain} via {config.strategy.value} "
                f"(duration: {enhanced_data['scraping_duration_seconds']:.2f}s)"
            )
            
            return enhanced_data
            
        except Exception as e:
            logger.error(f"✗ Scrape failed: {url} → {e}")
            self.stats['failed_scrapes'] += 1
            
            return {
                'url': url,
                'source': domain,
                'scraping_method': config.strategy.value,
                'success': False,
                'error': str(e),
                'scraped_at': datetime.now().isoformat(),
                'scraping_duration_seconds': (datetime.now() - start_time).total_seconds()
            }
    
    def get_stats(self) -> Dict[str, Any]:
        """
        Get router statistics.
        
        Returns:
            Stats dict with counts, success rate, costs
        """
        success_rate = (
            self.stats['successful_scrapes'] / self.stats['total_requests']
            if self.stats['total_requests'] > 0
            else 0.0
        )
        
        return {
            **self.stats,
            'success_rate': round(success_rate * 100, 2),
            'estimated_cost_usd': round(self.stats['total_cost'], 3)
        }
    
    def get_platform_info(self, url: str) -> Dict[str, Any]:
        """
        Get platform information without scraping.
        
        Useful for cost estimation and routing preview.
        
        Args:
            url: Job URL
            
        Returns:
            Platform info dict
        """
        domain, config = self._detect_platform(url)
        
        return {
            'domain': domain,
            'strategy': config.strategy.value,
            'method': config.method,
            'cost_per_1k_jobs': config.cost_per_1k,
            'success_rate': config.success_rate * 100,
            'priority': config.priority,
            'enabled': config.enabled
        }


# Example usage
if __name__ == "__main__":
    # Initialize router
    router = ScrapeRouter()
    
    # Test URLs
    test_urls = [
        "https://www.linkedin.com/jobs/view/12345",
        "https://boards.greenhouse.io/company/jobs/67890",
        "https://jobs.lever.co/company/abc123",
        "https://www.stepstone.de/stellenangebote--...",
        "https://example-company.myworkdayjobs.com/en-US/jobs/..."
    ]
    
    print("=== PLATFORM DETECTION TEST ===\n")
    for url in test_urls:
        info = router.get_platform_info(url)
        print(f"URL: {url}")
        print(f"  → Platform: {info['domain']}")
        print(f"  → Strategy: {info['strategy']}")
        print(f"  → Method: {info['method']}")
        print(f"  → Success Rate: {info['success_rate']}%")
        print(f"  → Cost/1k: ${info['cost_per_1k_jobs']}")
        print(f"  → Enabled: {info['enabled']}")
        print()
    
    print("\n=== STATS ===")
    print(router.get_stats())
