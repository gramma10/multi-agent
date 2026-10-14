import { expect, type Page } from '@playwright/test';

/** Κανένα οριζόντιο scroll στα 390px. */
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

/** Κοινοί έλεγχοι κάθε demo στην αρχή: badge, οδηγία, όχι στη Google όσο είναι πρόχειρο. */
export async function openDemo(page: Page, slug: string, fast = false) {
  await page.goto(`/demos/${slug}${fast ? '?fast=1' : ''}`);
  await expect(page.getByTestId('demo-badge')).toBeVisible();
  await expect(page.getByTestId('demo-badge')).toHaveText(/Demo: ενδεικτικά δεδομένα/);
  await expectNoHorizontalScroll(page);
}

/** Κοινοί έλεγχοι στο τέλος: ολοκλήρωση, ΠΡΙΝ→ΜΕΤΑ, CTA «Κλείσε τον Χάρτη AI». */
export async function expectCompleted(page: Page) {
  const done = page.getByTestId('demo-complete');
  await expect(done).toBeVisible({ timeout: 30_000 });
  await expect(done.getByTestId('before-after')).toBeVisible();
  const cta = done.getByRole('link', { name: 'Κλείσε τον Χάρτη AI' });
  await cta.scrollIntoViewIfNeeded();
  await expect(cta).toBeVisible();
  await expectNoHorizontalScroll(page);
}
