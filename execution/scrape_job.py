#!/usr/bin/env python3
"""
Job Scraping Execution Script

Production-ready script that orchestrates the entire scraping workflow:
1. Detects platform from URL
2. Routes to appropriate scraper (Platform Router)
3. Post-processes with Jina Reader (HTML → Markdown)
4. Stores results in Supabase
5. Logs stats and errors

Usage:
    # Scrape single job URL (Pillar 1 - Manual)
    python scrape_job.py --url "https://www.linkedin.com/jobs/view/12345" --user-id "uuid" --pillar manual
    
    # Scrape with dry-run (no database writes)
    python scrape_job.py --url "https://..." --user-id "uuid" --dry-run
    
    # Scrape batch of URLs (Pillar 2 - Automation)
    python scrape_job.py --urls-file jobs.txt --user-id "uuid" --pillar automation

Environment Variables:
    SUPABASE_URL: Supabase project URL
    SUPABASE_SERVICE_KEY: Supabase service role key (for backend operations)
    BRIGHT_DATA_API_KEY: Bright Data API key (for LinkedIn)
    JINA_READER_API_KEY: Jina Reader API key (for HTML → Markdown)
    BRIGHT_DATA_PROXY_SERVER: Bright Data proxy server (for Patchright)
    BRIGHT_DATA_PROXY_USER: Bright Data proxy username
    BRIGHT_DATA_PROXY_PASS: Bright Data proxy password
"""

import os
import sys
import argparse
import logging
import time
from datetime import datetime
from typing import Dict, List, Optional, Any
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from skills.scraping_router import ScrapeRouter
from supabase import create_client, Client

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('logs/scraping.log', mode='a')
    ]
)
logger = logging.getLogger(__name__)


