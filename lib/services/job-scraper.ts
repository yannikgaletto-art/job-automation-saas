/**
 * Job Scraper Service - 5-Tier Intelligent Fallback
 * 
 * Tier 1: SerpAPI (Google Jobs) - LinkedIn, Indeed, StepStone
 * Tier 2: Jina Reader (URL → Markdown) - Any URL, serverless-friendly
 * Tier 3: Firecrawl (ATS platforms) - Greenhouse, Lever, Workday
 * Tier 4: BrightData (LinkedIn fallback) - Expensive, last resort for LinkedIn
 * Tier 5: Direct fetch + Cheerio (Universal fallback) - Free, basic HTML parsing
 */

import crypto from 'crypto';

// ============================================================
// TYPES
// ============================================================

export type SiteType =
    | 'linkedin'
    | 'indeed'
    | 'stepstone'
    | 'xing'
    | 'greenhouse'
    | 'lever'
    | 'workday'
    | 'taleo'
    | 'ashby'
    | 'breezy'
    | 'company_website'
    | 'unknown';

export interface ScrapedJobData {
    title: string;
    company: string;
    location?: string;
    description: string;
    requirements?: string[];
    salary?: string;
    platform: SiteType;
    posted_at?: Date;
    apply_url: string;
}

export interface JobScraperResult {
    success: boolean;
    data?: ScrapedJobData;
    error?: string;
    method: 'serpapi' | 'jina' | 'firecrawl' | 'brightdata' | 'cheerio' | 'manual_fallback';
    duration: number;
    cost: number; // in cents
}

interface ScraperConfig {
    primary: string;
    fallback: string[];
    reason: string;
}

// ============================================================
// SCRAPE RESULT CACHE (24h in-memory)
// ============================================================

const scrapeCache = new Map<string, { result: JobScraperResult; expiry: number }>();

function getCachedResult(url: string): JobScraperResult | null {
    const hash = crypto.createHash('md5').update(url).digest('hex');
    const cached = scrapeCache.get(hash);
    if (cached && cached.expiry > Date.now()) {
        console.log('💾 Cache hit for URL:', url.substring(0, 60));
        return cached.result;
    }
    if (cached) scrapeCache.delete(hash);
    return null;
}

function setCachedResult(url: string, result: JobScraperResult): void {
    const hash = crypto.createHash('md5').update(url).digest('hex');
    scrapeCache.set(hash, {
        result,
        expiry: Date.now() + 24 * 60 * 60 * 1000, // 24h
    });
}

// ============================================================
// PLATFORM DETECTION
// ============================================================

export function detectPlatform(url: string): SiteType {
    try {
        const domain = new URL(url).hostname.toLowerCase();

        // Job Boards (Tier 1: SerpAPI)
        if (domain.includes('linkedin.com')) return 'linkedin';
        if (domain.includes('indeed.com') || domain.includes('indeed.de')) return 'indeed';
        if (domain.includes('stepstone.de') || domain.includes('stepstone.com')) return 'stepstone';
        if (domain.includes('xing.com')) return 'xing';

        // ATS Platforms (Tier 3: Firecrawl)
        if (domain.includes('greenhouse.io') || domain.includes('boards.greenhouse.io')) return 'greenhouse';
        if (domain.includes('lever.co') || domain.includes('jobs.lever.co')) return 'lever';
        if (domain.includes('workday.com') || domain.includes('myworkdayjobs.com')) return 'workday';
        if (domain.includes('taleo.net')) return 'taleo';
        if (domain.includes('ashbyhq.com')) return 'ashby';
        if (domain.includes('breezy.hr')) return 'breezy';

        // Company websites with career pages
        if (domain.includes('jobs.') || domain.includes('karriere.') || domain.includes('career.')) {
            return 'company_website';
        }

        return 'unknown';
    } catch {
        return 'unknown';
    }
}

// ============================================================
// STRATEGY SELECTION
// ============================================================

