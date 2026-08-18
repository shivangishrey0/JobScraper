import { connectDb } from '../db.js';
import { runScrape } from './run.js';
import mongoose from 'mongoose';

async function main() {
  await connectDb();
  const result = await runScrape();
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((err) => {
    console.error('Scrape failed:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
