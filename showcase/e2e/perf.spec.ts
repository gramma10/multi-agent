import { expect, test } from '@playwright/test';

/**
 * Budget απόδοσης (αντί για Lighthouse, που θέλει δίκτυο και ξεχωριστό Chrome):
 *  - LCP < 1.5s (στόχος του brief) σε τοπικό production server
 *  - JavaScript που κατεβαίνει στην πρώτη φόρτωση < 250 KB (συμπιεσμένο)
 * Τοπικά δεν υπάρχει καθυστέρηση δικτύου, οπότε αυτό πιάνει μόνο παλινδρομήσεις στο βάρος
 * της σελίδας. Ο πραγματικός έλεγχος στο κινητό γίνεται με Lighthouse/PageSpeed στο preview.
 */
const PAGES = ['/', '/demos/kommotiria-booking', '/demos/iatreia-support', '/demos/xenodocheia-sales'];

for (const path of PAGES) {
  test(`budget: ${path}`, async ({ page }) => {
    let jsBytes = 0;
    page.on('response', async (r) => {
      if (r.request().resourceType() === 'script') {
        const len = Number(r.headers()['content-length'] ?? 0);
        jsBytes += len || (await r.body().catch(() => Buffer.alloc(0))).length;
      }
    });
    await page.goto(path, { waitUntil: 'networkidle' });
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
    expect(jsBytes).toBeLessThan(250 * 1024);
  });
}
