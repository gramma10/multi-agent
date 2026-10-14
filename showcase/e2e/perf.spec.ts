import { gzipSync } from 'node:zlib';
import { expect, test } from '@playwright/test';

/**
 * Budget απόδοσης (αντί για Lighthouse, που θέλει δίκτυο και ξεχωριστό Chrome):
 *  - LCP < 1.5s (στόχος του brief) σε τοπικό production server
 *  - JavaScript της πρώτης φόρτωσης (μέχρι το load event, χωρίς prefetch άλλων σελίδων)
 *    < 200 KB μετά από gzip (σήμερα όλα τα chunks μαζί είναι ~186 KB). Μετριέται με gzip στο test, ώστε να μην εξαρτάται από τον server.
 * Τοπικά δεν υπάρχει καθυστέρηση δικτύου, οπότε αυτό πιάνει μόνο παλινδρομήσεις στο βάρος
 * της σελίδας. Ο πραγματικός έλεγχος στο κινητό γίνεται με Lighthouse/PageSpeed στο preview.
 */
const PAGES = ['/', '/demos/kommotiria-booking', '/demos/iatreia-support', '/demos/xenodocheia-sales'];

for (const path of PAGES) {
  test(`budget: ${path}`, async ({ page }) => {
    let loaded = false;
    const pending: Promise<number>[] = [];
    page.on('response', (r) => {
      if (loaded || r.request().resourceType() !== 'script') return;
      pending.push(r.body().then((b) => gzipSync(b).length, () => 0));
    });
    await page.goto(path, { waitUntil: 'load' });
    loaded = true;
    const jsBytes = (await Promise.all(pending)).reduce((a, b) => a + b, 0);
    const lcp = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          new PerformanceObserver((list) => {
            const entries = list.getEntries();
            resolve(entries[entries.length - 1]!.startTime);
          }).observe({ type: 'largest-contentful-paint', buffered: true });
          setTimeout(() => resolve(-1), 3000);
        }),
    );
    expect(lcp).toBeGreaterThan(0);
    expect(lcp).toBeLessThan(1500);
    expect(jsBytes).toBeLessThan(200 * 1024);
  });
}
