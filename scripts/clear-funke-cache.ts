import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
    // Set expires_at to the past so the next call treats it as a cache miss
    const { data, error } = await supabase
        .from('company_research')
        .update({ expires_at: new Date('2020-01-01').toISOString() })
        .ilike('company_name', '%FUNKE%')
        .select('company_name');
    
    if (error) console.error("Error:", error);
    else console.log("Cache expired for:", data?.map(d => d.company_name));
}

main().catch(console.error);
