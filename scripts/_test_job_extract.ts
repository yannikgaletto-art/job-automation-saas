/**
 * Bypass-auth direct test of /api/jobs/extract logic for the Instaffo job.
 * Reproduces the DEV-path code in extract/route.ts to verify the backend works.
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const JOB_ID = '4bd8fad9-7a90-4155-8c7f-b46f43dff5fa';
const USER_ID = 'f1cea2b5-0a60-46b9-afc3-59fcb4a1d34c';

(async () => {
    const { data: job, error: readErr } = await supabase
        .from('job_queue')
        .select('id, description, metadata')
        .eq('id', JOB_ID)
        .eq('user_id', USER_ID)
        .single();

    if (readErr) {
        console.error('READ ERROR:', readErr);
        process.exit(1);
    }
    console.log(`✅ Job loaded. Description length: ${job!.description!.length}`);

    if (!process.env.ANTHROPIC_API_KEY) {
        console.error('❌ No ANTHROPIC_API_KEY in .env.local');
        process.exit(1);
    }
    console.log(`✅ ANTHROPIC_API_KEY present (${process.env.ANTHROPIC_API_KEY.slice(0, 10)}…)`);

    console.log('\n🔧 Calling Claude Haiku via model-router…');
    const t0 = Date.now();
    const { complete } = await import('../lib/ai/model-router');
    const response = await complete({
        taskType: 'extract_job_fields',
        systemPrompt: `Extrahiere aus der Stellenbeschreibung diese JSON-Struktur. NUR JSON zurückgeben, kein Markdown.

{"summary":"2-3 Sätze auf Deutsch","responsibilities":["max 8"],"qualifications":["max 8"],"benefits":["max 5"],"location":"string oder null","seniority":"junior|mid|senior|lead|unknown","buzzwords":["max 18 ATS Keywords"]}`,
        prompt: job!.description!,
        temperature: 0,
        maxTokens: 2000,
    });
    const t1 = Date.now();
    console.log(`✅ AI response in ${t1 - t0}ms (model=${response.model}, tokens=${response.tokens}, cost=${response.costCents}¢)`);

    let extracted: any;
    try {
        const cleaned = response.text.trim().replace(/^```(?:json)?\s*/, '').replace(/```$/, '');
        const m = cleaned.match(/\{[\s\S]*\}/);
        extracted = JSON.parse(m ? m[0] : cleaned);
    } catch (e: any) {
        console.error('❌ JSON parse failed:', e.message);
        console.error('Raw response:', response.text.slice(0, 500));
        process.exit(1);
    }

    console.log('\n📋 EXTRACTED:');
    console.log(`  summary: ${(extracted.summary || '').slice(0, 100)}…`);
    console.log(`  responsibilities: ${Array.isArray(extracted.responsibilities) ? extracted.responsibilities.length : 'N/A'} items`);
    console.log(`  qualifications: ${Array.isArray(extracted.qualifications) ? extracted.qualifications.length : 'N/A'} items`);
    console.log(`  benefits: ${Array.isArray(extracted.benefits) ? extracted.benefits.length : 'N/A'} items`);
    console.log(`  location: ${extracted.location}`);
    console.log(`  seniority: ${extracted.seniority}`);
    console.log(`  buzzwords: ${Array.isArray(extracted.buzzwords) ? extracted.buzzwords.length : 'N/A'} items`);
    if (Array.isArray(extracted.buzzwords)) console.log(`    ${extracted.buzzwords.join(', ')}`);

    console.log('\n💾 Writing to DB…');
    const { error: writeErr } = await supabase.from('job_queue').update({
        summary: extracted.summary || null,
        responsibilities: Array.isArray(extracted.responsibilities) && extracted.responsibilities.length > 0 ? extracted.responsibilities : null,
        requirements: Array.isArray(extracted.qualifications) && extracted.qualifications.length > 0 ? extracted.qualifications : null,
        benefits: Array.isArray(extracted.benefits) ? extracted.benefits : [],
        location: extracted.location || null,
        seniority: extracted.seniority || 'unknown',
        buzzwords: Array.isArray(extracted.buzzwords) ? extracted.buzzwords : null,
        metadata: { ...(job!.metadata as object || {}), extract_completed_at: new Date().toISOString() },
    }).eq('id', JOB_ID).eq('user_id', USER_ID);

    if (writeErr) {
        console.error('❌ DB write failed:', writeErr);
        process.exit(1);
    }
    console.log('✅ DB write successful');
    console.log('\n🎉 Backend extract-pipeline WORKS for this job.');
})();
