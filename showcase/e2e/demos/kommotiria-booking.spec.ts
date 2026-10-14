import { expect, test } from '@playwright/test';
import { expectCompleted, openDemo } from '../helpers';

test('κομμωτήριο: κράτηση + υπενθύμιση Viber + αλλαγή → η ώρα ξαναγεμίζει, σε < 60″', async ({ page }) => {
  const started = Date.now();
  await openDemo(page, 'kommotiria-booking');
  const flow = page.getByTestId('booking-flow');
  await flow.getByRole('button', { name: /Γυναικείο κούρεμα/ }).click();
  await flow.getByRole('button', { name: 'Μαρία' }).click();
  await expect(flow.getByRole('button', { name: '10:00 κλεισμένο' }).first()).toBeDisabled();
  await flow.getByRole('button', { name: 'Πέμπτη 11:00' }).click();
  await flow.getByRole('button', { name: 'Κλείσε το ραντεβού' }).click();

  await expect(page.getByTestId('owner-panel')).toContainText('Νέο ραντεβού στο πρόγραμμα');
  await expect(page.getByTestId('reminder')).toContainText('Γεια σου Ελένη');
  await expect(page.getByTestId('reminder')).toContainText('Πέμπτη στις 11:00');

  await page.getByRole('button', { name: /Θέλω αλλαγή/ }).click();
  await expect(page.getByTestId('owner-panel')).toContainText('η ώρα ξαναγέμισε');
  await expectCompleted(page);
  expect(Date.now() - started).toBeLessThan(60_000);
});
