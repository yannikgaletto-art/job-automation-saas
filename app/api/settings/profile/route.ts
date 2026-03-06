export const dynamic = 'force-dynamic';

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/settings/profile
 * Returns the user's profile fields (linkedin_url, target_role).
 * Auth-guarded per SICHERHEITSARCHITEKTUR §8.
 */
export async function GET() {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { data, error } = await supabase
            .from('user_settings')
            .select('linkedin_url, target_role')
            .eq('user_id', user.id)
            .maybeSingle();

        if (error) {
            console.error('[settings/profile] GET error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            profile: {
                linkedin_url: data?.linkedin_url ?? '',
                target_role: data?.target_role ?? '',
            },
        });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

/**
 * POST /api/settings/profile
 * Updates the user's profile fields.
 * Uses upsert + read-back (Double-Assurance per SICHERHEITSARCHITEKTUR §1).
 */
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const linkedin_url = typeof body.linkedin_url === 'string' ? body.linkedin_url.trim() : undefined;
        const target_role = typeof body.target_role === 'string' ? body.target_role.trim() : undefined;

        // Basic LinkedIn URL validation (if provided)
        if (linkedin_url && linkedin_url.length > 0) {
            if (!linkedin_url.includes('linkedin.com/')) {
                return NextResponse.json({ error: 'Ungültige LinkedIn URL' }, { status: 400 });
            }
        }

        const updatePayload: Record<string, unknown> = {};
        if (linkedin_url !== undefined) updatePayload.linkedin_url = linkedin_url || null;
        if (target_role !== undefined) updatePayload.target_role = target_role || null;

        if (Object.keys(updatePayload).length === 0) {
            return NextResponse.json({ error: 'Keine Felder zum Aktualisieren' }, { status: 400 });
        }

        const { error: upsertError } = await supabase
            .from('user_settings')
            .update(updatePayload)
            .eq('user_id', user.id);

        if (upsertError) {
            console.error('[settings/profile] upsert error:', upsertError);
            return NextResponse.json({ error: upsertError.message }, { status: 500 });
        }

        // Read-back verification (Double-Assurance)
        const { data: verify } = await supabase
            .from('user_settings')
            .select('linkedin_url, target_role')
            .eq('user_id', user.id)
            .single();

        if (!verify) {
            console.error('[settings/profile] Read-back failed');
            return NextResponse.json({ error: 'Verifikation fehlgeschlagen', success: false }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            profile: {
                linkedin_url: verify.linkedin_url ?? '',
                target_role: verify.target_role ?? '',
            },
        });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
