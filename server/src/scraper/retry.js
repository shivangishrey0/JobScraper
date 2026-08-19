import { sleep } from './antiDetect.js';
import { toScrapeError } from './errors.js';

/**
 * Exponential backoff with full jitter: a random point between 0 and the
 * capped exponential ceiling, not a fixed 1s/2s/4s ladder. A fixed ladder is
 * itself a timing fingerprint; jitter is the same anti-detect habit as
 * antiDetect.js's pre-goto delay, just applied between retries.
 */
export function backoffDelayMs(attempt, { baseMs, maxMs }) {
  const ceiling = Math.min(baseMs * 2 ** attempt, maxMs);
  return Math.floor(Math.random() * ceiling);
}

/**
 * Runs `attempt(i)` up to `retries + 1` times. Only errors marked
 * `retryable` (see errors.js) get another try — a 403 or bad JSON retried
 * with the same request just wastes attempts and looks more automated, not
 * less.
 */
export async function withRetry(attemptFn, { retries, baseMs, maxMs, onRetry }) {
  let lastError;
  for (let i = 0; i <= retries; i++) {
    try {
      return await attemptFn(i);
    } catch (rawErr) {
      const err = toScrapeError(rawErr);
      lastError = err;
      if (!err.retryable || i === retries) throw err;
      const delay = backoffDelayMs(i, { baseMs, maxMs });
      onRetry?.({ attempt: i, delay, error: err });
      await sleep(delay);
    }
  }
  throw lastError;
}