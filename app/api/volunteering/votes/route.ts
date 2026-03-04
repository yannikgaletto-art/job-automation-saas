import { NextResponse, NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

// ─── Schemas ──────────────────────────────────────────────────────
const voteSchema = z.object({
    category_suggestion: z.string().min(2).max(100).trim(),
});

// ─── GET /api/volunteering/votes ──────────────────────────────────
export async function GET() {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Aggregate votes — Top 10
        const { data: allVotes, error } = await supabase
            .from('volunteering_votes')
            .select('category_suggestion, user_id');

        if (error) {
            console.error('❌ [volunteering/votes] GET error:', error.message);
            return NextResponse.json({ error: 'Fehler beim Laden' }, { status: 500 });
        }

        // Aggregate manually (Supabase doesn't support GROUP BY in JS client)
        const voteMap = new Map<string, { count: number; userVoted: boolean }>();
        for (const v of (allVotes ?? [])) {
            const key = v.category_suggestion.toLowerCase();
            const existing = voteMap.get(key) ?? { count: 0, userVoted: false };
            existing.count++;
            if (v.user_id === user.id) existing.userVoted = true;
            voteMap.set(key, existing);
        }

        const aggregated = Array.from(voteMap.entries())
            .map(([suggestion, { count, userVoted }]) => ({
                category_suggestion: suggestion,
                vote_count: count,
                user_voted: userVoted,
            }))
            .sort((a, b) => b.vote_count - a.vote_count)
            .slice(0, 10);

        return NextResponse.json({ success: true, data: aggregated });
    } catch (err) {
        console.error('❌ [volunteering/votes] Fatal:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// ─── POST /api/volunteering/votes ─────────────────────────────────
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const parsed = voteSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
        }

        const suggestion = parsed.data.category_suggestion.toLowerCase().trim();

        // Upsert (UNIQUE constraint handles dedup)
        const { error: insertError } = await supabase
            .from('volunteering_votes')
            .insert({
                user_id: user.id,
                category_suggestion: suggestion,
            });

        if (insertError) {
            if (insertError.code === '23505') {
                // Unique violation — user already voted for this
                return NextResponse.json({ error: 'Du hast bereits für diesen Bereich gestimmt', code: 'ALREADY_VOTED' }, { status: 409 });
            }
            console.error('❌ [volunteering/votes] INSERT error:', insertError.message);
            return NextResponse.json({ error: 'Abstimmung fehlgeschlagen' }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('❌ [volunteering/votes] Fatal:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
