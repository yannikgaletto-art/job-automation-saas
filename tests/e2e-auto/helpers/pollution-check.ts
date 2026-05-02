import { getSupabaseAdmin } from './supabase-readonly';

export interface PollutionResult {
  table: string;
  leftoverRows: number;
}

const PATTERN = process.env.TEST_USER_EMAIL_PATTERN ?? 'anna.mueller.test+e2e';

export async function checkPollution(): Promise<PollutionResult[]> {
  const supabase = getSupabaseAdmin();

  const { data: usersData } = await supabase.auth.admin.listUsers();
  const testUsers = (usersData?.users ?? []).filter((u) =>
    u.email?.startsWith(PATTERN)
  );
  const testUserIds = testUsers.map((u) => u.id);

  const results: PollutionResult[] = [
    { table: 'auth.users', leftoverRows: testUsers.length },
  ];

  if (testUserIds.length === 0) {
    results.push(
      { table: 'documents', leftoverRows: 0 },
      { table: 'job_queue', leftoverRows: 0 },
      { table: 'user_profiles', leftoverRows: 0 },
      { table: 'community_posts', leftoverRows: 0 }
    );
    return results;
  }

  const tables = ['documents', 'job_queue', 'user_profiles', 'community_posts'];
  for (const t of tables) {
    const userColumn = t === 'user_profiles' ? 'id' : 'user_id';
    const { count, error } = await supabase
      .from(t)
      .select('*', { count: 'exact', head: true })
      .in(userColumn, testUserIds);
    results.push({
      table: t,
      leftoverRows: error ? -1 : count ?? 0,
    });
  }
  return results;
}

export function isPollutionFree(results: PollutionResult[]): boolean {
  return results.every((r) => r.leftoverRows === 0);
}

export function formatPollutionReport(results: PollutionResult[]): string {
  const lines = ['Pollution-Check:'];
  for (const r of results) {
    const icon = r.leftoverRows === 0 ? '✅' : r.leftoverRows < 0 ? '❓' : '🔴';
    lines.push(`  ${icon} ${r.table}: ${r.leftoverRows}`);
  }
  return lines.join('\n');
}
