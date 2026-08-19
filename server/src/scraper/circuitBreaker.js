import { ScrapeLog } from '../models/ScrapeLog.js';
import { config } from '../config.js';

/**
 * Consecutive-failure state has to live in Atlas, not a module-level
 * variable: the CLI process exits after every `npm run scrape`, so an
 * in-memory counter would reset to 0 before it could ever trip. Once phase 6
 * adds cron, the same query still works — it just gets checked more often by
 * a process that stays alive.
 *
 * `circuit_open` skip-rows are excluded from the streak on purpose: without
 * that, every skip would extend its own cooldown and the breaker would never
 * close on its own.
 */
export async function checkCircuit() {
  const threshold = config.circuitBreakerThreshold;
  if (threshold <= 0) return { open: false };

  const recentAttempts = await ScrapeLog.find({ errorType: { $ne: 'circuit_open' } })
    .sort({ timestamp: -1 })
    .limit(threshold)
    .lean();

  if (recentAttempts.length < threshold) return { open: false };
  if (!recentAttempts.every((log) => log.status === 'failure')) {
    return { open: false };
  }

  const lastFailureAt = new Date(recentAttempts[0].timestamp).getTime();
  const cooldownMs = config.circuitBreakerCooldownMs;
  const elapsedMs = Date.now() - lastFailureAt;
  if (elapsedMs >= cooldownMs) return { open: false };

  return {
    open: true,
    consecutiveFailures: recentAttempts.length,
    retryAfterMs: cooldownMs - elapsedMs,
  };
}