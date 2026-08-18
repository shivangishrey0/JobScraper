import mongoose from 'mongoose';
import { config } from './config.js';
import { Job } from './models/Job.js';
import { ScrapeLog } from './models/ScrapeLog.js';

/**
 * Single shared connection for the whole process.
 * Opening a pool per request would exhaust Atlas quickly on a free cluster.
 */
export async function connectDb() {
  if (!config.mongoUri) {
    throw new Error(
      'MONGODB_URI is missing. Copy server/.env.example to server/.env and paste your Atlas URI.'
    );
  }

  mongoose.connection.on('connected', () => {
    console.log('MongoDB connected');
  });
  mongoose.connection.on('disconnected', () => {
    console.warn('MongoDB disconnected');
  });
  mongoose.connection.on('error', (err) => {
    console.error('MongoDB error', err.message);
  });

  // serverSelectionTimeoutMS: fail in 5s instead of hanging until Atlas times out.
  await mongoose.connect(config.mongoUri, {
    serverSelectionTimeoutMS: 5000,
  });

  // Unique `url` must exist on Atlas, not only in the schema file. syncIndexes
  // is explicit so production (autoIndex often off) still gets the constraint.
  await Job.syncIndexes();
  await ScrapeLog.syncIndexes();
}

export function mongoStatus() {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  return states[mongoose.connection.readyState] ?? 'unknown';
}
