import { Page, Locator } from '@playwright/test';

/**
 * Zentrale Selektoren für Pathly UI.
 *
 * WICHTIG: Pathly hat (Stand 2026-05-01) KEINE data-testid Attribute.
 * Diese Helpers nutzen Text/Role-Locators (Playwright-Best-Practice).
 *
 * Wenn Selektoren brechen: HIER zentral updaten, nicht in jedem Spec-File.
 */

export const ui = {
  // Auth-Flows
  loginEmailInput: (page: Page) =>
    page.getByLabel(/E-?Mail|Email/i)
      .or(page.getByPlaceholder(/deine@email\.de|email/i))
      .or(page.locator('input[type="email"]'))
      .first(),
  loginPasswordInput: (page: Page) =>
    page.getByLabel(/Passwort|Password/i)
      .or(page.locator('input[type="password"]'))
      .first(),
  loginSubmit: (page: Page) =>
    page.getByRole('button', { name: /anmelden|sign in|login/i }),

  // Sidebar Navigation
  sidebarProfil: (page: Page) =>
    page.getByRole('link', { name: /profil/i }).first(),
  sidebarJobQueue: (page: Page) =>
    page.getByRole('link', { name: /job.?queue|jobs/i }).first(),
  sidebarSettings: (page: Page) =>
    page.getByRole('link', { name: /einstellungen|settings/i }).first(),

  // Profil — CV
  cvUploadButton: (page: Page) =>
    page.getByRole('button', { name: /lebenslauf hochladen|upload cv/i }),
  cvBannerReview: (page: Page) =>
    page.getByText(/bitte prüfen|please review/i).first(),
  cvConfirmDialog: (page: Page) =>
    page.getByRole('dialog')
      .or(page.locator('.fixed.inset-0').filter({ hasText: /Stimmen die Daten|review the parsed CV/i }))
      .first(),
  cvNameInput: (page: Page) =>
    page.getByLabel(/^name$/i)
      .or(page.locator('.fixed.inset-0 input').first())
      .first(),
  cvSaveButton: (page: Page) =>
    page.getByRole('button', { name: /speichern|save/i }).first(),

  // Job-Queue
  matchButton: (page: Page) =>
    page.getByRole('button', { name: /match|cv.?match/i }).first(),
  optimizerButton: (page: Page) =>
    page.getByRole('button', { name: /optimizer|optimieren/i }).first(),
  coverLetterButton: (page: Page) =>
    page.getByRole('button', { name: /cover letter|anschreiben/i }).first(),

  // Generic
  toastError: (page: Page) =>
    page.locator('[role="alert"], .toast').filter({ hasText: /fehler|error/i }),
};

export async function waitForDashboard(page: Page) {
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
  await page.waitForLoadState('networkidle');

  const moodSkip = page.getByRole('button', { name: /jetzt nicht|not now|skip/i });
  if (await moodSkip.first().isVisible({ timeout: 2_000 }).catch(() => false)) {
    await moodSkip.first().click();
  }
}

export async function waitForBanner(
  page: Page,
  timeoutMs = 60_000
): Promise<boolean> {
  try {
    await ui.cvBannerReview(page).waitFor({ state: 'visible', timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
}
