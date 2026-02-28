import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(__dirname, '.env') });
dotenv.config({ path: resolve(__dirname, '.env.local') });

const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function run() {
    const { data: jobs, error } = await supabaseAdmin
        .from('job_queue')
        .select('id, metadata, company_name')
        .ilike('company_name', '%Wolters%')
        .limit(1);
    console.log(JSON.stringify(jobs, null, 2));
}
run();
