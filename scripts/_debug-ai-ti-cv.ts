/**
 * Debug script — inspect the AI TI CV's extracted text + parser output.
 * Targeted forensic for 2026-04-27 user feedback (parser defects despite Welle Re-1).
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const DOC_ID = 'a7cf57e9-75ff-4259-abb5-1a7988dd1ecb';

(async () => {
    const { data: doc } = await supabase
        .from('documents')
        .select('id, metadata, file_url_encrypted, created_at, user_id')
        .eq('id', DOC_ID)
        .single();

    if (!doc) {
        console.error('❌ Document not found');
        process.exit(1);
    }

    const meta = doc.metadata as Record<string, unknown>;
    const extractedText = meta?.extracted_text as string | undefined;

    console.log('═══ EXTRACTED_TEXT (raw OCR from Azure DI) ═══');
    if (!extractedText) {
        console.log('⚠️ NO extracted_text in metadata!');
        process.exit(1);
    }
    console.log(`Length: ${extractedText.length} chars`);
    console.log('---');
    console.log(extractedText);
    console.log('---\n');

    console.log('═══ FRESH PARSE (parseCvTextToJson on the same raw text) ═══');
    const { parseCvTextToJson } = await import('../lib/services/cv-parser');
    const parsed = await parseCvTextToJson(extractedText);

    console.log('personalInfo.name:', parsed.personalInfo?.name ?? '(null)');
    console.log('personalInfo.targetRole:', parsed.personalInfo?.targetRole ?? '(null)');
    console.log('personalInfo.summary:', parsed.personalInfo?.summary ?? '(null)');
    console.log('experience.length:', parsed.experience?.length ?? 0);
    parsed.experience?.forEach((exp, i) => {
        console.log(`  [${i}] role="${exp.role}" company="${exp.company ?? '(null)'}" date="${exp.dateRangeText ?? '(null)'}"`);
        const desc = exp.description as Array<{ text?: string }> | undefined;
        if (Array.isArray(desc)) {
            desc.forEach((d, j) => console.log(`      bullet[${j}]: ${(d.text ?? '').slice(0, 80)}…`));
        }
    });
    console.log('education.length:', parsed.education?.length ?? 0);
    parsed.education?.forEach((edu, i) => {
        console.log(`  [${i}] degree="${edu.degree}" institution="${edu.institution ?? '(null)'}" grade="${edu.grade ?? '(null)'}"`);
        if (edu.description) console.log(`      description: "${String(edu.description).slice(0, 200)}…"`);
    });
    console.log('certifications.length:', parsed.certifications?.length ?? 0);
    parsed.certifications?.forEach((cert, i) => {
        console.log(`  [${i}] name="${cert.name}" issuer="${cert.issuer ?? '(null)'}" date="${cert.dateText ?? '(null)'}"`);
        if (cert.description) console.log(`      description: "${String(cert.description).slice(0, 200)}…"`);
    });
})();