function selectScraperStrategy(platform: SiteType): ScraperConfig {
    const strategies: Record<SiteType, ScraperConfig> = {
        // JOB BOARDS: SerpAPI first
        linkedin: {
            primary: 'serpapi',
            fallback: ['jina', 'brightdata', 'cheerio'],
            reason: 'SerpAPI aggregates LinkedIn Jobs via Google Jobs',
        },
        indeed: {
            primary: 'serpapi',
            fallback: ['jina', 'cheerio'],
            reason: 'SerpAPI has Indeed integration',
        },
        stepstone: {
            primary: 'serpapi',
            fallback: ['jina', 'cheerio'],
            reason: 'SerpAPI supports StepStone via Google Jobs',
        },
        xing: {
            primary: 'jina',
            fallback: ['cheerio'],
            reason: 'Xing not in SerpAPI, use Jina Reader',
        },

        // ATS PLATFORMS: Firecrawl first
        greenhouse: {
            primary: 'firecrawl',
            fallback: ['jina', 'cheerio'],
            reason: 'Greenhouse uses React, needs JS rendering',
        },
        lever: {
            primary: 'firecrawl',
            fallback: ['jina', 'cheerio'],
            reason: 'Lever has dynamic content',
        },
        workday: {
            primary: 'firecrawl',
            fallback: ['jina', 'cheerio'],
            reason: 'Workday complex forms',
        },
        taleo: {
            primary: 'firecrawl',
            fallback: ['jina', 'cheerio'],
            reason: 'Taleo legacy ATS',
        },
        ashby: {
            primary: 'firecrawl',
            fallback: ['jina', 'cheerio'],
            reason: 'Modern ATS with JS',
        },
        breezy: {
            primary: 'firecrawl',
            fallback: ['jina', 'cheerio'],
            reason: 'Breezy modern ATS',
        },

        // COMPANY WEBSITES / UNKNOWN: Jina Reader first
        company_website: {
            primary: 'jina',
            fallback: ['firecrawl', 'cheerio'],
            reason: 'Jina Reader converts pages to clean markdown',
        },
        unknown: {
            primary: 'jina',
            fallback: ['cheerio'],
            reason: 'Unknown site, Jina Reader is the safest universal option',
        },
    };

    return strategies[platform];
}

// ============================================================
// MAIN SCRAPE ORCHESTRATOR
// ============================================================

export async function scrapeJob(url: string): Promise<JobScraperResult> {
    // Check cache first
    const cached = getCachedResult(url);
    if (cached) return cached;

    const startTime = Date.now();
    const platform = detectPlatform(url);
    const strategy = selectScraperStrategy(platform);

    console.log(`🔍 Scraping ${url.substring(0, 80)}... (${platform})`);
    console.log(`📋 Strategy: ${strategy.primary} → ${strategy.fallback.join(' → ')}`);

    const allScrapers = [strategy.primary, ...strategy.fallback];

    for (const scraper of allScrapers) {
        try {
            console.log(`🔄 Trying ${scraper}...`);
            let result: JobScraperResult;

            switch (scraper) {
                case 'serpapi':
                    result = await scrapeWithSerpAPI(url, platform);
                    break;
                case 'jina':
                    result = await scrapeWithJina(url, platform);
                    break;
                case 'firecrawl':
                    result = await scrapeWithFirecrawl(url, platform);
                    break;
                case 'brightdata':
                    result = await scrapeWithBrightData(url, platform);
                    break;
                case 'cheerio':
                    result = await scrapeWithCheerio(url, platform);
                    break;
                default:
                    continue;
            }

            if (result.success && result.data) {
                console.log(`✅ ${scraper} succeeded in ${result.duration}ms (cost: $${(result.cost / 100).toFixed(4)})`);
                setCachedResult(url, result);
                return result;
            } else {
                console.warn(`⚠️ ${scraper} returned no data: ${result.error}`);
            }
        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : String(error);
            console.error(`❌ ${scraper} failed:`, errMsg);
        }
    }

    // All scrapers failed
    const failResult: JobScraperResult = {
        success: false,
        error: 'Alle Scraping-Methoden fehlgeschlagen. Bitte Jobdaten manuell eingeben.',
        method: 'manual_fallback',
        duration: Date.now() - startTime,
        cost: 0,
    };
    return failResult;
}

// ============================================================
// TIER 1: SerpAPI (Google Jobs)
// ============================================================

