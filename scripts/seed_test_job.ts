import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

async function run() {
    const { data: users, error: userError } = await supabase.auth.admin.listUsers();
    if (userError || !users.users.length) {
        console.error("Error getting users:", userError);
        return;
    }
    const userId = users.users[0].id;
    const { data, error } = await supabase
        .from('job_queue')
        .insert({
            user_id: userId,
            company_name: 'Test Delete Company',
            job_title: 'Software Test Engineer',
            job_url: 'https://example.com/job',
            status: 'pending'
        });
    if (error) console.error("Error inserting:", error);
    else console.log("Inserted test job successfully.");
}
run();
