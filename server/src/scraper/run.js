import { config } from '../config.js';
import { launchBrowser } from './browser.js';
import { normalizeRemoteOkPayload } from './normalize.js';
import { upsertJobs } from './upsert.js';

/**
 * Core run: open a stealth Chromium, GET the public JSON, upsert by url.
 * Retries, jitter, proxy rotation, and ScrapeLog land in phases 4–5.
 */
export async function runScrape() {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    const response = await page.goto(config.sourceUrl, {
      // JSON has no long-lived connections. networkidle0 can hang if Chrome
      // keeps a socket; DOM ready is enough to read response.json().
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    if (!response) {
      throw new Error('No HTTP response from source');
    }

    const status = response.status();
    if (status >= 400) {
      throw new Error(`Source HTTP ${status}`);
    }

    const payload = await response.json();
    const { jobs, skipped } = normalizeRemoteOkPayload(payload);
    const { upserted, modified } = await upsertJobs(jobs);

    return {
      sourceUrl: config.sourceUrl,
      httpStatus: status,
      itemsFound: jobs.length,
      skipped,
      upserted,
      modified,
    };
  } finally {
    await browser.close();
  }
}
