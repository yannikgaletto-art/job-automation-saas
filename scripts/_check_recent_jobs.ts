import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const userId = 'f1cea2b5-0a60-46b9-afc3-59fcb4a1d34c';

(async () => {
    const { data: jobs } = await supabase
        .from('job_queue')
        .select('id, job_title, company_name, status, created_at, updated_at, description, requirements, buzzwords, metadata')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(5);
    jobs?.forEach((j: any) => {
        const meta = j.metadata as any;
        console.log(`\n═══ ${j.company_name} | ${j.job_title} ═══`);
        console.log(`  id: ${j.id}`);
        console.log(`  status: ${j.status}`);
        console.log(`  created: ${j.created_at}`);
        console.log(`  updated: ${j.updated_at}`);
        console.log(`  description.length: ${(j.description || '').length}`);
        console.log(`  description preview: "${(j.description || '').slice(0, 200)}…"`);
        console.log(`  requirements.length: ${Array.isArray(j.requirements) ? j.requirements.length : 'null'}`);
        console.log(`  buzzwords.length: ${Array.isArray(j.buzzwords) ? j.buzzwords.length : 'null'}`);
        console.log(`  metadata.extraction_status: ${meta?.extraction_status ?? '(none)'}`);
        console.log(`  metadata.extraction_error: ${meta?.extraction_error ?? '(none)'}`);
        console.log(`  metadata keys: ${meta ? Object.keys(meta).join(', ') : '(no metadata)'}`);
    });
})();
