import { NextResponse, NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

// ─── Schemas ──────────────────────────────────────────────────────
const createBookmarkSchema = z.object({
    opportunity_id: z.string().uuid(),
});

const updateBookmarkSchema = z.object({
    id: z.string().uuid(),
    status: z.enum(['saved', 'contacted', 'active', 'completed']).optional(),
    hours_logged: z.number().min(0).max(9999).optional(),
    notes: z.string().max(2000).optional(),
});

// ─── GET /api/volunteering/bookmarks ──────────────────────────────
export async function GET() {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // user_id-scoped query (§3)
        const { data, error } = await supabase
            .from('volunteering_bookmarks')
            .select('*, opportunity:volunteering_opportunities(*)')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('❌ [volunteering/bookmarks] GET error:', error.message);
            return NextResponse.json({ error: 'Fehler beim Laden' }, { status: 500 });
        }

        return NextResponse.json({ success: true, data: data ?? [] });
    } catch (err) {
        console.error('❌ [volunteering/bookmarks] Fatal:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// ─── POST /api/volunteering/bookmarks ─────────────────────────────
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const parsed = createBookmarkSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
        }

        // Check for duplicate bookmark
        const { data: existing } = await supabase
            .from('volunteering_bookmarks')
            .select('id')
            .eq('user_id', user.id)
            .eq('opportunity_id', parsed.data.opportunity_id)
            .maybeSingle();

        if (existing) {
            return NextResponse.json({ error: 'Bereits gespeichert', code: 'ALREADY_BOOKMARKED' }, { status: 409 });
        }

        // Insert
        const { data: inserted, error: insertError } = await supabase
            .from('volunteering_bookmarks')
            .insert({
                user_id: user.id,
                opportunity_id: parsed.data.opportunity_id,
                status: 'saved',
            })
            .select()
            .single();

        if (insertError) {
            console.error('❌ [volunteering/bookmarks] INSERT error:', insertError.message);
            return NextResponse.json({ error: 'Speichern fehlgeschlagen' }, { status: 500 });
        }

        // Double-Assurance: Read-Back (§1)
        const { data: verify } = await supabase
            .from('volunteering_bookmarks')
            .select('id')
            .eq('id', inserted.id)
            .single();

        if (!verify) {
            console.error('❌ [volunteering/bookmarks] Read-back failed');
            return NextResponse.json({ error: 'Verification failed', success: false }, { status: 500 });
        }

        return NextResponse.json({ success: true, data: inserted });
    } catch (err) {
        console.error('❌ [volunteering/bookmarks] Fatal:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// ─── PATCH /api/volunteering/bookmarks ────────────────────────────
export async function PATCH(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const parsed = updateBookmarkSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
        }

        const { id, ...updates } = parsed.data;

        const { data: updated, error: updateError } = await supabase
            .from('volunteering_bookmarks')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('id', id)
            .eq('user_id', user.id) // user_id-scoped (§3)
            .select()
            .single();

        if (updateError) {
            console.error('❌ [volunteering/bookmarks] UPDATE error:', updateError.message);
            return NextResponse.json({ error: 'Update fehlgeschlagen' }, { status: 500 });
        }

        return NextResponse.json({ success: true, data: updated });
    } catch (err) {
        console.error('❌ [volunteering/bookmarks] Fatal:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// ─── DELETE /api/volunteering/bookmarks ───────────────────────────
export async function DELETE(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = request.nextUrl;
        const id = searchParams.get('id');
        if (!id) {
            return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 });
        }

        const { error: deleteError } = await supabase
            .from('volunteering_bookmarks')
            .delete()
            .eq('id', id)
            .eq('user_id', user.id); // user_id-scoped (§3)

        if (deleteError) {
            console.error('❌ [volunteering/bookmarks] DELETE error:', deleteError.message);
            return NextResponse.json({ error: 'Löschen fehlgeschlagen' }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('❌ [volunteering/bookmarks] Fatal:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
