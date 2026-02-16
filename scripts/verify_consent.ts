
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyConsent() {
    console.log("🚀 Verifying Consent Tracking...");

    // Get a real user ID
    const { data: { users }, error: userError } = await supabase.auth.admin.listUsers();
    if (userError || !users || users.length === 0) {
        console.error("❌ Could not find any users to test with:", userError);
        process.exit(1);
    }
    const testUserId = users[0].id;
    console.log(`ℹ️ Testing with User ID: ${testUserId}`);

    // 1. Simulate API call (we can't easily call Next.js API from script, so we test the logic directly or just check DB after manual test)
    // Actually, we can just insert via Supabase to check if Table constraints are okay, 
    // but the API logic (headers) is best tested via browser. 
    // This script will check if we CAN insert into consent_history.

    const consentData = [
        {
            user_id: testUserId,
            document_type: 'privacy_policy',
            document_version: 'v1.0',
            consent_given: true,
            ip_address: '127.0.0.1',
            user_agent: 'Test Script'
        },
        {
            user_id: testUserId,
            document_type: 'terms_of_service',
            document_version: 'v1.0',
            consent_given: true,
            ip_address: '127.0.0.1',
            user_agent: 'Test Script'
        }
    ];

    // Clean up first
    await supabase.from('consent_history').delete().eq('user_id', testUserId);

    const { error } = await supabase.from('consent_history').insert(consentData);

    if (error) {
        console.error("❌ Insert failed:", error.message);
    } else {
        console.log("✅ Successfully inserted test consent records.");
    }

    // Check if inserted
    const { data } = await supabase.from('consent_history').select('*').eq('user_id', testUserId);
    console.log(`ℹ️ Found ${data?.length} records for test user.`);

    if (data?.length === 2) {
        console.log("✅ Verification Successful.");
    } else {
        console.error("❌ Verification Failed: Record count mismatch.");
    }
}

verifyConsent();
