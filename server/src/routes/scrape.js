import express from 'express';
import { ScrapeLog } from '../models/ScrapeLog.js';
import { runScrape } from '../scraper/run.js';
import { tryAcquire, release, isRunning } from '../scraper/lock.js';
import { checkCircuit } from '../scraper/circuitBreaker.js';
import { getSchedulerTask } from '../scheduler.js';

export const scrapeRouter = express.Router();

// Fire-and-forget: a real run can take anywhere from a few seconds to ~40s
// (jitter + Puppeteer + retries), so this responds as soon as the lock is
// acquired instead of holding the HTTP connection open for the whole run.
// The dashboard (phase 8) polls GET /api/scrape/status to see how it went.
scrapeRouter.post('/trigger', (req, res) => {
  if (!tryAcquire()) {
    return res.status(409).json({ ok: false, message: 'A scrape is already running' });
  }

  res.status(202).json({ ok: true, message: 'Scrape started' });

  runScrape()
    .catch((err) => {
      // runScrape() already wrote its own ScrapeLog row for this failure;
      // this catch exists only so a rejected background promise does not
      // become an unhandled rejection.
      console.error('Triggered scrape failed:', err.message);
    })
    .finally(() => release());
});

scrapeRouter.get('/status', async (req, res) => {
  const [lastRun, circuit] = await Promise.all([
    ScrapeLog.findOne().sort({ timestamp: -1 }).lean(),
    checkCircuit(),
  ]);

  const task = getSchedulerTask();

  res.json({
    running: isRunning(),
    lastRun: lastRun ?? null,
    circuit,
    nextScheduledRun: task ? task.getNextRun() : null,
  });
});
