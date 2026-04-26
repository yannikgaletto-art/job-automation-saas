import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const userId = '941c3630-a916-4324-b0aa-8912166e7d61';

async function main() {
  console.log('═══ Search ALL recent CV uploads (last 7 days, ALL users) ═══');
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const { data: recent, error: recErr } = await supabase
    .from('documents')
    .select('id, user_id, document_type, origin, created_at, metadata')
    .eq('document_type', 'cv')
    .gte('created_at', since)
    .order('created_at', { ascending: false });
  if (recErr) console.log('Error:', recErr.message);
  else {
    console.log(`Found ${recent?.length ?? 0} CV uploads in last 7 days across ALL users:`);
    recent?.forEach((d: any, i: number) => {
      console.log(`  [${i}] user=${d.user_id?.slice(0,8)} name="${d.metadata?.original_name ?? '?'}" origin=${d.origin} created=${d.created_at}`);
    });
  }

  // Check all auth users
  console.log('\n═══ Auth users ═══');
  const { data: authUsers } = await supabase.auth.admin.listUsers();
  authUsers?.users?.forEach((u: any) => console.log(`  ${u.email} — id=${u.id?.slice(0,8)} created=${u.created_at}`));

  console.log('\n═══ Buckets list ═══');
  const { data: buckets } = await supabase.storage.listBuckets();
  buckets?.forEach((b) => console.log(`  ${b.name} (public=${b.public})`));

  console.log('\n═══ CV Storage Bucket (cvs/<userId>/) ═══');
  const { data: files, error } = await supabase.storage.from('cvs').list(userId, { limit: 50, sortBy: { column: 'created_at', order: 'desc' } });
  if (error) console.log('Error:', error.message);
  else if (!files?.length) console.log('  (empty)');
  else files.forEach((f, i) => console.log(`  [${i}] ${f.name}  size=${f.metadata?.size ?? '?'}  created=${f.created_at}`));

  console.log('\n═══ ALL documents rows for user (cv + cover_letter, any origin) ═══');
  const { data: byName } = await supabase.from('documents').select('id, document_type, origin, created_at, metadata, file_url_encrypted').eq('user_id', userId).order('created_at', { ascending: false });
  console.log(`Total documents rows: ${byName?.length ?? 0}`);
  const cvRows = byName?.filter((d: any) => d.document_type === 'cv') ?? [];
  console.log(`\nCV rows only: ${cvRows.length}`);
  cvRows.forEach((d: any, i: number) => {
    const n = d.metadata?.original_name ?? '(no original_name)';
    console.log(`  [${i}] "${n}" — origin=${d.origin}, created=${d.created_at}, path=${d.file_url_encrypted}`);
  });
}
main().catch(console.error);
