import { test, expect } from '@playwright/test';
import { deleteAllTestUsers } from '../helpers/test-user';
import { checkPollution, formatPollutionReport, isPollutionFree } from '../helpers/pollution-check';

/**
 * Phase 8 — Atomare Cleanup-Spec.
 *
 * MUSS NACH allen anderen Tests laufen (deshalb 99- prefix).
 * Löscht ALLE Test-User mit dem konfigurierten Pattern + verifiziert.
 *
 * Fail = manueller Eingriff erforderlich.
 */

test.describe('Phase 8 — Pollution-Cleanup', () => {
  test('99A — Alle Test-User cascade-löschen', async () => {
    const deleted = await deleteAllTestUsers();
    console.log(`[Cleanup] ${deleted} Test-User gelöscht`);
  });

  test('99B — Pollution-Check post-cleanup ist clean', async () => {
    const results = await checkPollution();
    const report = formatPollutionReport(results);
    console.log(report);
    expect(
      isPollutionFree(results),
      `RESTPOLLUTION nach Cleanup — manuell prüfen:\n${report}`
    ).toBe(true);
  });
});
