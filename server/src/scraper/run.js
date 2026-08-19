import { config } from '../config.js';
import { launchBrowser } from './browser.js';
import { normalizeRemoteOkPayload } from './normalize.js';
import { upsertJobs } from './upsert.js';
import {
  extraHeaders,
  jitterDelayMs,
  pickUserAgent,
  sleep,
} from './antiDetect.js';

/**
 * Core run: stealth Chromium, paced GET of the public JSON, upsert by url.
 * Retries, circuit breaker, and ScrapeLog land in phase 5.
 */
export async function runScrape() {
  // Pace before we even launch. On a paginated HTML board this same sleep
  // would sit between page 1, 2, 3 — RemoteOK is one GET, so this is one wait.
  const delayMs = jitterDelayMs();
  await sleep(delayMs);

  const { browser, proxyAuth, proxyUrl } = await launchBrowser();
  try {
    const page = await browser.newPage();
    if (proxyAuth) {
      await page.authenticate(proxyAuth);
    }

    await page.setUserAgent(pickUserAgent());
    await page.setExtraHTTPHeaders(extraHeaders());

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
      delayMs,
      proxyUsed: Boolean(proxyUrl),
    };
  } finally {
    await browser.close();
  }
}
