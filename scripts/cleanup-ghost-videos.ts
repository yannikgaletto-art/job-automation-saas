/**
 * DB Cleanup: Reset ghost video entries where status='uploaded' but file doesn't exist in storage.
 * 
 * Run: npx tsx scripts/cleanup-ghost-videos.ts
 * 
 * What it does:
 * 1. Finds all video_approaches with status='uploaded'
 * 2. Checks if the file actually exists in storage
 * 3. Resets status to 'prompts_ready' for entries where the file is missing
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceKey) {
    console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

async function main() {
    console.log('🔍 Finding uploaded video entries...');
    
    const { data: videos, error } = await supabase
        .from('video_approaches')
        .select('id, user_id, job_id, storage_path, status, access_token')
        .eq('status', 'uploaded');

    if (error) {
        console.error('❌ Query failed:', error.message);
        process.exit(1);
    }

    if (!videos || videos.length === 0) {
        console.log('✅ No uploaded videos found. Nothing to clean.');
        return;
    }

    console.log(`Found ${videos.length} uploaded video(s). Checking storage...`);

    let cleaned = 0;
    for (const video of videos) {
        if (!video.storage_path) {
            console.log(`  ⚠ ${video.id}: No storage_path — resetting`);
            await resetEntry(video.id);
            cleaned++;
            continue;
        }

        // Check if file exists in storage
        const parts = video.storage_path.split('/');
        const folder = parts.slice(0, -1).join('/');
        const filename = parts[parts.length - 1];

        const { data: files } = await supabase.storage
            .from('videos')
            .list(folder, { search: filename });

        if (!files || files.length === 0) {
            console.log(`  ❌ ${video.id}: File NOT found at ${video.storage_path} — resetting`);
            await resetEntry(video.id);
            cleaned++;
        } else {
            console.log(`  ✅ ${video.id}: File exists (${files[0].name}, ${files[0].metadata?.size || '?'} bytes)`);
        }
    }

    console.log(`\n🧹 Done. Cleaned ${cleaned}/${videos.length} entries.`);
}

async function resetEntry(id: string) {
    const { error } = await supabase
        .from('video_approaches')
        .update({
            status: 'prompts_ready',
            storage_path: null,
            uploaded_at: null,
            updated_at: new Date().toISOString(),
        })
        .eq('id', id);

    if (error) {
        console.error(`    Failed to reset ${id}:`, error.message);
    }
}

main().catch(console.error);
