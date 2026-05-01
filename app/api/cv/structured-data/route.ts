import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { CvStructuredData } from '@/types/cv';

export async function GET() {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { data: profile, error } = await supabase
            .from('user_profiles')
            .select('cv_structured_data')
            .eq('id', user.id)
            .maybeSingle();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const raw = profile?.cv_structured_data;
        if (!raw) {
            return NextResponse.json({ error: 'NO_CV', message: 'No CV structured data found' }, { status: 404 });
        }

        const cvData: CvStructuredData = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return NextResponse.json({ success: true, data: cvData });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
