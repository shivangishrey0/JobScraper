import cron from 'node-cron';
import { config } from './config.js';
import { runScrape } from './scraper/run.js';
import { tryAcquire, release } from './scraper/lock.js';

let schedulerTask = null;

/**
 * Same runScrape() the CLI and the phase-7 manual trigger call — one code
 * path, so retry/circuit-breaker/logging from phase 5 apply here for free
 * instead of needing a second copy.
 *
 * Overlap is guarded by `lock.js`, not node-cron's own `noOverlap`/`isBusy`
 * alone (kept here too as a cheap second layer, but it is not sufficient by
 * itself — see lock.js for what testing found). The lock is what actually
 * keeps a scheduled tick and a manual `/api/scrape/trigger` click from
 * launching two Chromiums at once, since both go through the same
 * `tryAcquire()`/`release()`.
 */
export function startScheduler() {
  if (!config.schedulerEnabled) {
    console.log('Scheduler disabled (SCRAPE_SCHEDULER_ENABLED=false)');
    return null;
  }

  if (!cron.validate(config.scrapeCronSchedule)) {
    throw new Error(`Invalid SCRAPE_CRON_SCHEDULE: "${config.scrapeCronSchedule}"`);
  }

  schedulerTask = cron.schedule(
    config.scrapeCronSchedule,
    async () => {
      if (!tryAcquire()) {
        console.warn('Scheduled scrape skipped: a run is already in flight');
        return;
      }
      try {
        await runScrape();
      } catch (err) {
        console.error('Scheduled scrape failed:', err.message);
      } finally {
        release();
      }
    },
    { name: 'scrape', noOverlap: true, timezone: config.scrapeCronTimezone }
  );

  // Render's free tier suspends the process on inactivity. This schedule
  // only fires while something is keeping the server awake — not a claim
  // that it runs "always", which would be dishonest for a free deploy.
  console.log(
    `Scheduler enabled: "${config.scrapeCronSchedule}" (fires only while the process is awake)`
  );

  return schedulerTask;
}

// Lets routes (GET /api/scrape/status) report the next scheduled run without
// threading the task instance through createApp(). Same shared-singleton
// pattern as config.js — imported where needed, not passed as a parameter.
export function getSchedulerTask() {
  return schedulerTask;
}
