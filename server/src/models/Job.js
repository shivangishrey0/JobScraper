import mongoose from 'mongoose';

const jobSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    company: { type: String, required: true, trim: true },
    // Empty string is allowed — the UI must say "Not listed", never invent a city.
    location: { type: String, default: '', trim: true },
    url: {
      type: String,
      required: true,
      trim: true,
      // Identity of a job. Upserts in phase 3 key on this, not title+company
      // (those collide: two "Engineer" roles at the same company).
      unique: true,
    },
    postedDate: { type: Date, default: null },
    source: {
      type: String,
      required: true,
      default: 'remoteok',
      index: true,
    },
    scrapedAt: { type: Date, required: true, default: Date.now },
    contentHash: { type: String, required: true },
    // Not in the brief. Stored so contentHash can see body edits, not only
    // title/location changes. Truncated at scrape time if the HTML is huge.
    description: { type: String, default: '' },
  },
  {
    // We already have scrapedAt. Do not also add createdAt/updatedAt — two
    // clocks would be a "which one is source of truth?" question on the call.
    timestamps: false,
  }
);

jobSchema.index({ postedDate: -1 });
jobSchema.index({ source: 1, scrapedAt: -1 });

export const Job = mongoose.model('Job', jobSchema);