class ScrapeJobExecutor:
    """
    Execution wrapper for job scraping workflow.
    
    Orchestrates:
    - Scraping router (platform detection + scraper selection)
    - Jina Reader post-processing (HTML → Markdown)
    - Supabase storage
    - Error handling & retry logic
    - Stats tracking
    """
    
    def __init__(self, dry_run: bool = False):
        """
        Initialize executor.
        
        Args:
            dry_run: If True, don't write to database
        """
        self.dry_run = dry_run
        
        # Initialize Supabase client
        supabase_url = os.getenv('SUPABASE_URL')
        supabase_key = os.getenv('SUPABASE_SERVICE_KEY')
        
        if not supabase_url or not supabase_key:
            logger.warning("Supabase credentials not found. Database operations will fail.")
            self.supabase = None
        else:
            self.supabase: Client = create_client(supabase_url, supabase_key)
            logger.info("Supabase client initialized")
        
        # Initialize scraping router
        self.router = ScrapeRouter()
        logger.info("Scraping router initialized")
        
        # Stats tracking
        self.stats = {
            'total_jobs': 0,
            'successful': 0,
            'failed': 0,
            'start_time': None,
            'end_time': None
        }
    
    def scrape_single_job(
        self,
        job_url: str,
        user_id: str,
        pillar: str = 'manual'
    ) -> Dict[str, Any]:
        """
        Scrape a single job URL.
        
        Args:
            job_url: Job URL to scrape
            user_id: User ID who submitted the job
            pillar: 'manual' or 'automation'
        
        Returns:
            Dictionary with scraping result
        
        Raises:
            Exception: On scraping failure (after retries)
        """
        logger.info(f"Scraping job: {job_url} (pillar: {pillar})")
        
        start_time = time.time()
        
        try:
            # Use router to scrape (automatic platform detection)
            job_data = self.router.scrape(
                url=job_url,
                pillar=pillar
            )
            
            # Calculate duration
            duration = time.time() - start_time
            job_data['scraping_duration_seconds'] = round(duration, 2)
            
            # Add user context
            job_data['user_id'] = user_id
            job_data['pillar'] = pillar
            job_data['status'] = 'scraped'
            
            # Store in database (unless dry-run)
            if not self.dry_run:
                job_id = self._store_job_data(job_data)
                job_data['id'] = job_id
                logger.info(f"✅ Job stored in database: {job_id}")
            else:
                logger.info(f"✅ DRY RUN: Would store job data")
            
            # Update stats
            self.stats['successful'] += 1
            
            logger.info(
                f"✅ Successfully scraped: {job_data.get('title', 'Unknown')} "
                f"at {job_data.get('company', 'Unknown')} ({duration:.2f}s)"
            )
            
            return {
                'success': True,
                'job_data': job_data,
                'duration_seconds': duration
            }
            
        except Exception as e:
            duration = time.time() - start_time
            
            logger.error(f"❌ Failed to scrape {job_url}: {e}")
            
            # Log failure to database (unless dry-run)
            if not self.dry_run:
                self._log_scraping_failure(
                    job_url=job_url,
                    user_id=user_id,
                    pillar=pillar,
                    error=str(e),
                    duration=duration
                )
            
            # Update stats
            self.stats['failed'] += 1
            
            return {
                'success': False,
                'error': str(e),
                'job_url': job_url,
                'duration_seconds': duration
            }
    
    def scrape_batch_jobs(
        self,
        job_urls: List[str],
        user_id: str,
        pillar: str = 'automation'
    ) -> List[Dict[str, Any]]:
        """
        Scrape multiple job URLs in batch.
        
        Args:
            job_urls: List of job URLs to scrape
            user_id: User ID
            pillar: 'manual' or 'automation'
        
        Returns:
            List of scraping results
        """
        logger.info(f"Batch scraping {len(job_urls)} jobs (pillar: {pillar})")
        
        results = []
        
        for i, url in enumerate(job_urls, 1):
            logger.info(f"\n{'='*60}")
            logger.info(f"Job {i}/{len(job_urls)}")
            logger.info(f"{'='*60}")
            
            result = self.scrape_single_job(url, user_id, pillar)
            results.append(result)
            
            # Rate limiting between jobs
            if i < len(job_urls):
                time.sleep(2)  # 2 seconds between jobs
        
        # Summary
        successful = sum(1 for r in results if r['success'])
        failed = len(results) - successful
        
        logger.info(f"\n{'='*60}")
        logger.info(f"BATCH SCRAPING COMPLETE")
        logger.info(f"{'='*60}")
        logger.info(f"Total: {len(results)}")
        logger.info(f"✅ Successful: {successful}")
        logger.info(f"❌ Failed: {failed}")
        logger.info(f"Success Rate: {(successful/len(results)*100):.1f}%")
        
        return results
    
    def _store_job_data(self, job_data: Dict[str, Any]) -> str:
        """
        Store scraped job data in Supabase.
        
        Args:
            job_data: Job data dictionary
        
        Returns:
            Job ID (UUID)
        
        Raises:
            Exception: On database error
        """
        if not self.supabase:
            raise Exception("Supabase client not initialized")
        
        # Prepare data for database
        db_data = {
            'user_id': job_data.get('user_id'),
            'title': job_data.get('title'),
            'company': job_data.get('company'),
            'location': job_data.get('location'),
            'department': job_data.get('department'),
            'employment_type': job_data.get('employment_type'),
            'salary_range': job_data.get('salary_range'),
            'description': job_data.get('description'),
            'description_markdown': job_data.get('description_markdown'),
            'job_url': job_data.get('job_url'),
            'apply_url': job_data.get('apply_url'),
            'source': job_data.get('source'),
            'platform': job_data.get('platform'),
            'scraping_method': job_data.get('scraping_method'),
            'pillar': job_data.get('pillar'),
            'status': job_data.get('status', 'scraped'),
            'posted_date': job_data.get('posted_date'),
            'scraped_at': job_data.get('scraped_at'),
            'scraping_duration_seconds': job_data.get('scraping_duration_seconds'),
            'raw_data': job_data.get('raw_data')
        }
        
        try:
            response = self.supabase.table('job_queue').insert(db_data).execute()
            
            if response.data and len(response.data) > 0:
                job_id = response.data[0]['id']
                return job_id
            else:
                raise Exception("No data returned from database insert")
                
        except Exception as e:
            logger.error(f"Database insert failed: {e}")
            raise
    
    def _log_scraping_failure(
        self,
        job_url: str,
        user_id: str,
        pillar: str,
        error: str,
        duration: float
    ):
        """
        Log scraping failure to database.
        
        Args:
            job_url: Job URL that failed
            user_id: User ID
            pillar: 'manual' or 'automation'
            error: Error message
            duration: Scraping duration in seconds
        """
        if not self.supabase:
            logger.warning("Cannot log failure: Supabase not initialized")
            return
        
        # Detect platform from URL
        from urllib.parse import urlparse
        parsed = urlparse(job_url)
        platform = parsed.netloc.split('.')[-2] if parsed.netloc else 'unknown'
        
        failure_data = {
            'url': job_url,
            'platform': platform,
            'error': error,
            'scraping_method': 'unknown',  # Could be enhanced
            'retry_count': 3,  # Router already retried 3x
            'pillar': pillar,
            'user_id': user_id,
            'duration_seconds': round(duration, 2),
            'timestamp': datetime.utcnow().isoformat()
        }
        
        try:
            self.supabase.table('failed_scrapes').insert(failure_data).execute()
            logger.info("Failure logged to database")
        except Exception as e:
            logger.error(f"Failed to log scraping failure: {e}")
    
    def get_stats(self) -> Dict[str, Any]:
        """
        Get execution statistics.
        
        Returns:
            Dictionary with stats
        """
        if self.stats['start_time'] and self.stats['end_time']:
            duration = self.stats['end_time'] - self.stats['start_time']
        else:
            duration = 0
        
        return {
            **self.stats,
            'total_duration_seconds': round(duration, 2),
            'success_rate': (
                (self.stats['successful'] / self.stats['total_jobs'] * 100)
                if self.stats['total_jobs'] > 0 else 0
            )
        }


