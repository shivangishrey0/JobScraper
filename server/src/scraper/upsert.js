import { Job } from '../models/Job.js';
import { hashJobContent } from '../lib/contentHash.js';

/**
 * One round-trip to Atlas. Filter is `url` so Mongo's unique index is the
 * same key we think in — no title+company collisions.
 */
export async function upsertJobs(jobs) {
  const scrapedAt = new Date();

  const ops = jobs.map((job) => {
    const contentHash = hashJobContent(job);
    const doc = { ...job, contentHash, scrapedAt };
    return {
      updateOne: {
        filter: { url: job.url },
        update: { $set: doc },
        upsert: true,
      },
    };
  });

  if (ops.length === 0) {
    return { upserted: 0, modified: 0 };
  }

  const result = await Job.bulkWrite(ops, { ordered: false });
  return {
    upserted: result.upsertedCount ?? 0,
    modified: result.modifiedCount ?? 0,
  };
}
