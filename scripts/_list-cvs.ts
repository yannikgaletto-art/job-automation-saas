import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

(async () => {
    const { data: { users: authUsers } } = await supabase.auth.admin.listUsers();
    const authUser = authUsers?.find(u => u.email === 'info@yannik-galetto.site');
    if (!authUser) { console.error('user not found'); process.exit(1); }
    const userId = authUser.id;
    console.log('userId:', userId);

    const { data: docs } = await supabase
        .from('documents')
        .select('id, metadata, created_at')
        .eq('user_id', userId)
        .eq('document_type', 'cv')
        .order('created_at', { ascending: false });

    docs?.forEach(d => {
        const meta = d.metadata as any;
        console.log(`ID=${d.id} name="${meta?.original_name ?? '?'}" created=${d.created_at} text_len=${(meta?.extracted_text as string)?.length ?? 0}`);
    });

    const { data: profile } = await supabase
        .from('user_profiles')
        .select('cv_original_file_path, full_name')
        .eq('id', userId)
        .maybeSingle();
    console.log('master file_path:', profile?.cv_original_file_path);
    console.log('master full_name:', profile?.full_name);
})();
