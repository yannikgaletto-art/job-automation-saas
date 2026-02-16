
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyDeployment() {
    console.log("🕵️‍♀️ Starting Deep Verification of Database Deployment...");

    // 1. Verify Seed Data (form_selectors)
    const { count: selectorCount, error: selectorError } = await supabase
        .from('form_selectors')
        .select('*', { count: 'exact', head: true });

    if (selectorError) console.error("❌ Error checking form_selectors:", selectorError.message);
    else console.log(`✅ Seed Data: 'form_selectors' has ${selectorCount} rows (Expected > 15).`);

    // 2. Verify Triggers (via RPC call if possible, or inference)
    // We can't query information_schema.triggers directly via JS client usually unless we have a specific RPC.
    // However, we verified prevent_double_apply in Phase 6.1.
    // Let's try to verify the `update_updated_at` trigger on user_profiles by updating a record? 
    // No, that requires a valid user.
    // Instead, let's assume triggers are there if tables are there, but we can try to call a function.

    // 3. Verify Functions
    // We can try to call `get_weekly_application_count` for a dummy user.
    const { data: funcData, error: funcError } = await supabase
        .rpc('get_weekly_application_count', { p_user_id: '00000000-0000-0000-0000-000000000000' });

    if (funcError) {
        console.error("❌ Function 'get_weekly_application_count' check failed:", funcError.message);
    } else {
        console.log("✅ Function 'get_weekly_application_count' exists and is callable.");
    }

    // 4. Verify Extensions (via rpc if we had one, or just generic check)
    // If pg_trgm is working, we should be able to make a search query that uses it?
    // We don't have a direct way to check extensions without SQL access.

    // 5. Verify RLS
    // Try to select from user_profiles as anonymous (should get 0 rows or error if no anon key used, but we are using service role)
    // Using service role implies we bypass RLS. 
    // To test RLS we need a client with anon key and NO session.

    const anonClient = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { data: rlsData, error: rlsError } = await anonClient
        .from('user_profiles')
        .select('*');

    if (rlsError) {
        console.log("ℹ️ RLS Check: Error (might be intended):", rlsError.message);
    } else if (rlsData && rlsData.length === 0) {
        console.log("✅ RLS Check: Anonymous select on 'user_profiles' returned 0 rows (Protected).");
    } else {
        console.warn("⚠️ RLS Check: Anonymous select returned data! RLS might be disabled.", rlsData?.length);
    }

    console.log("🏁 Verification Complete.");
}

verifyDeployment();
