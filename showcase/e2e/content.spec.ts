import { expect, test } from '@playwright/test';
import { expectNoHorizontalScroll } from './helpers';

test('σελίδα demo: κάτω από το demo φαίνεται το κείμενο του page.md, χωρίς raw HTML', async ({ page }) => {
  await page.goto('/demos/iatreia-support');
  const content = page.getByTestId('demo-page-content');
  await expect(content.getByRole('heading', { name: 'Το πρόβλημα' })).toBeVisible();
  await expect(content.getByRole('heading', { name: 'Κλείσε τον Χάρτη AI' })).toBeVisible();
  await expect(content.locator('table')).toHaveCount(1);
  await expect(page).toHaveTitle(/Viber 24\/7/);
  await expectNoHorizontalScroll(page);
});

for (const [klados, demo] of [
  ['kommotiria', 'kommotiria-booking'],
  ['iatreia', 'iatreia-support'],
  ['xenodocheia', 'xenodocheia-sales'],
] as const) {
  test(`SEO σελίδα κλάδου /lyseis/${klados}: εισαγωγή, ενότητα demo, link, CTA`, async ({ page }) => {
    await page.goto(`/lyseis/${klados}`);
    await expect(page.getByTestId('vertical-intro').getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByTestId('vertical-section')).toHaveCount(1);
    await page.getByRole('link', { name: /Δοκίμασε το demo/ }).click();
    await expect(page).toHaveURL(new RegExp(`/demos/${demo}$`));
  });
}

test('hub: links προς τις σελίδες κλάδων', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /Ιατρεία και οδοντιατρεία →/ }).click();
  await expect(page).toHaveURL(/\/lyseis\/iatreia$/);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/); // κανένα δημοσιευμένο ακόμα
});

test('άγνωστος κλάδος → 404', async ({ page }) => {
  const r = await page.goto('/lyseis/den-yparxei');
  expect(r?.status()).toBe(404);
});
