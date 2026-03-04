import { NextResponse, NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

// ─── Query Schema ─────────────────────────────────────────────────
const querySchema = z.object({
    q: z.string().max(200).optional(),
    city: z.string().optional(),
    category: z.enum(['social', 'environment', 'education', 'health', 'culture']).optional(),
    source: z.string().optional(),
    limit: z.coerce.number().min(1).max(100).default(50),
    offset: z.coerce.number().min(0).default(0),
});

// ─── GET /api/volunteering/opportunities ──────────────────────────
export async function GET(request: NextRequest) {
    try {
        // Auth Guard (§8)
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Parse query params
        const params = Object.fromEntries(request.nextUrl.searchParams);
        const parsed = querySchema.safeParse(params);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Invalid query parameters', details: parsed.error.flatten() }, { status: 400 });
        }

        const { q, city, category, source, limit, offset } = parsed.data;

        // Build query
        let query = supabase
            .from('volunteering_opportunities')
            .select('*', { count: 'exact' })
            .eq('is_active', true)
            .order('scraped_at', { ascending: false })
            .range(offset, offset + limit - 1);

        // Free text search across title, organization, description
        if (q && q.trim().length >= 2) {
            const term = `%${q.trim()}%`;
            query = query.or(`title.ilike.${term},organization.ilike.${term},description.ilike.${term}`);
        }

        if (city) query = query.ilike('city', `%${city}%`);
        if (category) query = query.eq('category', category);
        if (source) query = query.eq('source', source);

        const { data, count, error } = await query;

        if (error) {
            console.error('❌ [volunteering/opportunities] DB error:', error.message);
            return NextResponse.json({ error: 'Fehler beim Laden der Opportunities' }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            data: data ?? [],
            total: count ?? 0,
        });
    } catch (err) {
        console.error('❌ [volunteering/opportunities] Fatal:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
