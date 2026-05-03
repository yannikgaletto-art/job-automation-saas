import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, TestUser } from '../helpers/test-user';
import { getSupabaseAdmin } from '../helpers/supabase-readonly';
import { waitForDashboard } from '../helpers/selectors';
import { CvStructuredData } from '@/types/cv';

const cvData: CvStructuredData = {
  version: '1.0',
  personalInfo: {
    name: 'Anna Mueller',
    email: 'anna.mueller@example.com',
    location: 'Berlin',
    summary: 'Innovation Managerin mit Fokus auf B2B-Wachstum und Transformation.',
  },
  experience: [
    {
      id: 'exp-1',
      role: 'Innovation Managerin',
      company: 'Pathly E2E GmbH',
      dateRangeText: '2022 - Heute',
      description: [
        {
          id: 'bullet-1',
          text: 'C-Level-Engagement & Geschaeftsentwicklung: Stakeholder synchronisiert',
        },
      ],
    },
  ],
  education: [],
  skills: [
    {
      id: 'skills-1',
      category: 'Strategie',
      items: ['Go-to-Market'],
      displayMode: 'comma',
    },
  ],
  languages: [],
  certifications: [],
};

test.describe('CV Preview Editor', () => {
  let user: TestUser;

  test.beforeAll(async () => {
    user = await createTestUser('cv-preview-editor');
    const supabase = getSupabaseAdmin();

    const { error: profileError } = await supabase
      .from('user_profiles')
      .upsert({
        id: user.id,
        pii_encrypted: '\\x00',
        onboarding_completed: true,
        cv_structured_data: cvData,
      });
    if (profileError) throw profileError;

    const proposal = { translated: cvData, optimized: cvData, changes: [] };
    const decisions = { choices: {}, appliedChanges: [] };
    const sourceUrl = `https://example.com/pathly-e2e-preview-${Date.now()}`;

    const { error: jobError } = await supabase.from('job_queue').insert({
      user_id: user.id,
      user_profile_id: user.id,
      job_url: sourceUrl,
      source_url: sourceUrl,
      job_title: 'Preview Editor Testrolle',
      company_name: 'Pathly E2E GmbH',
      location: 'Berlin',
      platform: 'company_website',
      status: 'cv_optimized',
      priority: 'manual',
      source: 'manual',
      description: 'Synthetic preview editor test job.',
      metadata: { cv_match: { keywordsMissing: ['MEDDICC'] } },
      cv_optimization_proposal: proposal,
      cv_optimization_user_decisions: decisions,
    });
    if (jobError) throw jobError;
  });

  test.afterAll(async () => {
    if (user) await deleteTestUser(user.id);
  });

  test('edits preview/download draft, adds skills, and keeps draft through layout changes', async ({ page }) => {
    await page.goto('/de/login');
    const emailInput = page.getByPlaceholder('deine@email.de');
    await emailInput.waitFor({ state: 'visible' });
    await emailInput.pressSequentially(user.email);
    await expect(emailInput).toHaveValue(user.email);

    const passwordInput = page.locator('input[type="password"]');
    await passwordInput.fill(user.password);
    await expect(passwordInput).toHaveValue(user.password);
    await page.getByRole('button', { name: /Anmelden/i }).click();
    await waitForDashboard(page);

    await page.goto('/de/dashboard/job-queue');
    await page.getByText('Pathly E2E GmbH').click();
    await page.getByRole('button', { name: /CV Opt\./i }).nth(1).click();

    await page.getByRole('button', { name: /Preview bearbeiten/i }).waitFor({ state: 'visible', timeout: 30_000 });
    await page.getByRole('button', { name: /Preview bearbeiten/i }).click();

    await expect(page.getByText(/Diese Änderungen gelten nur für die geöffnete Vorschau/i)).toBeVisible();

    const bulletTextarea = page.locator('textarea').nth(1);
    await expect(bulletTextarea).toHaveValue('C-Level-Engagement & Geschaeftsentwicklung: Stakeholder synchronisiert');
    await bulletTextarea.fill('C-Level-Engagement & Geschaeftsentwicklung: Pipeline mit Vorstand abgestimmt');

    await page.getByRole('button', { name: /Skill hinzufügen/i }).click();
    await page.getByPlaceholder('Skill').last().fill('MEDDICC');

    await page.getByRole('button', { name: /Skill-Gruppe hinzufügen/i }).click();
    await page.getByPlaceholder(/Kategorie/).last().fill('Tools');
    await page.getByPlaceholder('Skill').last().fill('Salesforce');

    await page.getByRole('button', { name: /Für Download übernehmen/i }).click();
    await expect(page.getByText(/Diese Änderungen gelten nur für die geöffnete Vorschau/i)).toBeHidden();

    await page.getByRole('button', { name: /Kompakt|Standard/i }).first().click();
    await page.getByRole('button', { name: /Preview bearbeiten/i }).click();

    await expect(page.locator('textarea').nth(1)).toHaveValue('C-Level-Engagement & Geschaeftsentwicklung: Pipeline mit Vorstand abgestimmt');
    await expect(page.getByPlaceholder('Skill').nth(1)).toHaveValue('MEDDICC');
    await expect(page.getByPlaceholder('Skill').nth(2)).toHaveValue('Salesforce');
  });
});
