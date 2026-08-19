import express from 'express';
import { Job } from '../models/Job.js';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function parsePositiveInt(value, fallback, max) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return max ? Math.min(n, max) : n;
}

export const jobsRouter = express.Router();

// Newest-first by postedDate (index already exists — see Job.js). No
// invented fields: this is a straight projection of what's stored, not a
// reshaped view. contentHash/__v are internal bookkeeping, not for the UI.
jobsRouter.get('/', async (req, res) => {
  const page = parsePositiveInt(req.query.page, 1);
  const limit = parsePositiveInt(req.query.limit, DEFAULT_LIMIT, MAX_LIMIT);

  const [items, total] = await Promise.all([
    Job.find()
      .select('-contentHash -__v')
      .sort({ postedDate: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Job.countDocuments(),
  ]);

  res.json({
    items,
    page,
    limit,
    total,
    totalPages: Math.max(Math.ceil(total / limit), 1),
  });
});
