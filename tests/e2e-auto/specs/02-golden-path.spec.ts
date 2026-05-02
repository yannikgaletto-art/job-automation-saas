import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { createTestUser, deleteTestUser, TestUser } from '../helpers/test-user';
import { getProfile, getDocuments, getJobQueue } from '../helpers/supabase-readonly';
import { ui, waitForCvReviewEntry, waitForDashboard } from '../helpers/selectors';

/**
 * Phase 2 — Golden Path
 *
 * Frischer User → Sign-up → CV-Upload → Job-Add → Match → fertig.
 *
 * Nutzt SYNTHETISCHES CV (Anna Müller) — DSGVO-konform.
 * Vorlage: Übergang/test-fixtures/synthetic-cv-anna-mueller.md
 * PDF muss vor Test-Run erzeugt werden (siehe README §3).
 */

const SYNTHETIC_CV_PDF = path.resolve(
  __dirname,
  '../../../Übergang/test-fixtures/synthetic-cv-anna-mueller.pdf'
);

test.describe('Phase 2 — Golden Path', () => {
  let user: TestUser;

  test.beforeAll(async () => {
    if (!fs.existsSync(SYNTHETIC_CV_PDF)) {
      throw new Error(
        `Synthetic-CV-PDF fehlt: ${SYNTHETIC_CV_PDF}\n` +
        'Erzeuge das PDF aus Übergang/test-fixtures/synthetic-cv-anna-mueller.md ' +
        '(Anleitung in der Datei selbst).'
      );
    }
    user = await createTestUser('golden');
  });

  test.afterAll(async () => {
    if (user) {
      await deleteTestUser(user.id);
    }
  });

  test('2A — Login + CV-Upload + DB-State korrekt', async ({ page }) => {
    await page.goto('/');
    await ui.loginEmailInput(page).fill(user.email);
    await ui.loginPasswordInput(page).fill(user.password);
    await ui.loginSubmit(page).click();
    await waitForDashboard(page);

    await ui.sidebarProfil(page).click();
    await page.waitForLoadState('networkidle');

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(SYNTHETIC_CV_PDF);

    const reviewEntry = await waitForCvReviewEntry(page, 90_000);
    expect(reviewEntry, 'CV-Review nach 90s nicht erreichbar').not.toBeNull();

    if (reviewEntry === 'banner') {
      await ui.cvBannerReview(page).click();
    }
    await ui.cvConfirmDialog(page).waitFor({ state: 'visible' });

    const nameValue = await ui.cvNameInput(page).inputValue();
    expect(nameValue.toLowerCase(), 'Synthetic-Name "Anna Müller" sollte extrahiert werden').toContain('anna');

    await ui.cvSaveButton(page).click();
    await page.waitForTimeout(2_000);

    const profile = await getProfile(user.id);
    expect(profile?.cv_structured_data, 'Profile.cv_structured_data muss nach Save NICHT NULL sein').toBeTruthy();

    const docs = await getDocuments(user.id, 'cv');
    expect(docs.length, 'Genau 1 CV-Document erwartet (Single-CV-Invariant)').toBe(1);
  });

  test.skip('2B — Job hinzufügen + Match (TODO: Job-URL parametrisieren)', async ({ page }) => {
    // SKIPPED bis der Agent eine reproduzierbare Test-Job-URL injiziert.
    // Yannik liefert 3 URLs am Test-Run-Start (siehe MasterPrompt §6).
  });

  test.skip('2C — CV Optimizer + Cover Letter (TODO: nach 2B)', async ({ page }) => {
    // BLOCKER-Status: vor Aktivierung Yannik fragen ob Mishmasch akzeptabel ist.
    // Siehe MasterPrompt §3 R3.
  });
});
