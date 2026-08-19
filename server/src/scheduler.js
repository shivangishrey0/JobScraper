import cron from 'node-cron';
import { config } from './config.js';
import { runScrape } from './scraper/run.js';

/**
 * Same runScrape() the CLI (`npm run scrape`) and, later, the manual HTTP
 * trigger (phase 7) call — one code path, so retry/circuit-breaker/logging
 * from phase 5 apply here for free instead of needing a second copy.
 *
 * `noOverlap: true` is node-cron v4's built-in overlap guard: if a run is
 * still going when the next tick fires, the new tick is skipped (and
 * warn-logged) rather than launching a second Chromium on top of the first.
 * runScrape() already writes its own ScrapeLog row on every outcome, so the
 * try/catch here exists only to keep a thrown error from also crashing the
 * scheduled task loop.
 */
export function startScheduler() {
  if (!config.schedulerEnabled) {
    console.log('Scheduler disabled (SCRAPE_SCHEDULER_ENABLED=false)');
    return null;
  }

  if (!cron.validate(config.scrapeCronSchedule)) {
    throw new Error(`Invalid SCRAPE_CRON_SCHEDULE: "${config.scrapeCronSchedule}"`);
  }

  const task = cron.schedule(
    config.scrapeCronSchedule,
    async () => {
      try {
        await runScrape();
      } catch (err) {
        console.error('Scheduled scrape failed:', err.message);
      }
    },
    { name: 'scrape', noOverlap: true }
  );

  // Render's free tier suspends the process on inactivity. This schedule
  // only fires while something is keeping the server awake — not a claim
  // that it runs "always", which would be dishonest for a free deploy.
  console.log(
    `Scheduler enabled: "${config.scrapeCronSchedule}" (fires only while the process is awake)`
  );

  return task;
}
