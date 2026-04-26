/**
 * Direct test: pulls the latest CV's extracted_text from the documents table
 * and runs parseCvTextToJson against it. Surfaces any runtime error in the
 * Welle A / A.5 post-processors.
 *
 * Run: npx tsx scripts/debug-parse-cv.ts info@yannik-galetto.site
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const TARGET_EMAIL = process.argv[2] || 'info@yannik-galetto.site';

async function main() {
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: authUsers } = await supabase.auth.admin.listUsers();
    const user = authUsers.users.find((u) => u.email === TARGET_EMAIL);
    if (!user) {
        console.error(`No user for ${TARGET_EMAIL}`);
        process.exit(1);
    }

    const { data: docs } = await supabase
        .from('documents')
        .select('id, metadata, created_at')
        .eq('user_id', user.id)
        .eq('document_type', 'cv')
        .order('created_at', { ascending: false })
        .limit(1);

    if (!docs || !docs.length) {
        console.error('No CV docs');
        process.exit(1);
    }

    const meta = docs[0].metadata as any;
    const rawText: string = meta?.extracted_text ?? '';
    console.log(`📄 Latest CV doc created: ${docs[0].created_at}`);
    console.log(`📄 rawText length: ${rawText.length} chars`);
    if (rawText.length === 0) {
        console.error('rawText is empty — Azure DI extraction must have failed');
        process.exit(1);
    }

    console.log('\n--- First 500 chars of rawText ---');
    console.log(rawText.slice(0, 500));
    console.log('--- end preview ---\n');

    console.log('🚀 Running parseCvTextToJson...');
    const t0 = Date.now();
    try {
        const { parseCvTextToJson } = await import('../lib/services/cv-parser');
        const result = await parseCvTextToJson(rawText);
        const elapsed = Date.now() - t0;
        console.log(`✅ Parse OK in ${elapsed}ms`);
        console.log(`\n📊 Results:`);
        console.log(`  experience: ${result.experience?.length ?? 0}`);
        console.log(`  education:  ${result.education?.length ?? 0}`);
        console.log(`  skills:     ${result.skills?.length ?? 0}`);
        console.log(`  languages:  ${result.languages?.length ?? 0}`);
        console.log(`  certifications: ${result.certifications?.length ?? 0}`);

        console.log('\n🎯 CERTIFICATIONS (post Welle A.5):');
        (result.certifications ?? []).forEach((c: any, i: number) => {
            console.log(`  [${i}] name="${c.name}"  issuer=${c.issuer ?? 'null'}  desc=${c.description ? `"${String(c.description).slice(0, 80)}..."` : 'null'}`);
        });

        console.log('\n🎯 EDUCATION (post Welle A.5):');
        (result.education ?? []).forEach((e: any, i: number) => {
            console.log(`  [${i}] degree="${e.degree}"  institution=${e.institution ?? 'null'}  desc=${e.description ? `"${String(e.description).slice(0, 80)}..."` : 'null'}`);
        });

        console.log('\n🎯 LANGUAGES (post Welle A):');
        (result.languages ?? []).forEach((l: any, i: number) => {
            console.log(`  [${i}] ${l.language} — ${l.proficiency ?? '?'}`);
        });

        console.log('\n🎯 SKILLS (post Welle A.7):');
        (result.skills ?? []).forEach((g: any, i: number) => {
            console.log(`  [${i}] ${g.category}: ${(g.items ?? []).join(', ')}`);
        });
    } catch (err: any) {
        const elapsed = Date.now() - t0;
        console.error(`❌ Parse FAILED after ${elapsed}ms`);
        console.error(`Error: ${err.message}`);
        if (err.stack) console.error(`\nStack:\n${err.stack}`);
        process.exit(1);
    }
}

main().catch((e) => {
    console.error('❌ Fatal:', e);
    process.exit(1);
});
