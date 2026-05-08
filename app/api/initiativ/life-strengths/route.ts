export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { buildLifeStrengthsPayload } from '@/lib/initiativ/life-strengths';

function isMissingColumnError(error: { code?: string; message?: string } | null | undefined) {
    return error?.code === '42703' || error?.message?.includes('life_strengths');
}

export async function GET() {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { data, error } = await supabase
            .from('user_profiles')
            .select('life_strengths')
            .eq('id', user.id)
            .maybeSingle();

        if (isMissingColumnError(error)) {
            return NextResponse.json({
                success: true,
                schemaReady: false,
                life_strengths: null,
            });
        }

        if (error) {
            console.error('[initiativ/life-strengths] GET failed:', error.message);
            return NextResponse.json({ error: 'initiativ.life_strengths.load_failed' }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            schemaReady: true,
            life_strengths: data?.life_strengths ?? null,
        });
    } catch (error: unknown) {
        console.error('[initiativ/life-strengths] GET fatal:', error);
        return NextResponse.json({ error: 'initiativ.life_strengths.load_failed' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const result = buildLifeStrengthsPayload(body);

        if (result.error || !result.payload) {
            return NextResponse.json({ error: result.error }, { status: 400 });
        }

        const { error: updateError } = await supabase
            .from('user_profiles')
            .update({ life_strengths: result.payload })
            .eq('id', user.id);

        if (isMissingColumnError(updateError)) {
            return NextResponse.json(
                { error: 'initiativ.life_strengths.schema_missing', success: false },
                { status: 503 }
            );
        }

        if (updateError) {
            console.error('[initiativ/life-strengths] update failed:', updateError.message);
            return NextResponse.json({ error: 'initiativ.life_strengths.save_failed', success: false }, { status: 500 });
        }

        const { data: verify, error: verifyError } = await supabase
            .from('user_profiles')
            .select('life_strengths')
            .eq('id', user.id)
            .single();

        if (
            verifyError ||
            !verify?.life_strengths ||
            verify.life_strengths.updated_at !== result.payload.updated_at
        ) {
            console.error('[initiativ/life-strengths] read-back failed:', verifyError?.message ?? 'missing payload');
            return NextResponse.json(
                { error: 'initiativ.life_strengths.verify_failed', success: false },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            life_strengths: verify.life_strengths,
        });
    } catch (error: unknown) {
        console.error('[initiativ/life-strengths] POST fatal:', error);
        return NextResponse.json({ error: 'initiativ.life_strengths.save_failed', success: false }, { status: 500 });
    }
}
