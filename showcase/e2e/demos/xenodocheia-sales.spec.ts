import { expect, test } from '@playwright/test';
import { expectCompleted, openDemo } from '../helpers';

test('ξενοδοχείο: ερώτημα στα γερμανικά → απάντηση στα γερμανικά + lead στα ελληνικά, σε < 60″', async ({ page }) => {
  const started = Date.now();
  await openDemo(page, 'xenodocheia-sales');
  const chat = page.getByTestId('chat-messages');
  const options = page.getByTestId('chat-options');

  await options.getByRole('button', { name: /Deutsch/ }).click();
  await expect(chat).toContainText('Haben Sie ein Zimmer');
  await expect(chat).toContainText('Doppelzimmer Meerblick');

  await options.getByRole('button', { name: /Direktbuchung/ }).click();
  await expect(chat).toContainText('kostenlose Stornierung');
  const owner = page.getByTestId('owner-panel');
  await expect(owner).toContainText('Νέο lead');
  await expect(owner).toContainText('Γλώσσα: Deutsch');

  await expectCompleted(page);
  expect(Date.now() - started).toBeLessThan(60_000);
});

for (const lang of ['English', 'Italiano', 'Ελληνικά']) {
  test(`ξενοδοχείο: η ροή δουλεύει και σε ${lang}`, async ({ page }) => {
    await openDemo(page, 'xenodocheia-sales', true);
    const options = page.getByTestId('chat-options');
    await options.getByRole('button', { name: new RegExp(lang) }).click();
    await options.getByRole('button').first().click();
    await expect(page.getByTestId('owner-panel')).toContainText(`Γλώσσα: ${lang}`);
    await expectCompleted(page);
  });
}
