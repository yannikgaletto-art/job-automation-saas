export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { extractProfessionalResultsFromCv } from '@/lib/initiativ/cv-suggestions';
import type { CvStructuredData } from '@/types/cv';

export async function GET() {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { data, error } = await supabase
            .from('user_profiles')
            .select('cv_structured_data')
            .eq('id', user.id)
            .maybeSingle();

        if (error) {
            console.error('[initiativ/cv-suggestions] load failed:', error.message);
            return NextResponse.json({ error: 'initiativ.cv_suggestions.load_failed' }, { status: 500 });
        }

        const cv = data?.cv_structured_data as CvStructuredData | null | undefined;
        const suggestions = extractProfessionalResultsFromCv(cv);

        return NextResponse.json({
            success: true,
            hasCv: !!cv,
            suggestions,
        });
    } catch (error) {
        console.error('[initiativ/cv-suggestions] fatal:', error);
        return NextResponse.json({ error: 'initiativ.cv_suggestions.load_failed' }, { status: 500 });
    }
}
