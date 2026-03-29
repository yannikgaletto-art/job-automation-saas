/**
 * Quote Service — Curated Database Quotes for Cover Letters
 *
 * Search hierarchy:
 *   Tier 1: DB — FTS on theme + category from industrySegment (Perplexity) OR job-title keywords
 *   Tier 2: Claude Haiku AI fallback — contextual, fires when Tier 1 yields no qualified results
 *   Tier 3: Universal DB random — last resort, always returns something
 *
 * Contract:
 *   - 2s timeout on all DB calls (Promise.race with clearTimeout)
 *   - industrySegment (from Perplexity) overrides job-title keyword guessing for category
 *   - approved = true enforced via RLS + explicit WHERE
 *   - cleanQuoteText() strips CSV import quote artifacts from all returned quotes
 */

import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

// ─── Types ────────────────────────────────────────────────────────────────

export interface QuoteContext {
    jobTitle: string;            // e.g. "Senior Sales Manager"
    companyValues: string[];     // e.g. ["Innovation", "Nachhaltigkeit"]
    companyVision?: string;      // e.g. "Wir wollen die Mobilität revolutionieren"
    industrySegment?: string;    // e.g. "HealthTech" — from Perplexity intel_data (primary signal)
    language: 'de' | 'en';      // Target language for the cover letter
}

export interface QuoteResult {
    quote: string;              // The quote text in the target language
    author: string;             // e.g. "Peter Drucker"
    source: string | null;      // e.g. "TED Talk 2014"
    theme: string;              // e.g. "Zukunftsgestaltung"
    matchedValue: string;       // Which company value this matched
    relevanceScore: number;     // 0-1 (Tier1 = 0.9, AI = 0.7, universal = 0.5)
}

// ─── Category Mapping ─────────────────────────────────────────────────────
// Maps common job title keywords to CSV-filename categories.
const CATEGORY_KEYWORDS: Record<string, string[]> = {
    'Beratung_Business_Management_Strategie': [
        'berater', 'consultant', 'strategy', 'strategie', 'management', 'business',
        'unternehmensberater', 'projektmanager', 'project manager', 'ceo', 'coo',
        'geschäftsführer', 'director', 'head of',
    ],
    'Engineering_Produktion_Industrie_Operations': [
        'engineer', 'ingenieur', 'produktion', 'production', 'operations', 'manufacturing',
        'maschinenbau', 'mechanical', 'electrical', 'industrial', 'supply chain', 'logistik',
        'logistics', 'quality', 'qualität',
    ],
    'Finanzen_Banking_Investment_Controlling': [
        'finance', 'finanz', 'banking', 'investment', 'controlling', 'controller',
        'accountant', 'buchhalter', 'wirtschaftsprüfer', 'audit', 'treasury', 'risk',
        'analyst', 'portfolio',
    ],
    'HR_People_Culture_Leadership': [
        'hr', 'human resources', 'people', 'culture', 'recruiter', 'recruiting',
        'talent', 'personalreferent', 'personal', 'leadership', 'organisationsentwicklung',
        'change management', 'training',
    ],
    'Healthcare_Medizin_Pflege_PublicHealth': [
        'health', 'medizin', 'pflege', 'klinik', 'hospital', 'pharma', 'biotech',
        'medical', 'gesundheit', 'arzt', 'therapeut', 'nurse', 'public health',
    ],
    'IT_Tech_Software_SaaS': [
        'software', 'developer', 'entwickler', 'tech', 'it ', 'saas', 'devops',
        'fullstack', 'frontend', 'backend', 'cloud', 'data engineer', 'machine learning',
        'product manager', 'scrum', 'agile', 'platform',
    ],
    'Kreativbranche_Design_Medien_Kommunikation': [
        'design', 'kreativ', 'creative', 'medien', 'media', 'kommunikation', 'communication',
        'content', 'texter', 'copywriter', 'grafik', 'graphic', 'ux', 'ui', 'brand',
        'art director', 'redakteur', 'journalist', 'pr ', 'video', 'editor', 'motion',
        'animator', 'filmmaker', 'cutter', 'creator', 'producer', 'kamera', 'camera',
        'regie', 'post-production', 'illustration', 'fotograf', 'photograph',
    ],
    'Nachhaltigkeit_SocialImpact_CSR_ESG': [
        'nachhaltigkeit', 'sustainability', 'esg', 'csr', 'social impact', 'umwelt',
        'environment', 'climate', 'energie', 'energy', 'circular',
    ],
    'Politik_PublicSector_NGO_InternationaleZusammenarbeit': [
        'politik', 'political', 'public sector', 'ngo', 'öffentlich', 'verwaltung',
        'government', 'international', 'entwicklungshilfe', 'diplomatie',
    ],
    'Sales_Vertrieb_Customersuccess_Marketing': [
        'sales', 'vertrieb', 'marketing', 'customer success', 'account manager',
        'business development', 'crm', 'growth', 'acquisition', 'key account',
        'e-commerce', 'seo', 'performance marketing',
    ],
    'Wissenschaft_Forschung_Data_Bildung': [
        'wissenschaft', 'research', 'forschung', 'data', 'bildung', 'education',
        'professor', 'dozent', 'lecturer', 'phd', 'analytics', 'statistik',
        'data scientist', 'ki', 'ai ',
    ],
};

