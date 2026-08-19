import { ScrapeLog } from '../models/ScrapeLog.js';

// Single write path so every caller (CLI now, HTTP trigger + cron in later
// phases) logs the same shape — including failures, which is the point.
export async function writeScrapeLog({ status, errorType, itemsFound, durationMs, detail }) {
  return ScrapeLog.create({ status, errorType, itemsFound, durationMs, detail });
}