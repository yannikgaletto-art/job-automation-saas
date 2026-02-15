import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!; // Use service role for backend tests

test('Supabase connection (SELECT count from job_queue)', async () => {
    // Basic connectivity check
    const supabase = createClient(supabaseUrl, supabaseKey);
    // Use job_queue as it's a core table we know exists
    // Simple select to check connectivity + RLS
    const { data, error } = await supabase.from('job_queue').select('id').limit(1);

    // count not needed for connectivity check
    const count = data ? data.length : null;

    if (error) {
        console.error('Supabase Error:', error);
    }

    expect(error).toBeNull();
    // count should be a number (0 or more)
    // count can be null if the query fails or returns no rows in a weird way
    // But error should be null.
    // If count is null, it's not a number.
    if (count === null) {
        console.warn('Count is null, but error is null. Table might be unreachable or RLS issue.');
    }
    expect(count).not.toBeNull();
    expect(typeof count).toBe('number');
});
