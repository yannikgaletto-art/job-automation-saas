export const dynamic = 'force-dynamic';

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/settings/profile
 * Returns profile fields including full_name from user_profiles.
 * Auth-guarded per SICHERHEITSARCHITEKTUR §8.
 */
export async function GET() {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Fetch user_settings (linkedin, target_role, avatar_animal)
        const { data: settings } = await supabase
            .from('user_settings')
            .select('linkedin_url, target_role, avatar_animal')
            .eq('user_id', user.id)
            .maybeSingle();

        // Fetch full_name from user_profiles
        const { data: profile } = await supabase
            .from('user_profiles')
            .select('full_name')
            .eq('id', user.id)
            .maybeSingle();

        // Fallback: user_metadata from auth (e.g. Google OAuth)
        const full_name = profile?.full_name
            || user.user_metadata?.full_name
            || user.user_metadata?.name
            || null;

        return NextResponse.json({
            success: true,
            full_name,
            avatar_animal: settings?.avatar_animal ?? null,
            profile: {
                linkedin_url: settings?.linkedin_url ?? '',
                target_role: settings?.target_role ?? '',
            },
        });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

/**
 * POST /api/settings/profile
 * Updates linkedin_url and target_role in user_settings.
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

/**
 * PATCH /api/settings/profile
 * Lightweight update — used e.g. to save avatar_animal from the sidebar.
 */
export async function PATCH(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();

        const allowed = ['avatar_animal', 'linkedin_url', 'target_role'] as const;
        const updatePayload: Record<string, unknown> = {};

        for (const key of allowed) {
            if (key in body) {
                updatePayload[key] = body[key] ?? null;
            }
        }

        if (Object.keys(updatePayload).length === 0) {
            return NextResponse.json({ error: 'Keine gültigen Felder' }, { status: 400 });
        }

        const { error } = await supabase
            .from('user_settings')
            .update(updatePayload)
            .eq('user_id', user.id);

        if (error) {
            console.error('[settings/profile] PATCH error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