async function scrapeWithSerpAPI(url: string, platform: SiteType): Promise<JobScraperResult> {
    const startTime = Date.now();

    if (!process.env.SERPAPI_KEY) {
        return { success: false, error: 'SERPAPI_KEY not set', method: 'serpapi', duration: 0, cost: 0 };
    }

    try {
        const { getJson } = await import('serpapi');
        const searchQuery = extractSearchQueryFromUrl(url, platform);

        const results = await getJson({
            engine: 'google_jobs',
            q: searchQuery,
            location: 'Germany',
            api_key: process.env.SERPAPI_KEY,
            hl: 'de',
        });

        const jobs = results.jobs_results || [];
        if (jobs.length === 0) {
            return { success: false, error: 'No jobs found in SerpAPI', method: 'serpapi', duration: Date.now() - startTime, cost: 1 };
        }

        // Try to match by URL, otherwise take first result
        const normalizedTarget = normalizeUrl(url);
        const matchingJob = jobs.find((job: Record<string, unknown>) => {
            const applyOptions = job.apply_options as Array<{ link?: string }> | undefined;
            const shareUrl = (job.share_url as string) || applyOptions?.[0]?.link || '';
            return normalizeUrl(shareUrl) === normalizedTarget;
        }) || jobs[0];

        const extensions = matchingJob.detected_extensions as Record<string, string> | undefined;

        return {
            success: true,
            data: {
                title: matchingJob.title as string,
                company: matchingJob.company_name as string,
                location: matchingJob.location as string || undefined,
                description: (matchingJob.description as string) || '',
                requirements: extractRequirements((matchingJob.description as string) || ''),
                salary: extensions?.salary,
                posted_at: extensions?.posted_at ? new Date(extensions.posted_at) : undefined,
                platform,
                apply_url: url,
            },
            method: 'serpapi',
            duration: Date.now() - startTime,
            cost: 1, // $0.01
        };
    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        return { success: false, error: errMsg, method: 'serpapi', duration: Date.now() - startTime, cost: 1 };
    }
}

// ============================================================
// TIER 2: Jina Reader (URL → Markdown)
// ============================================================

async function scrapeWithJina(url: string, platform: SiteType): Promise<JobScraperResult> {
    const startTime = Date.now();

    const jinaKey = process.env.JINA_READER_API_KEY;

    try {
        const headers: Record<string, string> = {
            'Accept': 'application/json',
        };
        if (jinaKey) {
            headers['Authorization'] = `Bearer ${jinaKey}`;
        }

        const response = await fetch(`https://r.jina.ai/${url}`, {
            headers,
            signal: AbortSignal.timeout(30000),
        });

        if (!response.ok) {
            throw new Error(`Jina Reader returned ${response.status}`);
        }

        const json = await response.json() as { data?: { title?: string; content?: string } };
        const title = json.data?.title || '';
        const content = json.data?.content || '';

        if (!content || content.length < 100) {
            throw new Error('Jina returned insufficient content');
        }

        const extracted = extractJobFromMarkdown(content, platform);

        return {
            success: true,
            data: {
                title: extracted.title || title || 'Unknown Position',
                company: extracted.company || extractCompanyFromUrl(url) || 'Unknown Company',
                location: extracted.location,
                description: extracted.description || content.substring(0, 5000),
                requirements: extractRequirements(content),
                salary: extracted.salary,
                platform,
                apply_url: url,
            },
            method: 'jina',
            duration: Date.now() - startTime,
            cost: 0, // Free tier
        };
    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        return { success: false, error: errMsg, method: 'jina', duration: Date.now() - startTime, cost: 0 };
    }
}

// ============================================================
// TIER 3: Firecrawl (ATS Platforms)
// ============================================================

async function scrapeWithFirecrawl(url: string, platform: SiteType): Promise<JobScraperResult> {
    const startTime = Date.now();

    if (!process.env.FIRECRAWL_API_KEY) {
        return { success: false, error: 'FIRECRAWL_API_KEY not set', method: 'firecrawl', duration: 0, cost: 0 };
    }

    try {
        // Use Firecrawl REST API directly (avoid heavy SDK import)
        const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.FIRECRAWL_API_KEY}`,
            },
            body: JSON.stringify({
                url,
                formats: ['markdown'],
                onlyMainContent: true,
                timeout: 30000,
            }),
            signal: AbortSignal.timeout(35000),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Firecrawl ${response.status}: ${errorText.substring(0, 200)}`);
        }

        const result = await response.json() as { data?: { markdown?: string; metadata?: { title?: string } } };
        const markdown = result.data?.markdown || '';
        const pageTitle = result.data?.metadata?.title || '';

        if (!markdown || markdown.length < 50) {
            throw new Error('Firecrawl returned insufficient content');
        }

        const extracted = extractJobFromMarkdown(markdown, platform);

        return {
            success: true,
            data: {
                title: extracted.title || pageTitle || 'Unknown Position',
                company: extracted.company || extractCompanyFromUrl(url) || 'Unknown Company',
                location: extracted.location,
                description: extracted.description || markdown.substring(0, 5000),
                requirements: extractRequirements(markdown),
                salary: extracted.salary,
                platform,
                apply_url: url,
            },
            method: 'firecrawl',
            duration: Date.now() - startTime,
            cost: 0.2, // $0.002
        };
    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        return { success: false, error: errMsg, method: 'firecrawl', duration: Date.now() - startTime, cost: 0.2 };
    }
}

// ============================================================
// TIER 4: BrightData (LinkedIn Only)
// ============================================================

