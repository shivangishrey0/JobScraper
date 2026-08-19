import { config } from './config.js';
import { connectDb } from './db.js';
import { createApp } from './app.js';
import { startScheduler } from './scheduler.js';

async function main() {
  // Connect before listen so we never advertise a port that cannot persist jobs.
  await connectDb();

  const app = createApp();
  app.listen(config.port, () => {
    console.log(`API listening on http://localhost:${config.port}`);
  });

  // After listen, not before: confirms the HTTP port itself came up cleanly
  // first. A bad SCRAPE_CRON_SCHEDULE still throws and exits the process
  // (see main().catch below) — same fail-fast rule as a missing MONGODB_URI.
  startScheduler();
}

main().catch((err) => {
  console.error('Fatal startup error:', err.message);
  process.exit(1);
});
