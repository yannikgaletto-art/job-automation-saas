import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

async function run() {
    const { data: dbData } = await supabaseAdmin.from('job_queue').select('*').order('created_at', { ascending: false }).limit(1).single();
    console.log("DB Row:", JSON.stringify(dbData, null, 2));
}
run();
