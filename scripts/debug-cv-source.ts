/**
 * Diagnose-Skript: Liest cv_structured_data aus der DB für einen User.
 * Zeigt experience-Stationen + education + summary, um Source-Korruption zu erkennen.
 *
 * Run: npx tsx scripts/debug-cv-source.ts
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE env vars in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
// Pass email as CLI arg, fallback to the active site account.
const TARGET_EMAIL = process.argv[2] || 'info@yannik-galetto.site';

async function main() {
  console.log(`\n🔍 Looking up user: ${TARGET_EMAIL}\n`);

  const { data: authUsers, error: authErr } = await supabase.auth.admin.listUsers();
  if (authErr) {
    console.error('❌ Could not list auth users:', authErr.message);
    process.exit(1);
  }

  const user = authUsers.users.find((u) => u.email === TARGET_EMAIL);
  if (!user) {
    console.error(`❌ No auth user found for ${TARGET_EMAIL}`);
    process.exit(1);
  }
  console.log(`✅ Auth user id: ${user.id}\n`);

  const { data: profile, error: profErr } = await supabase
    .from('user_profiles')
    .select('id, cv_structured_data, updated_at')
    .eq('id', user.id)
    .maybeSingle();

  if (profErr) {
    console.error('❌ DB error:', profErr.message);
    process.exit(1);
  }
  if (!profile) {
    console.error('❌ No user_profiles row for this user.');
    process.exit(1);
  }

  console.log(`📅 Profile last updated: ${profile.updated_at}\n`);

  const cv = profile.cv_structured_data as any;
  if (!cv) {
    console.log('⚠️  cv_structured_data is NULL — kein geparster CV in DB.');
    return;
  }

  console.log('═══════════════════════════════════════════════════════════');
  console.log('  PERSONAL INFO');
  console.log('═══════════════════════════════════════════════════════════');
  const pi = cv.personalInfo ?? {};
  console.log(`  name:       ${pi.name ?? '(missing)'}`);
  console.log(`  email:      ${pi.email ?? '(missing)'}`);
  console.log(`  targetRole: ${pi.targetRole ?? '(missing)'}`);
  console.log(`  summary:    ${pi.summary ? `"${String(pi.summary).slice(0, 100)}..."` : '(missing)'}`);

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`  EXPERIENCE (${cv.experience?.length ?? 0} Stationen)`);
  console.log('═══════════════════════════════════════════════════════════');
  (cv.experience ?? []).forEach((exp: any, i: number) => {
    console.log(`\n  [${i}] role:    ${exp.role ?? '(MISSING)'}`);
    console.log(`      company: ${exp.company ?? '(MISSING)'}`);
    console.log(`      dates:   ${exp.dateRangeText ?? '(missing)'}`);
    console.log(`      location:${exp.location ?? '(missing)'}`);
    if (exp.summary) console.log(`      summary: "${String(exp.summary).slice(0, 80)}..."`);
    if (Array.isArray(exp.bullets) && exp.bullets.length) {
      console.log(`      bullets (${exp.bullets.length}):`);
      exp.bullets.slice(0, 3).forEach((b: string, j: number) => {
        console.log(`        ${j + 1}. ${String(b).slice(0, 100)}${b.length > 100 ? '...' : ''}`);
      });
    }
  });

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`  EDUCATION (${cv.education?.length ?? 0} Einträge)`);
  console.log('═══════════════════════════════════════════════════════════');
  (cv.education ?? []).forEach((edu: any, i: number) => {
    console.log(`\n  [${i}] degree:      ${edu.degree ?? '(missing)'}`);
    console.log(`      institution: ${edu.institution ?? '(missing)'}`);
    console.log(`      dates:       ${edu.dateRangeText ?? '(missing)'}`);
    console.log(`      grade:       ${edu.grade ?? '(missing)'}`);
    if (edu.description) console.log(`      desc: "${String(edu.description).slice(0, 100)}..."`);
  });

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`  SKILLS (${cv.skills?.length ?? 0} Gruppen)`);
  console.log('═══════════════════════════════════════════════════════════');
  (cv.skills ?? []).forEach((g: any, i: number) => {
    console.log(`  [${i}] ${g.category ?? '(no cat)'}: ${(g.items ?? []).join(', ')}`);
  });

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`  CERTIFICATIONS (${cv.certifications?.length ?? 0})`);
  console.log('═══════════════════════════════════════════════════════════');
  (cv.certifications ?? []).forEach((c: any, i: number) => {
    console.log(`  [${i}] ${c.name ?? '(no name)'} — ${c.issuer ?? '(no issuer)'}`);
    if (c.description) console.log(`      desc: ${String(c.description).slice(0, 100)}`);
  });

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`  LANGUAGES (${cv.languages?.length ?? 0})`);
  console.log('═══════════════════════════════════════════════════════════');
  (cv.languages ?? []).forEach((l: any, i: number) => {
    console.log(`  [${i}] ${l.language ?? l.name ?? '?'} — ${l.proficiency ?? l.level ?? '?'}`);
  });

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  DOCUMENTS TABLE (cv uploads)');
  console.log('═══════════════════════════════════════════════════════════');
  const { data: docs, error: docsErr } = await supabase
    .from('documents')
    .select('id, document_type, created_at, metadata, file_url_encrypted, origin')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20);

  if (docsErr) {
    console.log('  ⚠️  Could not query documents:', docsErr.message);
  } else if (!docs || docs.length === 0) {
    console.log('  (no rows in documents table for this user)');
  } else {
    docs.forEach((d: any, i: number) => {
      const meta = d.metadata ?? {};
      const orig = meta.original_name ?? '(no name)';
      const err = meta.extraction_error;
      const hasText = meta.extracted_text ? `${String(meta.extracted_text).length} chars` : 'NULL';
      console.log(`  [${i}] ${orig}  (type=${d.document_type}, origin=${d.origin ?? 'null'})`);
      console.log(`      created:   ${d.created_at}`);
      console.log(`      path:      ${d.file_url_encrypted}`);
      console.log(`      extracted: ${hasText}`);
      if (err) console.log(`      ⚠️  extraction_error: ${err}`);
    });
  }

  console.log('\n✅ Done. Compare against Übergang/Lebenslauf I Exxeta.pdf to spot drift.\n');
}

main().catch((e) => {
  console.error('❌ Fatal:', e);
  process.exit(1);
});
