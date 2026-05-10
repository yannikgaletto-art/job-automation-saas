import { inngest } from '@/lib/inngest/client';
import { createClient } from '@supabase/supabase-js';
import {
    aggregateInitiativTriggers,
    persistTriggersToDB,
    INITIATIV_RSS_SOURCES,
} from '@/lib/services/initiativ-rss-aggregator';

/**
 * Initiativ RSS Aggregator — Daily Cron.
 *
 * Läuft täglich um 07:00 Europe/Berlin. 06:00 ist zu früh (deutsche-startups
 * publiziert oft erst zwischen 06:30-07:30; 06:00-Cron würde gestrige Posts
 * doppelt grabben).
 *
 * Zwei Steps: aggregate (3 RSS-Feeds parallel) + persist (Upsert mit
 * ON CONFLICT-Schutz). Inngest retry: 2 mal bei Failure.
 */

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export const initiativRssAggregator = inngest.createFunction(
    {
        id: 'initiativ-rss-aggregator',
        name: 'Initiativ RSS Aggregator (daily)',
        retries: 2,
        triggers: [{ cron: 'TZ=Europe/Berlin 0 7 * * *' }],
    },
    async ({ step }: { step: any }) => {
        const triggers = await step.run('aggregate', async () => {
            const start = Date.now();
            const result = await aggregateInitiativTriggers();
            console.log(
                `[initiativ-rss-cron] aggregated ${result.length} triggers from ${INITIATIV_RSS_SOURCES.length} sources in ${Date.now() - start}ms`,
            );
            return result;
        });

        const persistResult = await step.run('persist', async () => {
            return persistTriggersToDB(triggers, supabaseAdmin);
        });

        console.log(
            `[initiativ-rss-cron] done: ${persistResult.persisted}/${persistResult.attempted} persisted, ${persistResult.errors} errors`,
        );

        return {
            sources: INITIATIV_RSS_SOURCES.length,
            fetched: triggers.length,
            ...persistResult,
        };
    },
);
