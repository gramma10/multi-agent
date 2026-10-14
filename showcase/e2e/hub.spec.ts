import { expect, test } from '@playwright/test';
import { expectIndexing, expectNoHorizontalScroll, PUBLISHED } from './helpers';

test('hub: δείχνει τα demos, φιλτράρει ανά κλάδο, έχει CTA', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByText('Τα demos είναι concepts με ενδεικτικά δεδομένα')).toBeVisible();
  const cards = page.getByTestId('demo-card');
  await expect(cards).toHaveCount(3);
  await page.getByRole('button', { name: 'Ιατρεία και οδοντιατρεία' }).click();
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText('Support Agent');
  await page.getByRole('button', { name: 'Όλοι οι κλάδοι' }).click();
  await expect(cards).toHaveCount(3);
  await expect(page.getByRole('link', { name: 'Κλείσε τον Χάρτη AI' }).first()).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test('hub → demo: η κάρτα ανοίγει το demo', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('demo-card').filter({ hasText: 'Σύστημα κρατήσεων' }).click();
  await expect(page).toHaveURL(/\/demos\/kommotiria-booking$/);
  await expect(page.getByTestId('demo-badge')).toBeVisible();
});

for (const slug of ['kommotiria-booking', 'iatreia-support', 'xenodocheia-sales']) {
  const published = PUBLISHED.has(slug);
  test(`${slug}: ${published ? 'δημοσιευμένο, χωρίς noindex και χωρίς «Πρόχειρο»' : 'πρόχειρο, noindex και σήμανση «Πρόχειρο»'}`, async ({ page }) => {
    await page.goto(`/demos/${slug}`);
    await expectIndexing(page, published);
    await expect(page.getByText('Πρόχειρο, δεν έχει δημοσιευτεί')).toHaveCount(published ? 0 : 1);
  });
}

test('άγνωστο demo → 404', async ({ page }) => {
  const r = await page.goto('/demos/den-yparxei');
  expect(r?.status()).toBe(404);
});

test('live AI: κλειστό χωρίς κλειδί, το demo δεν δείχνει πεδίο ελεύθερης ερώτησης', async ({ page, request }) => {
  const r = await request.get('/api/live');
  expect(await r.json()).toEqual({ enabled: false });
  const post = await request.post('/api/live', { data: { slug: 'iatreia-support', messages: [{ role: 'user', content: 'γεια' }] } });
  expect(post.status()).toBe(404);
  await page.goto('/demos/iatreia-support?fast=1');
  await page.getByTestId('chat-options').getByRole('button', { name: 'Έχω πόνο στο στήθος από χθες' }).click();
  await expect(page.getByTestId('demo-complete')).toBeVisible();
  await expect(page.getByTestId('live-box')).toHaveCount(0);
});