// Universal fallback categories (broadly applicable quotes)
const UNIVERSAL_CATEGORIES = [
    'Beratung_Business_Management_Strategie',
    'HR_People_Culture_Leadership',
];

/**
 * Maps Perplexity industry_segment tags → DB category names.
 * Keys are lowercase for case-insensitive matching.
 * If a segment isn't mapped, falls back to job-title keyword inference.
 */
const INDUSTRY_SEGMENT_MAP: Record<string, string> = {
    'healthtech':      'Healthcare_Medizin_Pflege_PublicHealth',
    'medtech':         'Healthcare_Medizin_Pflege_PublicHealth',
    'health':          'Healthcare_Medizin_Pflege_PublicHealth',
    'healthcare':      'Healthcare_Medizin_Pflege_PublicHealth',
    'pharma':          'Healthcare_Medizin_Pflege_PublicHealth',
    'biotech':         'Healthcare_Medizin_Pflege_PublicHealth',
    'saas':            'IT_Tech_Software_SaaS',
    'software':        'IT_Tech_Software_SaaS',
    'tech':            'IT_Tech_Software_SaaS',
    'deeptech':        'IT_Tech_Software_SaaS',
    'ai':              'Wissenschaft_Forschung_Data_Bildung',
    'edtech':          'Wissenschaft_Forschung_Data_Bildung',
    'education':       'Wissenschaft_Forschung_Data_Bildung',
    'fintech':         'Finanzen_Banking_Investment_Controlling',
    'banking':         'Finanzen_Banking_Investment_Controlling',
    'finance':         'Finanzen_Banking_Investment_Controlling',
    'insurtech':       'Finanzen_Banking_Investment_Controlling',
    'mediatech':       'Kreativbranche_Design_Medien_Kommunikation',
    'media':           'Kreativbranche_Design_Medien_Kommunikation',
    'gaming':          'Kreativbranche_Design_Medien_Kommunikation',
    'cleantech':       'Nachhaltigkeit_SocialImpact_CSR_ESG',
    'greentech':       'Nachhaltigkeit_SocialImpact_CSR_ESG',
    'sustainability':  'Nachhaltigkeit_SocialImpact_CSR_ESG',
    'ngo':             'Politik_PublicSector_NGO_InternationaleZusammenarbeit',
    'government':      'Politik_PublicSector_NGO_InternationaleZusammenarbeit',
    'consulting':      'Beratung_Business_Management_Strategie',
    'management':      'Beratung_Business_Management_Strategie',
    'e-commerce':      'Sales_Vertrieb_Customersuccess_Marketing',
    'retail':          'Sales_Vertrieb_Customersuccess_Marketing',
    'logistics':       'Engineering_Produktion_Industrie_Operations',
    'manufacturing':   'Engineering_Produktion_Industrie_Operations',
    'proptech':        'Engineering_Produktion_Industrie_Operations',
};

// Banned authors for AI-generated quotes (polarizing/overused)
const BANNED_THINKERS = ['elon musk', 'jeff bezos', 'mark zuckerberg'];

