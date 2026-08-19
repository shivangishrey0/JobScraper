import { config } from '../config.js';
import { launchBrowser } from './browser.js';
import { normalizeRemoteOkPayload } from './normalize.js';
import { upsertJobs } from './upsert.js';
import { checkCircuit } from './circuitBreaker.js';
import { writeScrapeLog } from './log.js';
import { withRetry } from './retry.js';
import { ScrapeError, toScrapeError } from './errors.js';
import {
  extraHeaders,
  jitterDelayMs,
  pickUserAgent,
  sleep,
} from './antiDetect.js';

/**
 * One page load of the source, classified into a ScrapeError so run.js never
 * has to re-guess "was this a blip or a block?" from a raw message.
 * 403 and bad JSON are not retryable — retrying the same request against a
 * block, or against markup that will parse the same way again, just wastes
 * attempts and looks more automated, not less.
 */
async function attemptFetch({ browser, proxyAuth, userAgent, headers }) {
  const page = await browser.newPage();
  try {
    if (proxyAuth) {
      await page.authenticate(proxyAuth);
    }
    await page.setUserAgent(userAgent);
    await page.setExtraHTTPHeaders(headers);

    let response;
    try {
      response = await page.goto(config.sourceUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });
    } catch (err) {
      throw new ScrapeError(`Navigation failed: ${err.message}`, {
        errorType: 'timeout',
        retryable: true,
      });
    }

    if (!response) {
      throw new ScrapeError('No HTTP response from source', {
        errorType: 'network',
        retryable: true,
      });
    }

    const status = response.status();
    if (status === 403) {
      throw new ScrapeError('Source returned 403 (blocked)', {
        errorType: 'blocked',
        retryable: false,
      });
    }
    if (status === 429 || status >= 500) {
      throw new ScrapeError(`Source HTTP ${status}`, {
        errorType: status === 429 ? 'blocked' : 'network',
        retryable: true,
      });
    }
    if (status >= 400) {
      throw new ScrapeError(`Source HTTP ${status}`, {
        errorType: 'network',
        retryable: false,
      });
    }

    let payload;
    try {
      payload = await response.json();
    } catch (err) {
      throw new ScrapeError(`Response was not valid JSON: ${err.message}`, {
        errorType: 'parse',
        retryable: false,
      });
    }

    return { status, payload };
  } finally {
    await page.close();
  }
}

/**
 * Core run: circuit check, stealth Chromium, paced+retried GET of the public
 * JSON, upsert by url. Every path out of here — skip, success, partial, or
 * failure — writes exactly one ScrapeLog row.
 */
export async function runScrape() {
  const startedAt = Date.now();

  const circuit = await checkCircuit();
  if (circuit.open) {
    const detail = `Circuit open after ${circuit.consecutiveFailures} consecutive failures; retry in ${Math.ceil(circuit.retryAfterMs / 1000)}s`;
    await writeScrapeLog({
      status: 'failure',
      errorType: 'circuit_open',
      itemsFound: 0,
      durationMs: Date.now() - startedAt,
      detail,
    });
    return { status: 'skipped', circuitOpen: true, detail, retryAfterMs: circuit.retryAfterMs };
  }

  // Pace before we even launch. On a paginated HTML board this same sleep
  // would sit between page 1, 2, 3 — RemoteOK is one GET, so this is one wait.
  const delayMs = jitterDelayMs();
  await sleep(delayMs);

  let browser;
  let retryCount = 0;
  try {
    const launch = await launchBrowser();
    browser = launch.browser;
    // One UA per run, reused across retries — re-rolling the UA mid-run
    // would itself look like two different clients hitting the same target.
    const userAgent = pickUserAgent();
    const headers = extraHeaders();

    const { payload } = await withRetry(
      () => attemptFetch({ browser, proxyAuth: launch.proxyAuth, userAgent, headers }),
      {
        retries: config.scrapeMaxRetries,
        baseMs: config.scrapeRetryBaseMs,
        maxMs: config.scrapeRetryMaxMs,
        onRetry: () => {
          retryCount += 1;
        },
      }
    );

    const { jobs, skipped } = normalizeRemoteOkPayload(payload);
    if (jobs.length === 0) {
      throw new ScrapeError('Zero usable jobs after normalize (legal row + invalid rows do not count)', {
        errorType: 'empty_payload',
        retryable: false,
      });
    }

    const { upserted, modified, failed } = await upsertJobs(jobs);
    const saved = upserted + modified;
    if (failed > 0 && saved === 0) {
      throw new ScrapeError(`All ${failed} upsert operations failed`, {
        errorType: 'unknown',
        retryable: false,
      });
    }

    const status = failed > 0 ? 'partial' : 'success';
    const durationMs = Date.now() - startedAt;
    const detail =
      status === 'partial'
        ? `Upserted ${upserted}, updated ${modified}, ${failed} write(s) failed, ${skipped} row(s) skipped`
        : `Upserted ${upserted}, updated ${modified}, ${skipped} row(s) skipped`;

    await writeScrapeLog({ status, itemsFound: jobs.length, durationMs, detail });

    return {
      status,
      sourceUrl: config.sourceUrl,
      itemsFound: jobs.length,
      skipped,
      upserted,
      modified,
      failed,
      delayMs,
      retries: retryCount,
      durationMs,
      proxyUsed: Boolean(launch.proxyUrl),
    };
  } catch (err) {
    const scrapeErr = toScrapeError(err);
    await writeScrapeLog({
      status: 'failure',
      errorType: scrapeErr.errorType,
      itemsFound: 0,
      durationMs: Date.now() - startedAt,
      detail: scrapeErr.message,
    });
    throw scrapeErr;
  } finally {
    if (browser) await browser.close();
  }
}