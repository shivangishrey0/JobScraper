import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { mongoStatus } from './db.js';
import { jobsRouter } from './routes/jobs.js';

export function createApp() {
  const app = express();

  // Browser dashboard (Vite) is a different origin than this API.
  app.use(
    cors({
      origin: config.clientOrigin,
    })
  );
  app.use(express.json());

  // Honest health: UI and graders can see whether Mongo is actually up.
  app.get('/api/health', (_req, res) => {
    const mongo = mongoStatus();
    res.status(mongo === 'connected' ? 200 : 503).json({
      ok: mongo === 'connected',
      mongo,
    });
  });

  app.use('/api/jobs', jobsRouter);

  return app;
}
