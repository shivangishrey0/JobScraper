import mongoose from 'mongoose';

const STATUSES = ['success', 'partial', 'failure'];

// Named buckets so the status panel can group errors. Free-text lives in `detail`.
const ERROR_TYPES = [
  'timeout',
  'blocked',
  'empty_payload',
  'parse',
  'network',
  'circuit_open',
  'unknown',
];

const scrapeLogSchema = new mongoose.Schema(
  {
    timestamp: { type: Date, required: true, default: Date.now, index: true },
    status: {
      type: String,
      required: true,
      enum: STATUSES,
    },
    errorType: {
      type: String,
      enum: ERROR_TYPES,
      // Omitted on clean success. Do not store "" — that is not a type.
    },
    itemsFound: { type: Number, required: true, default: 0, min: 0 },
    durationMs: { type: Number, required: true, min: 0 },
    // Human line for the dashboard. Empty payload is a logged failure, never a
    // silent success — this field is how we show that without faking counts.
    detail: { type: String, default: '' },
  },
  { timestamps: false }
);

export const ScrapeLog = mongoose.model('ScrapeLog', scrapeLogSchema);
export { STATUSES as SCRAPE_STATUSES, ERROR_TYPES as SCRAPE_ERROR_TYPES };
