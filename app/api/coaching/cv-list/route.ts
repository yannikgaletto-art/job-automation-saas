import { NextResponse } from 'next/server';
import { listUserCVs } from '@/lib/services/cv-text-retriever';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const cvs = await listUserCVs(user.id);
    return NextResponse.json({ cvs });
}
