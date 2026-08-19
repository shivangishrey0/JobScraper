import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseProxyUrls } from './scraper/proxy.js';

// Load server/.env regardless of the process cwd (root vs server/).
const serverRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
dotenv.config({ path: path.join(serverRoot, '.env') });

export const config = {
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGODB_URI || '',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  nodeEnv: process.env.NODE_ENV || 'development',
  sourceUrl: process.env.SOURCE_URL || 'https://remoteok.com/api',
  puppeteerNoSandbox: process.env.PUPPETEER_NO_SANDBOX === '1',
  scrapeDelayMinMs: Number(process.env.SCRAPE_DELAY_MIN_MS) || 800,
  scrapeDelayMaxMs: Number(process.env.SCRAPE_DELAY_MAX_MS) || 2500,
  proxyUrls: parseProxyUrls(process.env.PROXY_URLS),
  // Retries cover launch/goto/5xx/429 only — see errors.js for what is and
  // is not marked retryable. 2 retries = 3 attempts total.
  scrapeMaxRetries: Number(process.env.SCRAPE_MAX_RETRIES) || 2,
  scrapeRetryBaseMs: Number(process.env.SCRAPE_RETRY_BASE_MS) || 1000,
  scrapeRetryMaxMs: Number(process.env.SCRAPE_RETRY_MAX_MS) || 8000,
  // N consecutive failed attempts trips the breaker for the cooldown window.
  // 0 disables the breaker entirely (useful for isolating retry behavior).
  circuitBreakerThreshold: Number(process.env.CIRCUIT_BREAKER_THRESHOLD) || 3,
  circuitBreakerCooldownMs: Number(process.env.CIRCUIT_BREAKER_COOLDOWN_MS) || 5 * 60 * 1000,
};
