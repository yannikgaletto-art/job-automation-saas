export const dynamic = 'force-dynamic';

/**
 * POST /api/job-search/query
 * 
 * Searches SerpAPI Google Jobs, caches in saved_job_searches (4h TTL),
 * deduplicates against job_queue, and enforces max 10 saved searches.
 * 
 * Supports two modes:
 * - 'keyword' (default): Direct SerpAPI query with user-provided keywords
 * - 'mission': GPT-4o-mini translates natural-language intent into keywords
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { searchJobs, type JobSearchFilters, type SerpLocale } from '@/lib/services/job-search-pipeline';
import { complete } from '@/lib/ai/model-router';
import { requireJobSearchQuota, handleBillingError } from '@/lib/middleware/credit-gate';
import { incrementJobSearchUsage } from '@/lib/services/credit-service';
import { createRateLimiter, checkRateLimit } from '@/lib/api/rate-limit';

const jobSearchLimiter = createRateLimiter({ maxRequests: 10, windowMs: 60_000 });

const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours
const MAX_SAVED_SEARCHES = 10;

// ─── SerpAPI locale derivation ────────────────────────────────────
// SerpAPI has TWO independent params:
//   `hl` = metadata language (posted_at, salary, schedule_type strings)
//   `gl` = geographic country (which job index to search)
// `hl` follows the USER'S UI locale. `gl` follows the JOB LOCATION.

const LOCATION_GL_MAP: Record<string, string> = {
    'deutschland': 'de', 'germany': 'de', 'berlin': 'de',
    'münchen': 'de', 'munich': 'de', 'hamburg': 'de',
    'frankfurt': 'de', 'köln': 'de', 'cologne': 'de',
    'düsseldorf': 'de', 'stuttgart': 'de', 'hannover': 'de',
    'nürnberg': 'de', 'leipzig': 'de', 'dresden': 'de',
    'österreich': 'at', 'austria': 'at', 'wien': 'at', 'vienna': 'at',
    'schweiz': 'ch', 'switzerland': 'ch', 'zürich': 'ch',
    'uk': 'gb', 'united kingdom': 'gb', 'london': 'gb',
    'usa': 'us', 'united states': 'us', 'new york': 'us', 'san francisco': 'us',
    'españa': 'es', 'spain': 'es', 'madrid': 'es', 'barcelona': 'es',
};

function deriveSerpLocale(location: string, userLocale: string): SerpLocale {
    const lower = location.toLowerCase().trim();
    let gl = 'de'; // Default: German job market
    for (const [key, country] of Object.entries(LOCATION_GL_MAP)) {
        if (lower.includes(key)) { gl = country; break; }
    }
    const hl = ['de', 'en', 'es'].includes(userLocale) ? userLocale : 'de';
    return { hl, gl };
}



// ─── Mission Mode: Intent → Keywords ─────────────────────────────

async function translateMissionIntent(
    intent: string,
    fallbackLocation: string,
    locale: string = 'de',
): Promise<{ query: string; location: string }> {
    try {
        const systemPromptDE = `Du bist ein HR-Suchexperte. Der User beschreibt seine Karriere-Vision als Freitext.
Deine Aufgabe: Übersetze die Vision in einen KONKRETEN Jobtitel oder Berufsbezeichnung, die auf Google Jobs tatsächlich gefunden wird.

Regeln:
1. Der Suchbegriff MUSS ein realer Jobtitel sein (z.B. "Sustainability Manager", "Umweltberater", "CSR Referent"), KEIN abstraktes Konzept
2. Max 4 Wörter, deutsch oder englisch — je nachdem was auf dem Jobmarkt üblicher ist
3. Wenn die Vision abstrakt ist, finde den nächstliegenden, real existierenden Jobtitel
4. Standort extrahieren (falls erwähnt, sonst "Deutschland")

Beispiele:
- "Ich möchte das Umweltbewusstsein stärken" → "Sustainability Manager"
- "Ich will die Welt durch Technologie verbessern" → "Impact Engineer"
- "Ich möchte Menschen bei der Karriere helfen" → "Career Coach"

Antworte AUSSCHLIESSLICH in diesem JSON-Format:
{"query": "...", "location": "..."}
Keine Erklärungen, kein Markdown, nur das nackte JSON-Objekt.`;

        const systemPromptEN = `You are an HR search expert. The user describes their career vision as free text.
Your task: Translate the vision into a CONCRETE job title that is actually found on Google Jobs.

Rules:
1. The search term MUST be a real job title (e.g. "Sustainability Manager", "Data Engineer", "Product Manager"), NOT an abstract concept
2. Max 4 words, in the language most common on the job market
3. If the vision is abstract, find the closest real, existing job title
4. Extract location (if mentioned, otherwise "Germany")

Respond EXCLUSIVELY in this JSON format:
{"query": "...", "location": "..."}
No explanations, no markdown, just the raw JSON object.`;

        const systemPromptES = `Eres un experto en búsqueda de RRHH. El usuario describe su visión profesional como texto libre.
Tu tarea: Traduce la visión a un TÍTULO DE PUESTO CONCRETO que se encuentre realmente en Google Jobs.

Reglas:
1. El término de búsqueda DEBE ser un título de puesto real (ej. "Sustainability Manager", "Ingeniero de Datos"), NO un concepto abstracto
2. Máximo 4 palabras, en el idioma más común en el mercado laboral
3. Si la visión es abstracta, encuentra el título de puesto real más cercano
4. Extraer ubicación (si se menciona, sino "Alemania")

Responde EXCLUSIVAMENTE en este formato JSON:
{"query": "...", "location": "..."}
Sin explicaciones, sin markdown, solo el objeto JSON.`;

        const systemPrompt = locale === 'en' ? systemPromptEN : locale === 'es' ? systemPromptES : systemPromptDE;

        const response = await complete({
            taskType: 'classify_job_board', // Cheap Haiku task: structured classification
            systemPrompt,
            prompt: intent,
            temperature: 0.3,
            maxTokens: 100,
        });

        // Robust JSON parsing — no response_format: json_object in Anthropic SDK
        let parsed: { query?: string; location?: string };
        try {
            parsed = JSON.parse(response.text.trim());
        } catch {
            const jsonMatch = response.text.match(/\{[\s\S]*?\}/);
            parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
        }

        const extractedQuery = typeof parsed.query === 'string' && parsed.query.trim()
            ? parsed.query.trim()
            : intent;
        const extractedLocation = typeof parsed.location === 'string' && parsed.location.trim()
            ? parsed.location.trim()
            : fallbackLocation || 'Deutschland';

        console.log(`✅ [Search] Mission translated: "${intent}" → query="${extractedQuery}", location="${extractedLocation}"`);
        return { query: extractedQuery, location: extractedLocation };
    } catch (err) {
        console.warn('⚠️ [Search] Mission mode fallback to raw query:', err instanceof Error ? err.message : String(err));
        return { query: intent, location: fallbackLocation || 'Deutschland' };
    }
}

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        // Rate limit: max 10 searches/min to prevent SerpAPI cost spikes
        const rateLimited = checkRateLimit(jobSearchLimiter, user.id, 'job-search/query');
        if (rateLimited) return rateLimited;

        const body = await request.json();
        const { query, location, filters, forceRefresh, mode } = body as {
            query: string;
            location: string;
            filters?: JobSearchFilters;
            forceRefresh?: boolean;
            mode?: 'keyword' | 'mission';
        };

        if (!query?.trim()) {
            return NextResponse.json({ error: 'Query is required' }, { status: 400 });
        }

        // §BILLING: Job Search Quota Gate — Free users (0 searches) blocked
        try {
            await requireJobSearchQuota(user.id);
        } catch (quotaError) {
            const billingResponse = handleBillingError(quotaError);
            if (billingResponse) return billingResponse;
            throw quotaError;
        }

        const searchMode = mode || 'keyword';
        const trimmedQuery = query.trim();
        const trimmedLocation = (location || '').trim();

        // ─── Mission Mode: translate intent → keywords ──────────────
        let serpApiQuery = trimmedQuery;
        let serpApiLocation = trimmedLocation;

        // ─── Read user locale from DB ─────────────────────────────────
        // Used for: (1) SerpAPI `hl` param (metadata language)
        //           (2) Mission Mode prompt language
        const { data: userSettings } = await supabase
            .from('user_settings')
            .select('language')
            .eq('user_id', user.id)
            .single();
        const userLocale = userSettings?.language || 'de';

        if (searchMode === 'mission') {
            const translated = await translateMissionIntent(trimmedQuery, trimmedLocation, userLocale);
            serpApiQuery = translated.query;
            serpApiLocation = translated.location;
        }

        // ─── §12.4 Filter-Enriched Query: inject Werte keywords ─────
        // Append active Werte-filter labels to the SerpAPI query so
        // Google Jobs returns relevant results directly (not just post-tagging).
        if (filters?.werte && filters.werte.length > 0) {
            const WERTE_KEYWORDS: Record<string, string> = {
                nachhaltigkeit: 'Nachhaltigkeit',
                innovation: 'Innovation',
                social_impact: 'Social Impact',
                deep_tech: 'AI',
                dei: 'Diversity',
                gemeinwohl: 'Gemeinwohl',
                circular_economy: 'Kreislaufwirtschaft',
                new_work: 'Remote',
            };
            // Append only the first filter keyword to avoid over-constraining
            const firstKeyword = WERTE_KEYWORDS[filters.werte[0]];
            if (firstKeyword && !serpApiQuery.toLowerCase().includes(firstKeyword.toLowerCase())) {
                serpApiQuery = `${serpApiQuery} ${firstKeyword}`;
                console.log(`✅ [Search] Filter-enriched query: "${serpApiQuery}"`);
            }
        }

        // ─── §12.4 Cache Check (skip if empty or stale) ────────────
        // Note: We DO NOT skip cache for locale changes — SerpAPI language
        // is now derived from job location, not user UI locale.
        const hasWerteFilters = filters?.werte && filters.werte.length > 0;
        const { data: cached } = await supabase
            .from('saved_job_searches')
            .select('*')
            .eq('user_id', user.id)
            .eq('query', trimmedQuery)
            .eq('location', trimmedLocation)
            .single();

        if (cached && !forceRefresh && !hasWerteFilters) {
            const fetchedAt = new Date(cached.fetched_at).getTime();
            const now = Date.now();
            const hasResults = (cached.results || []).length > 0;
            // GUARD: never serve empty cached results — re-fetch instead
            if (now - fetchedAt < CACHE_TTL_MS && hasResults) {
                console.log(`✅ [Search] Cache hit for "${trimmedQuery}" in "${trimmedLocation}"`);

                // Cross-queue check for cached results
                const results = (cached.results || []) as any[];
                const enriched = await enrichWithQueueStatus(supabase, user.id, results);

                return NextResponse.json({
                    results: enriched,
                    cached: true,
                    search_id: cached.id,
                    result_count: enriched.length,
                });
            }
        }

        // ─── 2. SerpAPI Fetch ─────────────────────────────────────────
        // hl = user locale (metadata language), gl = location (job market)
        const serpLocale = deriveSerpLocale(serpApiLocation, userLocale);
        console.log(`✅ [Search] Querying SerpAPI: "${serpApiQuery}" in "${serpApiLocation}" [hl=${serpLocale.hl}, gl=${serpLocale.gl}]`);
        const jobs = await searchJobs(serpApiQuery, serpApiLocation, filters, serpLocale);

        // §BILLING: Count this as a used search (only for actual API calls, not cache hits)
        await incrementJobSearchUsage(user.id);

        // ─── 3. Cross-Queue Check ────────────────────────────────────
        const enriched = await enrichWithQueueStatus(supabase, user.id, jobs);

        // ─── 3.5. Tag jobs with matching Werte-Filters ───────────────
        const tagged = await tagJobsWithFilters(enriched, filters?.werte);

        // ─── 4. Upsert into saved_job_searches ──────────────────────
        // query = original intent text (so accordion header shows user's words)
        const { data: upserted, error: upsertError } = await supabase
            .from('saved_job_searches')
            .upsert({
                user_id: user.id,
                query: trimmedQuery,
                location: trimmedLocation,
                filters: filters || {},
                results: tagged,
                result_count: tagged.length,
                fetched_at: new Date().toISOString(),
                search_mode: searchMode,
            }, {
                onConflict: 'user_id,query,location',
                ignoreDuplicates: false,
            })
            .select('id')
            .single();

        if (upsertError) {
            // Graceful degradation: return results so user sees what they waited for,
            // but flag that persistence failed — results will vanish on next navigation.
            console.error('⚠️ [Search] Upsert failed — results NOT persisted:', upsertError.message);
            return NextResponse.json({
                results: tagged,
                cached: false,
                search_id: null,
                result_count: tagged.length,
                persisted: false,
                warning: 'Ergebnisse konnten nicht gespeichert werden. Sie gehen beim Seitenwechsel verloren.',
            });
        }

        // ─── 5. Enforce max 10 searches ──────────────────────────────
        await enforceMaxSearches(supabase, user.id);

        return NextResponse.json({
            results: tagged,
            cached: false,
            search_id: upserted?.id || null,
            result_count: tagged.length,
        });
    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error('❌ [Search] Error:', errMsg);
        return NextResponse.json({ error: errMsg }, { status: 500 });
    }
}

// ─── Helpers ──────────────────────────────────────────────────────

async function enrichWithQueueStatus(
    supabase: any,
    userId: string,
    jobs: any[],
) {
    if (jobs.length === 0) return jobs;

    const applyLinks = jobs
        .map(j => j.apply_link)
        .filter(Boolean);

    if (applyLinks.length === 0) return jobs;

    const { data: existingJobs } = await supabase
        .from('job_queue')
        .select('source_url')
        .eq('user_id', userId)
        .in('source_url', applyLinks);

    const queuedUrls = new Set((existingJobs || []).map((j: any) => j.source_url));

    return jobs.map(job => ({
        ...job,
        already_in_queue: queuedUrls.has(job.apply_link),
    }));
}

async function enforceMaxSearches(supabase: any, userId: string) {
    const { data: allSearches } = await supabase
        .from('saved_job_searches')
        .select('id')
        .eq('user_id', userId)
        .order('fetched_at', { ascending: false });

    if (allSearches && allSearches.length > MAX_SAVED_SEARCHES) {
        const toDelete = allSearches.slice(MAX_SAVED_SEARCHES).map((s: any) => s.id);
        await supabase
            .from('saved_job_searches')
            .delete()
            .in('id', toDelete);
        console.log(`[Search] Cleaned up ${toDelete.length} old searches`);
    }
}

// ─── Claude 4.5 Haiku Werte-Filter Tagging ──────────────────────────
// MIGRATION NOTE (2026-03-28): Replaced GPT-4o-mini with Claude Haiku via model-router

async function tagJobsWithFilters(
    jobs: any[],
    activeFilters?: string[]
): Promise<any[]> {
    // Only tag if user has selected Werte-Filters
    if (!activeFilters || activeFilters.length === 0 || jobs.length === 0) {
        return jobs.map(j => ({ ...j, matched_filters: [] }));
    }

    if (!process.env.ANTHROPIC_API_KEY) {
        return jobs.map(j => ({ ...j, matched_filters: [] }));
    }

    try {
        const jobSummaries = jobs.map((j, i) =>
            `Job ${i}: "${j.title}" bei ${j.company_name}. ${(j.description || '').slice(0, 200)}`
        ).join('\n');

        const filterLabels: Record<string, string> = {
            nachhaltigkeit: 'Nachhaltigkeit (ESG, Klimaschutz, Umwelt)',
            innovation: 'Innovation (Disruption, Transformation)',
            social_impact: 'Social Impact (gemeinnützig, NGO, sozial)',
            deep_tech: 'Deep Tech (KI, AI, Machine Learning, Forschung)',
            dei: 'Diversity / Equity / Inclusion (Chancengleichheit, Vielfalt)',
            gemeinwohl: 'Gemeinwohl (gemeinnützig, Wohlfahrt, Sozialwirtschaft)',
            circular_economy: 'Circular Economy (Kreislaufwirtschaft, Recycling)',
            new_work: 'New Work (Remote, Hybrid, Flexibles Arbeiten, Agilität)',
        };

        const filterDescriptions = activeFilters
            .map(f => `"${f}": ${filterLabels[f] || f}`)
            .join(', ');

        const response = await complete({
            taskType: 'classify_job_board',
            systemPrompt: `Klassifiziere Jobs nach Werte-Filtern. Aktive Filter: ${filterDescriptions}.
Für jeden Job: Gib nur die Filter zurück, die WIRKLICH aus dem Text ersichtlich sind. Halluziniere NICHT.
Antwort als JSON: {"tags": [["filter1"], ["filter1", "filter2"], [], ...]}
Das Array hat exakt ${jobs.length} Einträge (einer pro Job). Leeres Array = kein Filter passt.`,
            prompt: jobSummaries,
            temperature: 0,
            maxTokens: 500,
        });

        const text = response.text.trim();
        if (!text) return jobs.map(j => ({ ...j, matched_filters: [] }));

        // Robust JSON parsing
        let parsed: { tags?: string[][] };
        try {
            parsed = JSON.parse(text);
        } catch {
            const jsonMatch = text.match(/\{[\s\S]*?\}/);
            parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { tags: [] };
        }
        const tags: string[][] = parsed.tags || [];

        return jobs.map((job, i) => ({
            ...job,
            matched_filters: tags[i] || [],
        }));
    } catch (err) {
        console.warn('[Search] Filter tagging failed, continuing without tags');
        return jobs.map(j => ({ ...j, matched_filters: [] }));
    }
}
