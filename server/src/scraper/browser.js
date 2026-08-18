import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { config } from '../config.js';

// Register once at module load. Stealth patches navigator.webdriver and a few
// other headless tells. Phase 4 adds UA/jitter/headers on top of this.
puppeteer.use(StealthPlugin());

export async function launchBrowser() {
  const args = [];
  // Chromium on Linux (Render) crashes in a sandbox without extra privileges.
  // We do not enable this on Windows by default — less attack surface locally.
  if (config.puppeteerNoSandbox || process.platform === 'linux') {
    args.push('--no-sandbox', '--disable-setuid-sandbox');
  }

  return puppeteer.launch({
    headless: true,
    args,
  });
}