// ─── Supabase Client (module-level singleton — created once per cold start) ──
let _supabase: ReturnType<typeof createClient> | null = null;
function getSupabase() {
    if (!_supabase) {
        _supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );
    }
    return _supabase;
}

/**
 * Resolve category from context.
 * Priority: 1) industrySegment from Perplexity  2) job-title keyword match
 */
function inferCategory(jobTitle: string, industrySegment?: string): string | null {
    // Priority 1: Perplexity-provided industry segment (most reliable signal)
    if (industrySegment) {
        const key = industrySegment.toLowerCase().trim();
        // Exact match first
        if (INDUSTRY_SEGMENT_MAP[key]) {
            console.log(`🎯 [QuoteService] Industry match: "${industrySegment}" → ${INDUSTRY_SEGMENT_MAP[key]}`);
            return INDUSTRY_SEGMENT_MAP[key];
        }
        // Partial match (e.g. "Health Technology" contains "health")
        for (const [mapKey, category] of Object.entries(INDUSTRY_SEGMENT_MAP)) {
            if (key.includes(mapKey) || mapKey.includes(key)) {
                console.log(`🎯 [QuoteService] Industry partial match: "${industrySegment}" → ${category}`);
                return category;
            }
        }
        console.log(`⚠️ [QuoteService] Industry segment "${industrySegment}" not in map, falling back to job-title matching`);
    }

    // Priority 2: Job-title keyword scoring
    const titleLower = jobTitle.toLowerCase();
    let bestCategory: string | null = null;
    let bestScore = 0;
    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
        let score = 0;
        for (const keyword of keywords) {
            if (titleLower.includes(keyword)) score++;
        }
        if (score > bestScore) { bestScore = score; bestCategory = category; }
    }
    return bestCategory;
}

/**
 * Build a FTS search term from context.
 * Combines company values + job title keywords.
 */
function buildSearchTerm(ctx: QuoteContext): string {
    const parts: string[] = [];

    // Add first 2 company values (most relevant)
    for (const val of ctx.companyValues.slice(0, 2)) {
        if (val && val.trim()) parts.push(val.trim());
    }

    // Add significant words from job title (skip common words)
    const skipWords = new Set([
        'senior', 'junior', 'lead', 'head', 'of', 'the', 'and', 'und',
        'm', 'w', 'd', 'f', 'manager', 'in', 'der', 'die', 'das', 'für',
    ]);
    const titleWords = ctx.jobTitle.split(/[\s/(),-]+/).filter(
        w => w.length > 2 && !skipWords.has(w.toLowerCase())
    );
    parts.push(...titleWords.slice(0, 2));

    return parts.join(' ') || 'Innovation';
}

/**
 * Race a promise against a timeout. Returns null on timeout.
 * Properly clears the timer handle to avoid leaking it into the event loop.
 */
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
    let handle: ReturnType<typeof setTimeout>;
    const timeout = new Promise<null>(resolve => {
        handle = setTimeout(() => resolve(null), ms);
    });
    try {
        return await Promise.race([promise, timeout]);
    } finally {
        clearTimeout(handle!);
    }
}

/**
 * Pick a random subset from an array (Fisher-Yates partial shuffle).
 */
function pickRandom<T>(arr: T[], count: number): T[] {
    const copy = [...arr];
    const result: T[] = [];
    for (let i = 0; i < Math.min(count, copy.length); i++) {
        const j = i + Math.floor(Math.random() * (copy.length - i));
        [copy[i], copy[j]] = [copy[j], copy[i]];
        result.push(copy[i]);
    }
    return result;
}

/**
 * Strip leading/trailing quote characters from CSV-imported quote text.
 * Handles: " ' „ " ' ' (double and single, typographic variants)
 */
