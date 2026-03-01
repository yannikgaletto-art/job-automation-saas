import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const { data, error } = await supabase
        .from('company_research')
        .select('company_name, job_id, researched_at, expires_at')
        .ilike('company_name', '%MobiLab%');

    console.log('Research data (MobiLab):', JSON.stringify(data, null, 2));

    const { data: data2 } = await supabase
        .from('company_research')
        .select('company_name, job_id, researched_at, expires_at')
        .ilike('company_name', '%bracketlab%');

    console.log('Research data (bracketlab):', JSON.stringify(data2, null, 2));
}

check();
