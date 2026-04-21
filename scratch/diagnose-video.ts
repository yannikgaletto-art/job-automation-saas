/**
 * Video Pipeline Diagnostic Script
 * Run: npx tsx scratch/diagnose-video.ts
 * 
 * Checks:
 * 1. Does the 'videos' bucket exist?
 * 2. Are there files in it?
 * 3. What are their sizes?
 * 4. Can we generate a valid signed playback URL?
 * 5. What does video_approaches say?
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(__dirname, '../.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
}

const supabase = createClient(url, key);

async function diagnose() {
    console.log('=== VIDEO PIPELINE DIAGNOSTIC ===\n');

    // 1. Check bucket
    console.log('--- 1. BUCKET CHECK ---');
    const { data: buckets, error: bucketErr } = await supabase.storage.listBuckets();
    if (bucketErr) {
        console.log('ERROR listing buckets:', bucketErr.message);
    } else {
        const videosBucket = buckets?.find(b => b.name === 'videos');
        if (videosBucket) {
            console.log('Bucket "videos" EXISTS:', {
                id: videosBucket.id,
                public: videosBucket.public,
                fileSizeLimit: videosBucket.file_size_limit,
                allowedMimeTypes: videosBucket.allowed_mime_types,
            });
        } else {
            console.log('CRITICAL: Bucket "videos" DOES NOT EXIST!');
            console.log('Available buckets:', buckets?.map(b => b.name));
            console.log('\n>>> Fix: Create the bucket in Supabase Dashboard > Storage');
            return;
        }
    }

    // 2. List files in bucket
    console.log('\n--- 2. STORAGE FILES ---');
    const { data: rootFolders, error: listErr } = await supabase.storage
        .from('videos')
        .list('', { limit: 20 });

    if (listErr) {
        console.log('ERROR listing files:', listErr.message);
    } else if (!rootFolders || rootFolders.length === 0) {
        console.log('CRITICAL: Bucket is EMPTY -- no files uploaded!');
    } else {
        console.log(`Found ${rootFolders.length} items at root level:`);
        for (const item of rootFolders) {
            if (item.id === null) {
                // It's a folder (user_id)
                console.log(`  [FOLDER] ${item.name}/`);
                // List files inside
                const { data: files } = await supabase.storage
                    .from('videos')
                    .list(item.name, { limit: 20 });
                if (files) {
                    for (const file of files) {
                        const sizeKB = file.metadata?.size ? Math.round(file.metadata.size / 1024) : '?';
                        const mime = file.metadata?.mimetype || '?';
                        console.log(`    [FILE] ${item.name}/${file.name} -- ${sizeKB} KB, MIME: ${mime}`);
                    }
                }
            } else {
                const sizeKB = item.metadata?.size ? Math.round(item.metadata.size / 1024) : '?';
                console.log(`  [FILE] ${item.name} -- ${sizeKB} KB`);
            }
        }
    }

    // 3. Check video_approaches
    console.log('\n--- 3. DATABASE RECORDS ---');
    const { data: records, error: dbErr } = await supabase
        .from('video_approaches')
        .select('id, user_id, job_id, status, storage_path, access_token, uploaded_at, expires_at, view_count')
        .order('updated_at', { ascending: false })
        .limit(5);

    if (dbErr) {
        console.log('ERROR querying video_approaches:', dbErr.message);
    } else if (!records || records.length === 0) {
        console.log('No video_approaches records found');
    } else {
        console.log(`Found ${records.length} records:`);
        for (const r of records) {
            console.log(`  ID: ${r.id}`);
            console.log(`    status: ${r.status}`);
            console.log(`    storage_path: ${r.storage_path}`);
            console.log(`    access_token: ${r.access_token}`);
            console.log(`    uploaded_at: ${r.uploaded_at}`);
            console.log(`    expires_at: ${r.expires_at}`);
            console.log(`    view_count: ${r.view_count}`);

            // 4. Try to generate signed URL for this file
            if (r.storage_path && r.status === 'uploaded') {
                console.log('    --- Signed URL Test ---');
                const { data: signedUrl, error: signErr } = await supabase.storage
                    .from('videos')
                    .createSignedUrl(r.storage_path, 60);
                if (signErr) {
                    console.log(`    SIGNED URL ERROR: ${signErr.message}`);
                } else if (signedUrl) {
                    console.log(`    Signed URL OK: ${signedUrl.signedUrl.substring(0, 80)}...`);

                    // Try to HEAD the file to check if it actually exists
                    try {
                        const headRes = await fetch(signedUrl.signedUrl, { method: 'HEAD' });
                        console.log(`    HEAD response: ${headRes.status} ${headRes.statusText}`);
                        console.log(`    Content-Length: ${headRes.headers.get('content-length')} bytes`);
                        console.log(`    Content-Type: ${headRes.headers.get('content-type')}`);
                    } catch (e) {
                        console.log(`    HEAD fetch failed: ${e}`);
                    }
                }
            }
            console.log('');
        }
    }

    console.log('=== DIAGNOSTIC COMPLETE ===');
}

diagnose().catch(console.error);
