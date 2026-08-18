import { config } from './config.js';
import { connectDb } from './db.js';
import { createApp } from './app.js';

async function main() {
  // Connect before listen so we never advertise a port that cannot persist jobs.
  await connectDb();

  const app = createApp();
  app.listen(config.port, () => {
    console.log(`API listening on http://localhost:${config.port}`);
  });
}

main().catch((err) => {
  console.error('Fatal startup error:', err.message);
  process.exit(1);
});
