import { test, expect } from '@playwright/test';
import path from 'path';
import { createTestUser, deleteTestUser, TestUser } from '../helpers/test-user';
import { getProfile, getDocuments } from '../helpers/supabase-readonly';
import { ui, waitForDashboard, waitForBanner } from '../helpers/selectors';

/**
 * Phase 1 — Q3 Name-Regression (KRITISCH)
 *
 * Reproduziert den PROD-Bug: CV-Parser extrahiert "Transformation Institute"
 * statt des realen Personennamens.
 *
 * AUSNAHME zur DSGVO-Regel:
 *   Q3 reproduziert sich NUR mit dem real CV-Inhalt, der den Bug ausgelöst
 *   hat. Wir nutzen daher Yanniks reales CV (`Übergang/AI TI I CV.pdf`),
 *   garantieren aber Cleanup im afterAll.
 *
 * Quelle: Übergang/HANDOVER_CLEANUP_AGENT_2026-04-29.md §2 Q3
 */

const REAL_CV_PATH = path.resolve(__dirname, '../../../Übergang/AI TI I CV.pdf');

test.describe('Phase 1A — Q3 Name-Regression', () => {
  let user: TestUser;

  test.beforeAll(async () => {
    user = await createTestUser('q3-name');
  });

  test.afterAll(async () => {
    if (user) {
      await deleteTestUser(user.id);
    }
  });

  test('Q3 — CV-Parser extrahiert echten Namen, NICHT "Transformation Institute"', async ({ page }) => {
    await page.goto('/');
    await ui.loginEmailInput(page).fill(user.email);
    await ui.loginPasswordInput(page).fill(user.password);
    await ui.loginSubmit(page).click();

    await waitForDashboard(page);
    await ui.sidebarProfil(page).click();
    await page.waitForLoadState('networkidle');

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(REAL_CV_PATH);

    const bannerAppeared = await waitForBanner(page, 90_000);
    expect(bannerAppeared, 'CV-Upload-Banner ist nach 90s nicht erschienen').toBe(true);

    const dialogAlreadyOpen = await ui.cvConfirmDialog(page)
      .isVisible({ timeout: 1_000 })
      .catch(() => false);
    if (!dialogAlreadyOpen) {
      await ui.cvBannerReview(page).click({ force: true });
    }
    await ui.cvConfirmDialog(page).waitFor({ state: 'visible' });

    const nameValue = await ui.cvNameInput(page).inputValue();
    console.log(`[Q3] Extrahierter Name: "${nameValue}"`);

    expect(
      nameValue.toLowerCase(),
      `Q3 BLOCKER: Name-Extraktion regressiert. Bekommen: "${nameValue}". Erwartet: realer Personenname (NICHT "Transformation Institute").`
    ).not.toContain('transformation');
    expect(nameValue.length, 'Name ist leer').toBeGreaterThan(2);

    const profile = await getProfile(user.id);
    const docs = await getDocuments(user.id, 'cv');

    console.log(`[Q3] Profile cv_structured_data exists: ${!!profile?.cv_structured_data}`);
    console.log(`[Q3] Documents count: ${docs.length}`);

    expect(docs.length, 'Mindestens 1 CV-Document sollte in DB sein').toBeGreaterThanOrEqual(1);
  });
});
