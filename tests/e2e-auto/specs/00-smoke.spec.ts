import { test, expect } from '@playwright/test';
import { getSupabaseAdmin } from '../helpers/supabase-readonly';
import { checkPollution, formatPollutionReport, isPollutionFree } from '../helpers/pollution-check';

/**
 * Smoke-Test — läuft VOR allen anderen Tests.
 *
 * Verifiziert:
 *   - Vercel-Preview-URL erreichbar
 *   - Supabase Service-Role-Key funktioniert
 *   - DB ist pollution-frei (keine alten Test-User-Spuren)
 *
 * Fail-Aktion: Wenn dieser Test failt, ALLE folgenden Tests skippen.
 */

test.describe('Phase 0 — Smoke', () => {
  test('00A — Vercel-Preview erreichbar + zeigt Login-Seite', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status(), 'Server hat nicht 2xx geantwortet').toBeLessThan(400);

    const url = page.url();
    expect(url).toContain('http');

    const hasAuthAffordance = await Promise.race([
      page.getByRole('button', { name: /anmelden|sign in|login/i }).first().waitFor({ timeout: 10_000 }).then(() => true).catch(() => false),
      page.getByText(/willkommen|welcome|pathly/i).first().waitFor({ timeout: 10_000 }).then(() => true).catch(() => false),
    ]);
    expect(hasAuthAffordance, 'Weder Login-Button noch Pathly-Welcome-Text gefunden').toBe(true);
  });

  test('00B — Supabase Service-Role-Key gültig', async () => {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });
    expect(error, `Service-Role-Key invalid: ${error?.message}`).toBeNull();
    expect(data, 'listUsers returned no data').toBeTruthy();
  });

  test('00C — DB pollution-frei (keine alten Test-User)', async () => {
    const results = await checkPollution();
    const report = formatPollutionReport(results);
    console.log(report);
    expect(
      isPollutionFree(results),
      `Pollution gefunden — manuell aufräumen via deleteAllTestUsers():\n${report}`
    ).toBe(true);
  });
});
