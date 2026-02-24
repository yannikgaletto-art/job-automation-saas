import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await supabase.from('job_queue').select('id, company_name, metadata, status').ilike('company_name', '%Roboyo%');
console.log(JSON.stringify(data?.[0]?.metadata, null, 2));
