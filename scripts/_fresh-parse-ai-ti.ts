import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const DOC_ID = '3ca2a9bd-6cf1-4cba-b360-929c168a5046'; // AI TI I CV.pdf

(async () => {
    const { data: doc } = await supabase
        .from('documents')
        .select('id, metadata')
        .eq('id', DOC_ID)
        .single();

    const text = (doc!.metadata as any)?.extracted_text as string;
    console.log('═══ AI TI I CV.pdf — extracted_text (first 500 chars) ═══');
    console.log(text.slice(0, 500));
    console.log('...');

    console.log('\n═══ FRESH PARSE ═══');
    const { parseCvTextToJson } = await import('../lib/services/cv-parser');
    const parsed = await parseCvTextToJson(text);

    console.log('\nname:', parsed.personalInfo?.name);
    console.log('email:', parsed.personalInfo?.email);
    console.log('phone:', parsed.personalInfo?.phone);
    console.log('targetRole:', parsed.personalInfo?.targetRole);
    console.log('\nexperience.length:', parsed.experience?.length);
    parsed.experience?.forEach((e, i) => {
        console.log(`  [${i}] role="${e.role}" company="${e.company ?? 'NULL'}" dates="${e.dateRangeText}"`);
    });
    console.log('\neducation.length:', parsed.education?.length);
    parsed.education?.forEach((e, i) => {
        console.log(`  [${i}] degree="${e.degree}" institution="${e.institution ?? 'NULL'}" grade="${e.grade ?? 'NULL'}"`);
        if (e.description) console.log(`      desc: "${e.description.slice(0, 150)}…"`);
    });
    console.log('\ncerts.length:', parsed.certifications?.length);
    parsed.certifications?.forEach((c, i) => {
        console.log(`  [${i}] name="${c.name}" issuer="${c.issuer ?? 'NULL'}"`);
    });
})();
