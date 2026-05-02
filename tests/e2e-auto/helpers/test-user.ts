import { getSupabaseAdmin } from './supabase-readonly';

export interface TestUser {
  id: string;
  email: string;
  password: string;
}

const PATTERN = process.env.TEST_USER_EMAIL_PATTERN ?? 'anna.mueller.test+e2e';
const PASSWORD = process.env.TEST_USER_PASSWORD ?? 'Test-Pathly-2026-NotASecret!';

function buildEmail(suffix: string): string {
  return `${PATTERN}-${suffix}-${Date.now()}@example.com`;
}

export async function createTestUser(suffix = 'default'): Promise<TestUser> {
  const supabase = getSupabaseAdmin();
  const email = buildEmail(suffix);

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  if (!data.user) throw new Error('createUser returned no user');

  const now = new Date().toISOString();
  const { error: settingsError } = await supabase
    .from('user_settings')
    .upsert(
      {
        user_id: data.user.id,
        onboarding_completed: true,
        onboarding_step: 2,
        onboarding_completed_at: now,
        language: 'de',
        updated_at: now,
      },
      { onConflict: 'user_id' }
    );
  if (settingsError) throw settingsError;

  return { id: data.user.id, email, password: PASSWORD };
}

export async function deleteTestUser(userId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (error) throw error;
}

export async function deleteAllTestUsers(): Promise<number> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.auth.admin.listUsers();
  if (error) throw error;

  const victims = data.users.filter((u) => u.email?.startsWith(PATTERN));
  let deleted = 0;
  for (const u of victims) {
    const { error: delErr } = await supabase.auth.admin.deleteUser(u.id);
    if (!delErr) deleted++;
  }
  return deleted;
}
