import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const DOC_ID = 'e43fd1b6-6dc4-480e-9ce1-4d23d510c43c'; // Exxeta (current upload)

(async () => {
    const { data: doc } = await supabase
        .from('documents')
        .select('id, metadata')
        .eq('id', DOC_ID)
        .single();

    const text = (doc!.metadata as any)?.extracted_text as string;
    console.log('═══ EXTRACTED_TEXT (first 800 chars) ═══');
    console.log(text.slice(0, 800));
    console.log('...');
    console.log('text_len:', text.length);
    console.log();

    console.log('═══ FRESH PARSE ═══');
    const { parseCvTextToJson } = await import('../lib/services/cv-parser');
    const parsed = await parseCvTextToJson(text);

    console.log('personalInfo.name:', parsed.personalInfo?.name);
    console.log('personalInfo.email:', parsed.personalInfo?.email);
    console.log('personalInfo.phone:', parsed.personalInfo?.phone);
    console.log('personalInfo.targetRole:', parsed.personalInfo?.targetRole);
    console.log();
    console.log('experience.length:', parsed.experience?.length);
    parsed.experience?.forEach((e, i) => {
        console.log(`  [${i}] role="${e.role}" company="${e.company ?? 'NULL'}" dates="${e.dateRangeText}"`);
    });
    console.log();
    console.log('education.length:', parsed.education?.length);
    parsed.education?.forEach((e, i) => {
        console.log(`  [${i}] degree="${e.degree}" institution="${e.institution ?? 'NULL'}" grade="${e.grade ?? 'NULL'}"`);
    });
    console.log();
    console.log('certifications.length:', parsed.certifications?.length);
    parsed.certifications?.forEach((c, i) => {
        console.log(`  [${i}] name="${c.name}" issuer="${c.issuer ?? 'NULL'}"`);
    });
})();
