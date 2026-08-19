import { config } from '../config.js';

// Short, current-looking Chrome desktop strings. A 200-entry rotator that
// includes old Safari / "Googlebot" is a stronger fingerprint than a slightly
// stale Chrome. One pick per run matches RemoteOK: one GET, not a crawl.
const CHROME_USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
];

export function pickUserAgent() {
  const i = Math.floor(Math.random() * CHROME_USER_AGENTS.length);
  return CHROME_USER_AGENTS[i];
}

/**
 * Language + referer that a real tab hitting remoteok.com/api would send.
 * We do not set Accept-Encoding — Chromium owns compression; overriding it
 * is a classic headless tell.
 */
export function extraHeaders() {
  return {
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    Referer: 'https://remoteok.com/',
  };
}

export function jitterDelayMs() {
  const min = config.scrapeDelayMinMs;
  const max = Math.max(min, config.scrapeDelayMaxMs);
  return min + Math.floor(Math.random() * (max - min + 1));
}

export function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
