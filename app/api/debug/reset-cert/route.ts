import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
    try {
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const { error } = await supabase
            .from('job_certificates')
            .delete()
            .eq('job_id', 'a8c375a2-313f-4ae3-80c4-82ed13d78542');

        return NextResponse.json({
            success: !error,
            message: error ? error.message : 'Record deleted — reload page'
        });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
