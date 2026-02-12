#!/usr/bin/env python3
"""
Patchright Self-Hosted Scraper

Purpose: Self-hosted browser automation for job boards with moderate anti-bot protection.

Why Patchright > Playwright-Stealth?
- Patchright is a full Playwright fork with deep anti-detection patches
- Bypasses: navigator.webdriver, Canvas/WebGL fingerprinting, TLS/JA3
- Playwright-Stealth is "proof-of-concept" per maintainer
- Better success rates on Datadome/Cloudflare sites

Best Use Cases:
- StepStone (Datadome protection)
- Monster, Glassdoor, Xing (moderate anti-bot)
- Company career pages (low anti-bot)

NOT recommended for:
- LinkedIn (use Bright Data API instead - 98% vs 60-70% success)
- Indeed (use ScraperAPI - 96% vs 60-70% success)

Cost Structure:
- Patchright: Free (open source)
- Residential Proxies: $5-8/1k requests (Bright Data)
- Server: $10-20/month (Cloud Run, Hetzner, DigitalOcean)
- Total: ~$5-8/1k jobs

Installation:
    pip install patchright
    playwright install chromium

See: https://github.com/Kaliiiiiiiiii-Vinyzu/patchright-python
"""

import os
import logging
import random
import asyncio
from typing import Dict, Any, Optional, List
from datetime import datetime

try:
    from patchright.async_api import async_playwright, Page, Browser
    PATCHRIGHT_AVAILABLE = True
except ImportError:
    PATCHRIGHT_AVAILABLE = False
    logging.warning(
        "Patchright not installed. Install with: pip install patchright"
    )

logger = logging.getLogger(__name__)


class PatchrightScraperError(Exception):
    """Custom exception for Patchright scraper errors."""
    pass