def main():
    """
    Main CLI entry point.
    """
    parser = argparse.ArgumentParser(
        description='Scrape job postings using platform-intelligent router',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Scrape single LinkedIn job (Pillar 1)
  python scrape_job.py --url "https://www.linkedin.com/jobs/view/12345" --user-id "abc-123" --pillar manual
  
  # Scrape with dry-run (no database writes)
  python scrape_job.py --url "https://..." --user-id "abc-123" --dry-run
  
  # Scrape batch from file (Pillar 2)
  python scrape_job.py --urls-file jobs.txt --user-id "abc-123" --pillar automation
        """
    )
    
    # Input options
    input_group = parser.add_mutually_exclusive_group(required=True)
    input_group.add_argument(
        '--url',
        type=str,
        help='Single job URL to scrape'
    )
    input_group.add_argument(
        '--urls-file',
        type=str,
        help='File containing job URLs (one per line)'
    )
    
    # Required arguments
    parser.add_argument(
        '--user-id',
        type=str,
        required=True,
        help='User ID (UUID)'
    )
    
    # Optional arguments
    parser.add_argument(
        '--pillar',
        type=str,
        choices=['manual', 'automation'],
        default='manual',
        help='Pillar type (default: manual)'
    )
    
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Dry run mode (no database writes)'
    )
    
    parser.add_argument(
        '--verbose',
        action='store_true',
        help='Verbose logging (DEBUG level)'
    )
    
    args = parser.parse_args()
    
    # Set log level
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    # Create logs directory if needed
    Path('logs').mkdir(exist_ok=True)
    
    # Initialize executor
    executor = ScrapeJobExecutor(dry_run=args.dry_run)
    
    executor.stats['start_time'] = time.time()
    
    try:
        if args.url:
            # Single job scraping
            logger.info(f"\n{'='*60}")
            logger.info(f"SCRAPING SINGLE JOB")
            logger.info(f"{'='*60}")
            
            executor.stats['total_jobs'] = 1
            
            result = executor.scrape_single_job(
                job_url=args.url,
                user_id=args.user_id,
                pillar=args.pillar
            )
            
            if result['success']:
                logger.info("\n✅ Scraping completed successfully")
                sys.exit(0)
            else:
                logger.error("\n❌ Scraping failed")
                sys.exit(1)
        
        elif args.urls_file:
            # Batch scraping
            logger.info(f"\n{'='*60}")
            logger.info(f"BATCH SCRAPING FROM FILE")
            logger.info(f"{'='*60}")
            
            # Read URLs from file
            with open(args.urls_file, 'r') as f:
                urls = [line.strip() for line in f if line.strip()]
            
            logger.info(f"Found {len(urls)} URLs in file")
            
            executor.stats['total_jobs'] = len(urls)
            
            results = executor.scrape_batch_jobs(
                job_urls=urls,
                user_id=args.user_id,
                pillar=args.pillar
            )
            
            # Check if any succeeded
            if any(r['success'] for r in results):
                sys.exit(0)
            else:
                sys.exit(1)
    
    finally:
        executor.stats['end_time'] = time.time()
        
        # Print final stats
        logger.info(f"\n{'='*60}")
        logger.info(f"EXECUTION STATS")
        logger.info(f"{'='*60}")
        
        stats = executor.get_stats()
        for key, value in stats.items():
            logger.info(f"{key}: {value}")
        
        # Print router stats
        logger.info(f"\n{'='*60}")
        logger.info(f"ROUTER STATS")
        logger.info(f"{'='*60}")
        
        router_stats = executor.router.get_stats()
        for key, value in router_stats.items():
            logger.info(f"{key}: {value}")


if __name__ == '__main__':
    main()
