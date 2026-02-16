
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
    console.error("❌ Missing Supabase Env Vars!");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTables() {
    console.log("🔍 Checking existing tables...");

    // We can't directly query information_schema via supabase-js client (REST API)
    // BUT we can try to query the tables we expect to see if they exist.

    const tables = [
        "application_history",
        "auto_search_configs",
        "company_research",
        "consent_history",
        "documents",
        "form_selectors",
        "generation_logs",
        "job_queue",
        "search_trigger_queue",
        "user_profiles"
    ];

    for (const table of tables) {
        const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });

        if (error) {
            if (error.code === '42P01') { // undefined_table
                console.log(`❌ Table '${table}' DOES NOT exist.`);
            } else {
                console.log(`❌ Error checking '${table}': ${error.message} (${error.code})`);
            }
        } else {
            console.log(`✅ Table '${table}' exists.`);
        }
    }
}

checkTables();