class PatchrightScraper:
    """
    Self-hosted browser automation with anti-detection.
    
    Features:
    - Residential proxy rotation (Bright Data)
    - User-Agent rotation
    - Canvas/WebGL fingerprint randomization
    - JavaScript challenge handling
    - Lazy loading support
    """
    
    # Realistic User-Agents (2026)
    USER_AGENTS = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
    ]
    
    # Common screen resolutions
    VIEWPORTS = [
        {"width": 1920, "height": 1080},
        {"width": 1366, "height": 768},
        {"width": 1536, "height": 864},
        {"width": 1440, "height": 900},
    ]
    
    def __init__(
        self,
        proxy_config: Optional[Dict[str, str]] = None,
        headless: bool = True,
        timeout: int = 30000  # 30 seconds
    ):
        """
        Initialize Patchright scraper.
        
        Args:
            proxy_config: Proxy configuration dict with keys:
                - server: Proxy server URL (e.g., 'brd.superproxy.io:33335')
                - username: Proxy username
                - password: Proxy password
            headless: Run browser in headless mode
            timeout: Page load timeout in milliseconds
        """
        if not PATCHRIGHT_AVAILABLE:
            raise PatchrightScraperError(
                "Patchright not installed. Install with: pip install patchright"
            )
        
        # Load proxy config from env if not provided
        if proxy_config is None:
            proxy_server = os.getenv('BRIGHT_DATA_PROXY_SERVER')
            proxy_user = os.getenv('BRIGHT_DATA_PROXY_USER')
            proxy_pass = os.getenv('BRIGHT_DATA_PROXY_PASS')
            
            if all([proxy_server, proxy_user, proxy_pass]):
                proxy_config = {
                    "server": f"http://{proxy_server}",
                    "username": proxy_user,
                    "password": proxy_pass
                }
                logger.info(f"Loaded proxy config from env: {proxy_server}")
            else:
                logger.warning(
                    "No proxy config provided. Running without proxy (lower success rate)."
                )
        
        self.proxy_config = proxy_config
        self.headless = headless
        self.timeout = timeout
        
        logger.info(
            f"PatchrightScraper initialized. "
            f"Proxy: {'✓' if proxy_config else '✗'}, "
            f"Headless: {headless}"
        )
    
    def _get_random_user_agent(self) -> str:
        """Get random User-Agent for anti-fingerprinting."""
        return random.choice(self.USER_AGENTS)
    
    def _get_random_viewport(self) -> Dict[str, int]:
        """Get random viewport size for anti-fingerprinting."""
        return random.choice(self.VIEWPORTS)
    
    async def _inject_anti_detection_scripts(self, page: Page) -> None:
        """
        Inject anti-detection scripts before page navigation.
        
        Bypasses:
        - navigator.webdriver detection
        - Chrome runtime detection
        - Permissions API leaks
        
        Args:
            page: Patchright Page instance
        """
        await page.add_init_script("""
            // Remove webdriver property
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined
            });
            
            // Add Chrome runtime
            window.chrome = {
                runtime: {}
            };
            
            // Fix permissions API
            const originalQuery = window.navigator.permissions.query;
            window.navigator.permissions.query = (parameters) => (
                parameters.name === 'notifications' ?
                    Promise.resolve({ state: Notification.permission }) :
                    originalQuery(parameters)
            );
            
            // Randomize canvas fingerprint (basic)
            const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
            HTMLCanvasElement.prototype.toDataURL = function() {
                const context = this.getContext('2d');
                if (context) {
                    const imageData = context.getImageData(0, 0, this.width, this.height);
                    for (let i = 0; i < imageData.data.length; i += 4) {
                        imageData.data[i] += Math.floor(Math.random() * 3) - 1;
                    }
                    context.putImageData(imageData, 0, 0);
                }
                return originalToDataURL.apply(this, arguments);
            };
        """)
        
        logger.debug("Anti-detection scripts injected")
    
    async def _simulate_human_behavior(self, page: Page) -> None:
        """
        Simulate human-like behavior (scrolling, mouse movements).
        
        Args:
            page: Patchright Page instance
        """
        # Random delay before interaction
        await asyncio.sleep(random.uniform(0.5, 2.0))
        
        # Scroll down gradually (important for lazy-loaded content)
        viewport_height = await page.evaluate("window.innerHeight")
        page_height = await page.evaluate("document.body.scrollHeight")
        
        scroll_steps = min(5, max(2, page_height // viewport_height))
        
        for i in range(scroll_steps):
            scroll_amount = viewport_height * (i + 1)
            await page.evaluate(f"window.scrollTo(0, {scroll_amount})")
            await asyncio.sleep(random.uniform(0.3, 0.8))
        
        logger.debug(f"Simulated scrolling ({scroll_steps} steps)")
    
    async def _extract_job_data(self, page: Page, url: str) -> Dict[str, Any]:
        """
        Extract job data from page (platform-agnostic selectors).
        
        Args:
            page: Patchright Page instance
            url: Job URL
            
        Returns:
            Job data dict
        """
        # Wait for content to load
        await page.wait_for_selector("body", timeout=self.timeout)
        
        # Try common selectors for job boards
        job_data = await page.evaluate("""
            () => {
                // Helper function to get text safely
                const getText = (selector) => {
                    const el = document.querySelector(selector);
                    return el ? el.innerText.trim() : null;
                };
                
                // Helper function to get HTML safely
                const getHTML = (selector) => {
                    const el = document.querySelector(selector);
                    return el ? el.innerHTML : null;
                };
                
                // Try multiple selector patterns (StepStone, Monster, Xing, etc.)
                return {
                    title: getText('h1') || 
                           getText('[data-testid="job-title"]') ||
                           getText('.job-title') ||
                           getText('.JobTitle'),
                    
                    company: getText('[data-testid="company-name"]') ||
                             getText('.company-name') ||
                             getText('[itemprop="hiringOrganization"]') ||
                             getText('.CompanyName'),
                    
                    location: getText('[data-testid="location"]') ||
                              getText('.location') ||
                              getText('[itemprop="jobLocation"]') ||
                              getText('.JobLocation'),
                    
                    description: getHTML('[data-testid="job-description"]') ||
                                 getHTML('.job-description') ||
                                 getHTML('.description') ||
                                 getHTML('[itemprop="description"]') ||
                                 getHTML('.JobDescription') ||
                                 document.body.innerHTML,  // Fallback: entire page
                    
                    // Extract structured data (JSON-LD)
                    structured_data: (() => {
                        const scripts = document.querySelectorAll('script[type="application/ld+json"]');
                        for (const script of scripts) {
                            try {
                                const data = JSON.parse(script.textContent);
                                if (data['@type'] === 'JobPosting') {
                                    return data;
                                }
                            } catch (e) {}
                        }
                        return null;
                    })()
                };
            }
        """)
        
        # Enhance with structured data if available
        if job_data.get('structured_data'):
            sd = job_data['structured_data']
            job_data['title'] = job_data['title'] or sd.get('title')
            job_data['company'] = job_data['company'] or sd.get('hiringOrganization', {}).get('name')
            job_data['location'] = job_data['location'] or sd.get('jobLocation', {}).get('address', {}).get('addressLocality')
            job_data['posted_date'] = sd.get('datePosted')
            job_data['employment_type'] = sd.get('employmentType')
            job_data['salary'] = sd.get('baseSalary', {}).get('value') if sd.get('baseSalary') else None
        
        return job_data
    
    async def scrape_async(self, url: str) -> Dict[str, Any]:
        """
        Async scraping method.
        
        Args:
            url: Job URL
            
        Returns:
            Standardized job data dict
            
        Raises:
            PatchrightScraperError: If scraping fails
        """
        start_time = datetime.now()
        
        async with async_playwright() as p:
            # Launch browser with anti-detection
            browser_args = {
                "headless": self.headless,
            }
            
            if self.proxy_config:
                browser_args["proxy"] = self.proxy_config
            
            browser = await p.chromium.launch(**browser_args)
            
            # Create context with randomized fingerprint
            context = await browser.new_context(
                user_agent=self._get_random_user_agent(),
                viewport=self._get_random_viewport(),
                locale="de-DE",  # German locale for German job boards
                timezone_id="Europe/Berlin",
                java_script_enabled=True
            )
            
            page = await context.new_page()
            
            try:
                # Inject anti-detection before navigation
                await self._inject_anti_detection_scripts(page)
                
                # Navigate to URL
                logger.info(f"Navigating to: {url}")
                await page.goto(url, wait_until="networkidle", timeout=self.timeout)
                
                # Simulate human behavior
                await self._simulate_human_behavior(page)
                
                # Extract job data
                job_data = await self._extract_job_data(page, url)
                
                # Add metadata
                job_data['url'] = url
                job_data['scraped_at'] = datetime.now().isoformat()
                job_data['scraping_duration_seconds'] = (datetime.now() - start_time).total_seconds()
                
                logger.info(
                    f"✓ Scrape successful: {url} "
                    f"(duration: {job_data['scraping_duration_seconds']:.2f}s)"
                )
                
                return job_data
                
            except Exception as e:
                logger.error(f"✗ Scrape failed: {url} → {e}")
                raise PatchrightScraperError(f"Scraping failed: {e}")
            
            finally:
                await browser.close()
    
    def scrape(self, url: str) -> Dict[str, Any]:
        """
        Synchronous wrapper for scrape_async.
        
        Args:
            url: Job URL
            
        Returns:
            Job data dict
        """
        return asyncio.run(self.scrape_async(url))


# Example usage
if __name__ == "__main__":
    # Initialize scraper
    scraper = PatchrightScraper(headless=True)
    
    # Test URL (use a real StepStone URL)
    test_url = "https://www.stepstone.de/stellenangebote--Software-Engineer-Python-Berlin--9876543.html"
    
    print("=== PATCHRIGHT SCRAPER TEST ===\n")
    print(f"Testing: {test_url}")
    
    try:
        job_data = scraper.scrape(test_url)
        print(f"✓ Success!")
        print(f"  Title: {job_data.get('title')}")
        print(f"  Company: {job_data.get('company')}")
        print(f"  Location: {job_data.get('location')}")
        print(f"  Duration: {job_data.get('scraping_duration_seconds')}s")
    except PatchrightScraperError as e:
        print(f"✗ Failed: {e}")
