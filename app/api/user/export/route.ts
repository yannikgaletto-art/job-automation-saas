import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            global: {
                headers: {
                    Authorization: request.headers.get('Authorization') || ''
                }
            }
        }
    );

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return new NextResponse('Unauthorized', { status: 401 });
    }

    const [profile, documents, applications, jobs] = await Promise.all([
        supabase.from('user_profiles').select('*').eq('id', user.id).single(),
        supabase.from('documents').select('*').eq('user_id', user.id),
        supabase.from('application_history').select('*').eq('user_id', user.id),
        supabase.from('job_queue').select('*').eq('user_id', user.id),
    ]);

    const exportData = {
        exported_at: new Date().toISOString(),
        format_version: '1.0',
        user: profile.data,
        documents: documents.data,
        applications: applications.data,
        jobs: jobs.data,
    };

    return new NextResponse(JSON.stringify(exportData, null, 2), {
        headers: {
            'Content-Type': 'application/json',
            'Content-Disposition': `attachment; filename="pathly-data-${user.id}.json"`
        }
    });
}
