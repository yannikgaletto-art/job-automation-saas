import { createClient, SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      'SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt in tests/e2e-auto/.env.test. ' +
      'Siehe .env.test.example als Template.'
    );
  }

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

export async function getUserByEmail(email: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.auth.admin.listUsers();
  if (error) throw error;
  return data.users.find((u) => u.email === email) ?? null;
}

export async function getProfile(userId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getDocuments(userId: string, type?: string) {
  const supabase = getSupabaseAdmin();
  let q = supabase.from('documents').select('*').eq('user_id', userId);
  if (type) q = q.eq('document_type', type);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function getJobQueue(userId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('job_queue')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getCredits(userId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('user_credits')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}
