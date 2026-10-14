import { expect, test } from '@playwright/test';

test('DashboardDemo: ερώτηση → απάντηση, γράφημα, πρόταση', async ({ page }) => {
  await page.goto('/components?fast=1');
  const section = page.locator('#example-dashboard');
  await section.getByRole('button', { name: /πούλησαν περισσότερο/ }).click();
  await expect(section.getByRole('img', { name: /Γράφημα/ })).toBeVisible();
  await expect(section.getByText('Πρόταση:')).toBeVisible();
  await expect(section.getByTestId('demo-complete')).toBeVisible();
});

test('AutomationFlow: τα βήματα τρέχουν και φαίνεται το αποτέλεσμα', async ({ page }) => {
  await page.goto('/components?fast=1');
  const section = page.locator('#example-automation');
  await section.getByRole('button', { name: 'Τρέξε τον αυτοματισμό' }).click();
  await expect(section.getByTestId('owner-panel')).toContainText('Έτοιμο');
  await expect(section.getByTestId('demo-complete')).toBeVisible();
});
