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
    return { upserted: 0, modified: 0, failed: 0 };
  }

  try {
    const result = await Job.bulkWrite(ops, { ordered: false });
    return {
      upserted: result.upsertedCount ?? 0,
      modified: result.modifiedCount ?? 0,
      failed: 0,
    };
  } catch (err) {
    // ordered:false means Mongo still applies every op that did not error —
    // err.result carries what actually landed, so one bad row (e.g. a
    // validation error) does not lose the rest of the run.
    const result = err.result;
    if (!result) throw err;
    const upserted = result.upsertedCount ?? result.nUpserted ?? 0;
    const modified = result.modifiedCount ?? result.nModified ?? 0;
    const failed = err.writeErrors?.length ?? Math.max(ops.length - upserted - modified, 0);
    return { upserted, modified, failed };
  }
}