async function scrapeWithBrightData(url: string, platform: SiteType): Promise<JobScraperResult> {
    const startTime = Date.now();

    if (platform !== 'linkedin') {
        return { success: false, error: 'BrightData only for LinkedIn', method: 'brightdata', duration: 0, cost: 0 };
    }

    if (!process.env.BRIGHT_DATA_API_KEY) {
        return { success: false, error: 'BRIGHT_DATA_API_KEY not set', method: 'brightdata', duration: 0, cost: 0 };
    }

    try {
        const response = await fetch('https://api.brightdata.com/datasets/v3/trigger', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.BRIGHT_DATA_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify([{ url }]),
            signal: AbortSignal.timeout(30000),
        });

        if (!response.ok) {
            throw new Error(`BrightData ${response.status}`);
        }

        const data = await response.json() as Record<string, unknown>;

        return {
            success: true,
            data: {
                title: (data.title as string) || 'Unknown Position',
                company: (data.company as string) || 'Unknown Company',
                location: (data.location as string) || undefined,
                description: (data.description as string) || '',
                requirements: extractRequirements((data.description as string) || ''),
                salary: (data.salary as string) || undefined,
                platform: 'linkedin',
                apply_url: url,
            },
            method: 'brightdata',
            duration: Date.now() - startTime,
            cost: 50, // $0.50
        };
    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        return { success: false, error: errMsg, method: 'brightdata', duration: Date.now() - startTime, cost: 0 };
    }
}

// ============================================================
// TIER 5: Direct Fetch + Cheerio (Universal Fallback)
// ============================================================

async function scrapeWithCheerio(url: string, platform: SiteType): Promise<JobScraperResult> {
    const startTime = Date.now();

    try {
        const { load } = await import('cheerio');

        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
            },
            signal: AbortSignal.timeout(15000),
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const html = await response.text();
        const $ = load(html);

        // Remove scripts, styles, nav, footer
        $('script, style, nav, footer, header, [role="navigation"]').remove();

        // Extract title
        const title =
            $('h1').first().text().trim() ||
            $('[class*="job-title"], [class*="jobTitle"]').first().text().trim() ||
            $('[data-testid="job-title"]').first().text().trim() ||
            $('title').text().trim();

        // Extract company
        const company =
            $('[class*="company"], [class*="employer"]').first().text().trim() ||
            $('[data-testid="company-name"]').first().text().trim() ||
            extractCompanyFromUrl(url) ||
            '';

        // Extract description
        const description =
            $('[class*="description"], [class*="job-description"]').first().text().trim() ||
            $('article').first().text().trim() ||
            $('main').first().text().trim() ||
            $('body').text().trim();

        // Extract location
        const location =
            $('[class*="location"]').first().text().trim() ||
            $('[data-testid="location"]').first().text().trim() ||
            undefined;

        if (!title && !description) {
            throw new Error('Could not extract any job data from HTML');
        }

        return {
            success: true,
            data: {
                title: title || 'Unknown Position',
                company: company || 'Unknown Company',
                location: location || undefined,
                description: (description || '').substring(0, 5000),
                requirements: extractRequirements(description || ''),
                platform,
                apply_url: url,
            },
            method: 'cheerio',
            duration: Date.now() - startTime,
            cost: 0, // FREE
        };
    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        return { success: false, error: errMsg, method: 'cheerio', duration: Date.now() - startTime, cost: 0 };
    }
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function extractSearchQueryFromUrl(url: string, platform: SiteType): string {
    try {
        if (platform === 'stepstone') {
            const match = url.match(/--(.+?)--/);
            if (match) return match[1].replace(/-/g, ' ');
            // Alternative pattern
            const match2 = url.match(/stellenangebote--(.+?)-([\w-]+)--/);
            if (match2) return match2[1].replace(/-/g, ' ');
        }

        if (platform === 'indeed') {
            // Try to extract from URL path
            const urlObj = new URL(url);
            const q = urlObj.searchParams.get('q');
            if (q) return q;
        }

        if (platform === 'linkedin') {
            // LinkedIn job IDs - search generically
            const match = url.match(/currentJobId=(\d+)/);
            if (match) return `LinkedIn job ${match[1]}`;
            const match2 = url.match(/\/jobs\/view\/(\d+)/);
            if (match2) return `LinkedIn job ${match2[1]}`;
        }

        // Generic: use domain name as hint
        const domain = new URL(url).hostname.replace('www.', '').split('.')[0];
        return `${domain} jobs Germany`;
    } catch {
        return 'jobs Germany';
    }
}

