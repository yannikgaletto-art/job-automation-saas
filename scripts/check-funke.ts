import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
    console.log("Searching for FUNKE...");
    const { data: research } = await supabase
        .from('company_research')
        .select('company_name, suggested_quotes')
        .ilike('company_name', '%FUNKE%')
        .order('researched_at', { ascending: false })
        .limit(1);

    console.log("Research Data:", JSON.stringify(research, null, 2));

    // Let's also run suggestRelevantQuotes manually to see where it breaks
    if (research && research.length > 0 && research[0].suggested_quotes.length === 0) {
        console.log("Quotes are empty! Let's see the company values in DB...");
        const { data: fullData } = await supabase
            .from('company_research')
            .select('intel_data')
            .eq('company_name', research[0].company_name)
            .single();
        console.log("Intel Data:", JSON.stringify(fullData, null, 2));
    }
}

main().catch(console.error);
