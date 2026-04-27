import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const USER_ID = 'f1cea2b5-0a60-46b9-afc3-59fcb4a1d34c';
const EXXETA_DOC_ID = 'e43fd1b6-6dc4-480e-9ce1-4d23d510c43c'; // current Exxeta doc

(async () => {
    const { syncMasterCvFromDocument } = await import('../lib/services/cv-master-sync');

    // Phase 8 (2026-04-27): heal Yannik's master CV. Old master had
    // name="Berlin   Familienstatus" + only 5 stations + missing companies,
    // because it was parsed before the Phase 5/6/7/8 fixes were live.
    // Force-sync against Exxeta doc (the cleanest OCR source) using the
    // current parser to produce a clean structured master.

    // Reset full_name so the cv-master-sync helper picks the new fresh-parsed
    // name from the structured CV. Otherwise it overrides with the stale
    // "Berlin   Familienstatus" value still in user_profiles.full_name.
    await supabase
        .from('user_profiles')
        .update({ full_name: null })
        .eq('id', USER_ID);
    console.log('Reset user_profiles.full_name to null (will be filled by parser)');

    const result = await syncMasterCvFromDocument(USER_ID, EXXETA_DOC_ID, supabase, { force: true });
    console.log('sync result:', result);

    // Read back and verify
    const { data: profile } = await supabase
        .from('user_profiles')
        .select('cv_structured_data, cv_original_file_path, full_name')
        .eq('id', USER_ID)
        .maybeSingle();
    const pi = (profile?.cv_structured_data as any)?.personalInfo;
    console.log('master full_name:', profile?.full_name);
    console.log('master cv_original_file_path:', profile?.cv_original_file_path);
    console.log('master personalInfo.name:', pi?.name);
    console.log('master personalInfo.email:', pi?.email);
    console.log('master experience.length:', (profile?.cv_structured_data as any)?.experience?.length);

    // Now also write the fresh parsed name back to full_name (so it survives future syncs)
    if (pi?.name && pi.name !== 'Berlin   Familienstatus') {
        await supabase
            .from('user_profiles')
            .update({ full_name: pi.name })
            .eq('id', USER_ID);
        console.log('Updated user_profiles.full_name to:', pi.name);
    }
})();