function normalizeUrl(url: string): string {
    try {
        const parsed = new URL(url);
        return `${parsed.hostname}${parsed.pathname}`.toLowerCase().replace(/\/+$/, '');
    } catch {
        return url.toLowerCase();
    }
}

function extractCompanyFromUrl(url: string): string | null {
    try {
        const hostname = new URL(url).hostname;
        // jobs.fraunhofer.de → Fraunhofer
        const parts = hostname.replace('www.', '').split('.');
        if (parts[0] === 'jobs' || parts[0] === 'karriere' || parts[0] === 'career') {
            return parts[1] ? parts[1].charAt(0).toUpperCase() + parts[1].slice(1) : null;
        }
        // stepstone.de → StepStone
        return parts[0] ? parts[0].charAt(0).toUpperCase() + parts[0].slice(1) : null;
    } catch {
        return null;
    }
}

export function extractRequirements(description: string): string[] {
    const requirements: string[] = [];

    const patterns = [
        /\b\d+\+?\s*(?:Jahre?|years?)\s+(?:Erfahrung|experience|Berufserfahrung)/gi,
        /\b(?:Bachelor|Master|Diplom|PhD|Promotion|Studium)\b/gi,
        /\b(?:TypeScript|JavaScript|React|Vue|Angular|Next\.?js|Node\.?js|Python|Java|C\+\+|Go|Rust|Swift|Kotlin)\b/gi,
        /\b(?:AWS|Azure|GCP|Docker|Kubernetes|Terraform|CI\/CD|Jenkins|GitLab)\b/gi,
        /\b(?:SQL|PostgreSQL|MongoDB|Redis|Elasticsearch|GraphQL|REST)\b/gi,
        /\b(?:Scrum|Agile|Kanban|DevOps|MLOps)\b/gi,
        /\b(?:TensorFlow|PyTorch|Keras|scikit-learn|Machine Learning|Deep Learning|KI|AI)\b/gi,
    ];

    for (const pattern of patterns) {
        const matches = description.match(pattern);
        if (matches) {
            requirements.push(...matches.map((m) => m.trim()));
        }
    }

    return [...new Set(requirements)].slice(0, 15);
}

interface ExtractedJobInfo {
    title?: string;
    company?: string;
    location?: string;
    description?: string;
    salary?: string;
}

function extractJobFromMarkdown(markdown: string, _platform: SiteType): ExtractedJobInfo {
    const lines = markdown.split('\n');
    const result: ExtractedJobInfo = {};

    // Title: usually the first H1 or H2
    for (const line of lines) {
        if (line.startsWith('# ') || line.startsWith('## ')) {
            const text = line.replace(/^#+\s*/, '').trim();
            if (text.length > 5 && text.length < 200) {
                result.title = text;
                break;
            }
        }
    }

    // Company: look for common patterns
    const companyPatterns = [
        /(?:Unternehmen|Company|Firma|Arbeitgeber|Employer)[:\s]+(.+)/i,
        /(?:bei|at|@)\s+(.+?)(?:\s*[-–|]|\s*$)/i,
    ];
    for (const pattern of companyPatterns) {
        const match = markdown.match(pattern);
        if (match && match[1]) {
            result.company = match[1].trim().substring(0, 100);
            break;
        }
    }

    // Location: look for common patterns
    const locationPatterns = [
        /(?:Standort|Location|Ort|Arbeitsort)[:\s]+(.+?)(?:\n|$)/i,
        /(?:Berlin|München|Hamburg|Frankfurt|Köln|Düsseldorf|Stuttgart|Leipzig|Dresden|Hannover|Nürnberg|Dortmund|Essen|Bremen|Bonn|Oldenburg)(?:\s*[,/]\s*\w+)?/i,
    ];
    for (const pattern of locationPatterns) {
        const match = markdown.match(pattern);
        if (match) {
            result.location = (match[1] || match[0]).trim().substring(0, 100);
            break;
        }
    }

    // Salary
    const salaryMatch = markdown.match(
        /(?:Gehalt|Salary|Vergütung|Bezahlung)[:\s]*(.+?)(?:\n|$)/i
    ) || markdown.match(
        /(\d{2,3}[\.,]?\d{3}\s*[-–]\s*\d{2,3}[\.,]?\d{3}\s*(?:€|EUR|Euro))/i
    );
    if (salaryMatch) {
        result.salary = (salaryMatch[1] || salaryMatch[0]).trim();
    }

    // Description: everything after the title, cleaned
    const titleIndex = result.title ? markdown.indexOf(result.title) : 0;
    result.description = markdown
        .substring(titleIndex)
        .replace(/^#+\s*.+\n/, '')
        .trim()
        .substring(0, 5000);

    return result;
}
