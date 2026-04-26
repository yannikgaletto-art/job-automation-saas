/**
 * Dumps the raw extracted_text from the latest CV upload to disk.
 * This is what the Parser-LLM actually sees — the PDF→OCR-text bridge.
 *
 * Run: npx tsx scripts/debug-extracted-text.ts info@yannik-galetto.site
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const TARGET_EMAIL = process.argv[2] || 'info@yannik-galetto.site';

async function main() {
    const { data: authUsers } = await supabase.auth.admin.listUsers();
    const user = authUsers.users.find((u) => u.email === TARGET_EMAIL);
    if (!user) { console.error('No user'); process.exit(1); }

    const { data: docs } = await supabase
        .from('documents')
        .select('id, created_at, metadata')
        .eq('user_id', user.id)
        .eq('document_type', 'cv')
        .order('created_at', { ascending: false })
        .limit(1);

    if (!docs?.[0]) { console.error('No CV uploads'); process.exit(1); }

    const text = (docs[0].metadata as any)?.extracted_text;
    if (!text) { console.error('No extracted_text'); process.exit(1); }

    const outPath = '/tmp/cv-extracted-text.txt';
    fs.writeFileSync(outPath, text);
    console.log(`✅ Extracted text (${text.length} chars) saved to ${outPath}`);
    console.log(`\n═══ FIRST 3000 chars ═══\n${text.slice(0, 3000)}`);
    console.log(`\n═══ Searching for key tokens ═══`);
    const tokens = ['Ingrano', 'Xorder', 'Potsdam', 'BSP', 'Co-Founder', 'Innovation Manager', 'Fraunhofer'];
    for (const tok of tokens) {
        const idx = text.indexOf(tok);
        if (idx === -1) console.log(`  ❌ "${tok}" NOT found in extracted text`);
        else {
            const context = text.slice(Math.max(0, idx - 60), idx + 80).replace(/\n/g, ' ⏎ ');
            console.log(`  ✅ "${tok}" at offset ${idx}: ...${context}...`);
        }
    }
}
main().catch(console.error);
