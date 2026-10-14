import { expect, test } from '@playwright/test';
import { expectCompleted, openDemo } from '../helpers';

test('ιατρείο: ωράριο, ΕΟΠΥΥ, ραντεβού, επείγον → προώθηση σε άνθρωπο, σε < 60″', async ({ page }) => {
  const started = Date.now();
  await openDemo(page, 'iatreia-support');
  const chat = page.getByTestId('chat-messages');
  const options = page.getByTestId('chat-options');

  await options.getByRole('button', { name: 'Τι ώρες είστε;' }).click();
  await expect(chat).toContainText('Δευτέρα–Παρασκευή');
  await expect(chat).toContainText('Πηγή: ωράριο ιατρείου');

  await options.getByRole('button', { name: 'Δέχεστε ΕΟΠΥΥ;' }).click();
  await expect(chat).toContainText('ΑΜΚΑ');

  await options.getByRole('button', { name: 'Ναι, δείξε μου ώρες' }).click();
  await options.getByRole('button', { name: 'Τρίτη 18:00' }).click();
  await expect(page.getByTestId('owner-panel')).toContainText('Αίτημα ραντεβού για επιβεβαίωση');

  await options.getByRole('button', { name: 'Έχω πόνο στο στήθος από χθες' }).click();
  await expect(chat).toContainText('166 ή το 112');
  await expect(chat).toContainText('Δεν μπορώ να δώσω ιατρική συμβουλή');
  await expect(page.getByTestId('owner-panel')).toContainText('ΕΠΕΙΓΟΝ');

  await expectCompleted(page);
  expect(Date.now() - started).toBeLessThan(60_000);
});

test('ιατρείο: η σύντομη διαδρομή (κατευθείαν στο επείγον) τελειώνει επίσης με CTA', async ({ page }) => {
  await openDemo(page, 'iatreia-support', true);
  await page.getByTestId('chat-options').getByRole('button', { name: 'Έχω πόνο στο στήθος από χθες' }).click();
  await expectCompleted(page);
});
