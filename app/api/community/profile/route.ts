import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const profileSchema = z.object({
    display_name: z.string().min(1).max(100).optional(),
    skills: z.array(z.string().max(50)).max(20).optional(),
    learning_goals: z.array(z.string().max(100)).max(10).optional(),
    looking_for: z.string().max(200).optional(),
    current_company: z.string().max(100).optional(),
    linkedin_url: z.string().max(200).optional(),
});

// GET /api/community/profile
export async function GET() {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { data: profile, error: dbError } = await supabase
            .from('community_profiles')
            .select('*')
            .eq('user_id', user.id)
            .maybeSingle();

        if (dbError) {
            console.error('[community/profile] GET db error:', dbError.message);
            return NextResponse.json({ error: 'Profil konnte nicht geladen werden' }, { status: 500 });
        }

        return NextResponse.json({ success: true, data: profile ?? null });
    } catch (err) {
        console.error('[community/profile] GET unhandled:', err);
        return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 });
    }
}

// POST /api/community/profile — Upsert with double-assurance
export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const parsed = profileSchema.safeParse(body);

        if (!parsed.success) {
            return NextResponse.json({ error: 'Ungueltige Eingabedaten' }, { status: 400 });
        }

        let { display_name, skills, learning_goals, looking_for, current_company, linkedin_url } = parsed.data;

        // Fallback for display_name
        if (!display_name || !display_name.trim()) {
            const { data: userProfile } = await supabase
                .from('user_profiles')
                .select('full_name')
                .eq('id', user.id)
                .maybeSingle();

            if (userProfile?.full_name) {
                display_name = userProfile.full_name;
            } else if (user.email) {
                display_name = user.email.split('@')[0];
            } else {
                return NextResponse.json({ error: 'display_name ist erforderlich' }, { status: 400 });
            }
        }

        const { error: upsertError } = await supabase
            .from('community_profiles')
            .upsert(
                {
                    user_id: user.id,
                    display_name: display_name!.trim(),
                    skills: skills ?? [],
                    learning_goals: learning_goals ?? [],
                    looking_for: looking_for?.trim() ?? '',
                    current_company: current_company?.trim() ?? '',
                    linkedin_url: linkedin_url?.trim() ?? '',
                },
                { onConflict: 'user_id' }
            );

        if (upsertError) {
            console.error('[community/profile] POST upsert error:', upsertError.message);
            return NextResponse.json({ error: 'Profil konnte nicht gespeichert werden' }, { status: 500 });
        }

        // Double-assurance: read-back
        const { data: verified, error: readBackError } = await supabase
            .from('community_profiles')
            .select('*')
            .eq('user_id', user.id)
            .single();

        if (readBackError || !verified) {
            console.error('[community/profile] POST read-back failed:', readBackError?.message);
            return NextResponse.json({ error: 'Profil-Verifizierung fehlgeschlagen' }, { status: 500 });
        }

        return NextResponse.json({ success: true, data: verified });
    } catch (err) {
        console.error('[community/profile] POST unhandled:', err);
        return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 });
    }
}
