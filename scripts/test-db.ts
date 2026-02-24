import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function run() {
    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { data, error } = await supabaseAdmin.from('user_profiles').select('id, cv_structured_data').limit(1);
    if (error) console.error(error);
    else console.log(data);

    // Also get a job
    const { data: jobData } = await supabaseAdmin.from('job_queue').select('id, company_name').limit(1);
    console.log("Job: ", jobData);
}

run();
