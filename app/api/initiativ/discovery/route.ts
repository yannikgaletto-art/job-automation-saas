export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
    buildDiscoverySignals,
    sanitizeDiscoveryQuery,
    shouldApplyStrictDiscoveryRegionFilter,
    type RawInitiativTrigger,
} from '@/lib/initiativ/discovery';

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

        let dbQuery = supabase
            .from('initiativ_triggers')
            .select('id, trigger_type, company_name, company_url, branche, region, source_url, source_name, trigger_date, trigger_summary')
            .order('trigger_date', { ascending: false })
            .limit(50);

        if (shouldApplyStrictDiscoveryRegionFilter(query.region)) {
            dbQuery = dbQuery.ilike('region', `%${query.region}%`);
        }

        const { data, error } = await dbQuery;

        if (error) {
            if (error.code === '42P01' || error.message.toLocaleLowerCase('en-US').includes('does not exist')) {
                return NextResponse.json({
                    success: true,
                    schemaReady: false,
                    query,
                    signals: [],
                });
            }

            console.error('[initiativ/discovery] load failed:', error.message);
            return NextResponse.json({ error: 'initiativ.discovery.load_failed' }, { status: 500 });
        }

        const signals = buildDiscoverySignals((data ?? []) as RawInitiativTrigger[], query)
            .filter((signal) => !query.branche || signal.matchReasons.includes('branche'))
            .slice(0, 10);

        return NextResponse.json({
            success: true,
            schemaReady: true,
            query,
            signals,
        });
    } catch (error) {
        console.error('[initiativ/discovery] fatal:', error);
        return NextResponse.json({ error: 'initiativ.discovery.load_failed' }, { status: 500 });
    }
}
