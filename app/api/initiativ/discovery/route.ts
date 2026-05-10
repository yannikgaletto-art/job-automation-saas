export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
    filterDiscoverySignalsForQuery,
    sanitizeDiscoveryQuery,
    shouldApplyStrictDiscoveryRegionFilter,
    shouldRetryDiscoveryWithoutRegion,
    type RawInitiativTrigger,
} from '@/lib/initiativ/discovery';
import { findRegulatoryTriggersForCompany } from '@/lib/services/regulatory-triggers';

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

async function loadTriggerRows(supabase: SupabaseClient, region: string) {
    let dbQuery = supabase
        .from('initiativ_triggers')
        .select('id, trigger_type, company_name, company_url, branche, region, source_url, source_name, trigger_date, trigger_summary')
        .order('trigger_date', { ascending: false })
        .limit(50);

    if (shouldApplyStrictDiscoveryRegionFilter(region)) {
        dbQuery = dbQuery.ilike('region', `%${region}%`);
    }

    return dbQuery;
}

export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const query = sanitizeDiscoveryQuery({
            branche: request.nextUrl.searchParams.get('branche'),
            region: request.nextUrl.searchParams.get('region'),
            focus: request.nextUrl.searchParams.get('focus'),
        });

        const { data, error } = await loadTriggerRows(supabase, query.region);

        // Tier-1 Regulatory: statisch, branche-getrieben, unabhängig vom DB-State.
        // Wird auch ausgeliefert wenn die Trigger-Tabelle noch leer ist.
        const regulatoryTriggers = findRegulatoryTriggersForCompany(query.branche);

        if (error) {
            if (error.code === '42P01' || error.message.toLocaleLowerCase('en-US').includes('does not exist')) {
                return NextResponse.json({
                    success: true,
                    schemaReady: false,
                    query,
                    signals: [],
                    regulatoryTriggers,
                });
            }

            console.error('[initiativ/discovery] load failed:', error.message);
            return NextResponse.json({ error: 'initiativ.discovery.load_failed' }, { status: 500 });
        }

        let signals = filterDiscoverySignalsForQuery((data ?? []) as RawInitiativTrigger[], query);
        let regionFallback = false;

        if (shouldRetryDiscoveryWithoutRegion(query, signals)) {
            const fallbackResult = await loadTriggerRows(supabase, '');

            if (fallbackResult.error) {
                console.error('[initiativ/discovery] fallback load failed:', fallbackResult.error.message);
                return NextResponse.json({ error: 'initiativ.discovery.load_failed' }, { status: 500 });
            }

            signals = filterDiscoverySignalsForQuery((fallbackResult.data ?? []) as RawInitiativTrigger[], query);
            regionFallback = signals.length > 0;
        }

        signals = signals.slice(0, 10);

        return NextResponse.json({
            success: true,
            schemaReady: true,
            query,
            regionFallback,
            signals,
            regulatoryTriggers,
        });
    } catch (error) {
        console.error('[initiativ/discovery] fatal:', error);
        return NextResponse.json({ error: 'initiativ.discovery.load_failed' }, { status: 500 });
    }
}
