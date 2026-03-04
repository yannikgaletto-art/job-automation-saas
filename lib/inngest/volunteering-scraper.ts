import { inngest } from '@/lib/inngest/client';
import { createClient } from '@supabase/supabase-js';
import { SCRAPER_SOURCES } from '@/lib/services/volunteering-scraper-service';
import type { OpportunityInsert } from '@/types/volunteering';

// ============================================================================
// Volunteering Scraper — Inngest Cron Function
// ============================================================================
// Runs weekly (Monday 6:00 Berlin time). Scrapes 5 sources and upserts
// opportunities into the DB via service role client.
// ============================================================================

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const volunteeringScraper = inngest.createFunction(
    {
        id: 'volunteering-scraper',
        name: 'Weekly Volunteering Scraper',
        retries: 2,
    },
    { cron: 'TZ=Europe/Berlin 0 6 * * 1' }, // Monday 6:00 AM Berlin
    async ({ step }) => {
        // Step 1: Fetch all source pages
        const fetchResults = await step.run('fetch-sources', async () => {
            const results: { source: string; html: string | null }[] = [];

            for (const src of SCRAPER_SOURCES) {
                console.log(`🔍 [vol-scraper] Fetching ${src.name}...`);
                try {
                    const res = await fetch(src.url, {
                        headers: { 'User-Agent': 'Pathly/2.0 Volunteering-Aggregator' },
                        signal: AbortSignal.timeout(10_000),
                    });
                    if (res.ok) {
                        results.push({ source: src.name, html: await res.text() });
                    } else {
                        console.error(`⚠️ [vol-scraper] HTTP ${res.status} for ${src.name}`);
                        results.push({ source: src.name, html: null });
                    }
                } catch (err) {
                    console.error(`❌ [vol-scraper] Fetch failed for ${src.name}:`, err);
                    results.push({ source: src.name, html: null });
                }
                // 1s delay between sources
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            return results;
        });

        // Step 2: Parse all sources
        const allOpportunities = await step.run('parse-sources', async () => {
            const all: OpportunityInsert[] = [];
            for (const { source, html } of fetchResults) {
                if (!html) continue;
                const src = SCRAPER_SOURCES.find(s => s.name === source);
                if (!src) continue;
                try {
                    const parsed = src.parser(html);
                    all.push(...parsed);
                    console.log(`✅ [vol-scraper] ${source}: ${parsed.length} parsed`);
                } catch (err) {
                    console.error(`❌ [vol-scraper] Parse error for ${source}:`, err);
                }
            }
            return all;
        });

        // Step 3: Upsert into DB
        const upsertResult = await step.run('upsert-opportunities', async () => {
            if (allOpportunities.length === 0) {
                return { upserted: 0, errors: 0 };
            }

            let upserted = 0;
            let errors = 0;

            // Upsert in batches of 10
            const batchSize = 10;
            for (let i = 0; i < allOpportunities.length; i += batchSize) {
                const batch = allOpportunities.slice(i, i + batchSize).map(opp => ({
                    ...opp,
                    is_active: true,
                    scraped_at: new Date().toISOString(),
                }));

                const { error } = await supabaseAdmin
                    .from('volunteering_opportunities')
                    .upsert(batch, { onConflict: 'url', ignoreDuplicates: false });

                if (error) {
                    console.error(`❌ [vol-scraper] Upsert batch error:`, error.message);
                    errors += batch.length;
                } else {
                    upserted += batch.length;
                }
            }

            return { upserted, errors };
        });

        console.log(`✅ [vol-scraper] Done: ${upsertResult.upserted} upserted, ${upsertResult.errors} errors`);
        return {
            total_sources: SCRAPER_SOURCES.length,
            total_parsed: allOpportunities.length,
            ...upsertResult,
        };
    }
);
