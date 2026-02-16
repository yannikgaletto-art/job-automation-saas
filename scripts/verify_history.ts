
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars BEFORE importing services that use them
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function verifyBackend() {
    console.log("🚀 Starting Backend Verification for Phase 6.1...");

    // Dynamic import to ensure env vars are set
    const { trackApplication } = await import('../lib/services/application-history');

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    if (!supabaseUrl || !supabaseKey) {
        console.error("❌ Missing Supabase Env Vars!");
        process.exit(1);
    }


    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get a real user ID
    const { data: { users }, error: userError } = await supabase.auth.admin.listUsers();
    if (userError || !users || users.length === 0) {
        console.error("❌ Could not find any users to test with:", userError);
        process.exit(1);
    }
    const testUserId = users[0].id;
    console.log(`ℹ️ Testing with User ID: ${testUserId}`);

    const testJobUrl = "https://example.com/jobs/test-job-" + Date.now();

    // 1. Clean up previous test data
    await supabase.from('application_history').delete().eq('user_id', testUserId);

    // 2. Track Application
    console.log("\nTesting trackApplication()...");
    const result1 = await trackApplication({
        userId: testUserId,
        jobUrl: testJobUrl,
        companyName: "Acme Test Corp",
        jobTitle: "Senior Tester",
        applicationMethod: "manual"
    });

    if (result1.success) {
        console.log("✅ Track Application: Success");
    } else {
        console.error("❌ Track Application: Failed", result1.error);
        process.exit(1);
    }

    // 3. Verify Duplicate Check (should fail)
    console.log("\nTesting Duplicate Prevention...");
    const result2 = await trackApplication({
        userId: testUserId,
        jobUrl: testJobUrl, // Same URL
        companyName: "Acme Test Corp",
        jobTitle: "Senior Tester",
        applicationMethod: "manual"
    });

    if (!result2.success && result2.error === "Duplicate application") {
        console.log("✅ Duplicate Check: Caught duplicate successfully");
    } else {
        console.error("❌ Duplicate Check: Failed to catch duplicate", result2);
    }

    // 4. Verify Database Record
    console.log("\nVerifying DB Record...");
    const { data } = await supabase
        .from('application_history')
        .select('*')
        .eq('user_id', testUserId)
        .eq('url_hash', require('crypto').createHash('md5').update(testJobUrl).digest('hex'));

    if (data && data.length === 1) {
        console.log("✅ DB Record: Found 1 record as expected");
        console.log("   - Company:", data[0].company_name);
        console.log("   - Method:", data[0].application_method);
    } else {
        console.error("❌ DB Record: verification failed", data);
    }

    console.log("\n🎉 Phase 6.1 Backend Verification Complete!");
}

verifyBackend().catch(console.error);