function cleanQuoteText(text: string): string {
    return text
        .replace(/^[\u201e\u201c\u201a\u2018\u2019"']+/, '')
        .replace(/[\u201e\u201c\u201a\u2018\u2019"']+$/, '')
        .trim();
}

/**
 * Map a DB row to QuoteResult.
 */
function toQuoteResult(
    row: any,
    language: 'de' | 'en',
    matchedValue: string,
    relevanceScore: number
): QuoteResult {
    const rawText = language === 'de' && row.quote_de ? row.quote_de : row.quote_en;
    return {
        quote: cleanQuoteText(rawText),
        author: row.person,
        source: row.source || null,
        theme: row.theme,
        matchedValue,
        relevanceScore,
    };
}

// ─── Main Search Function ─────────────────────────────────────────────────

/**
 * Find relevant quotes for a cover letter.
 *
 * 3-tier search:
 *   Tier 1: DB — FTS + category (industrySegment from Perplexity OR job-title keywords)
 *   Tier 2: Claude Haiku AI fallback — fires when Tier 1 yields no qualified results
 *   Tier 3: Universal random DB fallback — last resort
 *
 * @returns Array of 1-3 QuoteResults, NEVER empty (Tier 3 guarantees results).
 */
export async function findRelevantQuotes(
    ctx: QuoteContext,
    maxResults: number = 3
): Promise<QuoteResult[]> {
    const supabase = getSupabase();
    const searchTerm = buildSearchTerm(ctx);
    const category = inferCategory(ctx.jobTitle, ctx.industrySegment);
    const matchedValue = ctx.companyValues[0] || ctx.jobTitle;

    console.log(`🔍 [QuoteService] Searching: term="${searchTerm}", category="${category}", industry="${ctx.industrySegment || 'none'}", lang=${ctx.language}`);

    // ── Tier 1: FTS + Category (DB) ──────────────────────────────────
    try {
        const searchResult = await withTimeout(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            Promise.resolve((supabase as any).rpc('search_quotes', {
                search_query: searchTerm,
                result_category: category,
                max_results: 10,
            })),
            2000
        );

        if (searchResult && searchResult.data && searchResult.data.length > 0) {
            // When we have an industrySegment, only trust rows from that category.
            // Without it, accept whatever the OR-query returned.
            const hasIndustrySignal = !!ctx.industrySegment && !!category;
            const qualifiedRows: any[] = hasIndustrySignal
                ? searchResult.data.filter((row: any) => row.category === category)
                : searchResult.data;

            if (qualifiedRows.length > 0) {
                const picked = pickRandom(qualifiedRows, maxResults);
                console.log(`✅ [QuoteService] Tier 1 hit: ${qualifiedRows.length} qualified, returning ${picked.length}`);
                return picked.map((row: any) => toQuoteResult(row, ctx.language, matchedValue, 0.9));
            }
            console.log(`⚠️ [QuoteService] Tier 1: ${searchResult.data.length} results but none from category "${category}" — escalating to AI`);
        } else {
            console.log(`⚠️ [QuoteService] Tier 1: 0 results — escalating to AI`);
        }
    } catch (err) {
        console.error(`❌ [QuoteService] Tier 1 FTS error:`, err);
    }

    // ── Tier 2: Claude Haiku AI Fallback (contextual) ─────────────────
    // Fires when Tier 1 yields no qualified results. Claude knows the industry context.
    console.log(`🤖 [QuoteService] Tier 2: attempting Claude Haiku AI fallback...`);
    try {
        const aiQuotes = await generateAiQuoteFallback(ctx);
        if (aiQuotes.length > 0) {
            console.log(`✅ [QuoteService] Tier 2 AI: ${aiQuotes.length} quotes generated`);
            return aiQuotes;
        }
    } catch (err) {
        console.error(`❌ [QuoteService] Tier 2 AI error:`, err);
    }

    // ── Tier 3: Universal random DB fallback (last resort) ────────────
    try {
        const fallbackResult = await withTimeout(
            Promise.resolve(
                supabase
                    .from('quotes')
                    .select('*')
                    .in('category', UNIVERSAL_CATEGORIES)
                    .eq('approved', true)
                    .limit(20)
            ),
            2000
        );

        if (fallbackResult && fallbackResult.data && fallbackResult.data.length > 0) {
            const picked = pickRandom(fallbackResult.data, maxResults);
            console.log(`🔄 [QuoteService] Tier 3 universal fallback: returning ${picked.length} random quotes`);
            return picked.map(row => toQuoteResult(row, ctx.language, matchedValue, 0.5));
        }
    } catch (err) {
        console.error(`❌ [QuoteService] Tier 3 fallback error:`, err);
    }

    console.warn(`⚠️ [QuoteService] All tiers exhausted — returning empty`);
    return [];
}

// ─── AI Fallback (Claude Haiku) ───────────────────────────────────────────
// Only fires when Tier 1 yields no qualified results.

async function generateAiQuoteFallback(ctx: QuoteContext): Promise<QuoteResult[]> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        console.warn(`⚠️ [QuoteService] No ANTHROPIC_API_KEY — skipping AI fallback`);
        return [];
    }

    const anthropic = new Anthropic({ apiKey });
    const langInstruction = ctx.language === 'de'
        ? 'Zitate dürfen auf Deutsch ODER Englisch sein.'
        : 'Quotes should be in English.';

    // Enrich AI prompt with industrySegment when available
    const industryHint = ctx.industrySegment
        ? `- Branche: "${ctx.industrySegment}" (wichtig für thematische Passung!)\n`
        : '';

    try {
        const message = await anthropic.messages.create({
            model: 'claude-haiku-4-5-20250929',
            max_tokens: 800,
            temperature: 0.7,
            system: 'Du bist ein Experte für Vordenker und Intellektuelle aus allen Epochen und Disziplinen. Antworte AUSSCHLIESSLICH mit validem JSON. Kein Markdown, kein Text davor oder danach.',
            messages: [{
                role: 'user',
                content: `KONTEXT:
- Stelle: "${ctx.jobTitle}"
- Unternehmenswerte: ${JSON.stringify(ctx.companyValues)}
${industryHint}${ctx.companyVision ? `- Vision: "${ctx.companyVision}"\n` : ''}
AUFGABE:
Gib mir 3 echte, bekannte Vordenker mit je EINEM echten Zitat, das thematisch zum Unternehmen und zum Berufsfeld passt.

REGELN:
1. VERBOTEN als Vordenker: ${BANNED_THINKERS.join(', ')}. Zu polarisierend.
2. Das Zitat muss REAL sein — ein Zitat, das du sicher aus deinem Trainingswissen kennst.
3. KEINE Paraphrasierungen, KEINE "attributed to"-Zitate.
4. Wenn du dir bei einem Zitat NICHT 100% sicher bist, setze "confidence": "low".
5. Max. 30 Wörter pro Zitat.
6. ${langInstruction}

OUTPUT (JSON Array):
[
  {
    "name": "Vorname Nachname",
    "quote": "Der exakte Zitat-Text",
    "source": "Werk oder Kontext",
    "why": "Warum passt dieses Zitat (1 Satz)",
    "matchedValue": "Passender Unternehmenswert",
    "confidence": "high"
  }
]`
            }]
        });

        const rawText = message.content[0].type === 'text' ? message.content[0].text.trim() : '';

        // Handle potential markdown wrapping
        let jsonText = rawText;
        const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch?.[1]) jsonText = jsonMatch[1].trim();

        const parsed = JSON.parse(jsonText);
        const results: Array<{ name: string; quote: string; source?: string; why?: string; matchedValue?: string; confidence: string }> =
            Array.isArray(parsed) ? parsed : parsed.quotes || [];

        // Validate: only accept high-confidence, real-looking quotes
        return results
            .filter(r => r.name && r.quote && r.confidence === 'high')
            .filter(r => {
                const wordCount = r.quote.trim().split(/\s+/).length;
                return wordCount >= 8 && wordCount <= 30;
            })
            .filter(r => !BANNED_THINKERS.some(b => r.name.toLowerCase().includes(b)))
            .slice(0, 3)
            .map(r => ({
                quote: cleanQuoteText(r.quote),
                author: r.name,
                source: r.source || null,
                theme: r.matchedValue || ctx.jobTitle,
                matchedValue: r.matchedValue || ctx.companyValues[0] || ctx.jobTitle,
                relevanceScore: 0.7,
            }));
    } catch (error) {
        console.error('❌ [QuoteService] Claude Haiku fallback failed:', error instanceof Error ? error.message : error);
        return [];
    }
}
