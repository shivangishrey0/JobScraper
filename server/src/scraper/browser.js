import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { config } from '../config.js';
import { nextProxy, parseProxyEndpoint } from './proxy.js';

// Register once at module load. Stealth patches navigator.webdriver and a few
// other headless tells. UA / headers / jitter live in antiDetect.js on the page.
puppeteer.use(StealthPlugin());

export async function launchBrowser() {
  const args = [];
  // Chromium on Linux (Render) crashes in a sandbox without extra privileges.
  // We do not enable this on Windows by default — less attack surface locally.
  if (config.puppeteerNoSandbox || process.platform === 'linux') {
    args.push('--no-sandbox', '--disable-setuid-sandbox');
    // Render's free-tier containers give /dev/shm far less space than a real
    // machine; Chrome using it for shared memory is a well-known cause of
    // "Target closed" crashes in exactly this kind of container. Falling
    // back to /tmp is slower but doesn't run out of room.
    args.push('--disable-dev-shm-usage');
  }

  // Empty PROXY_URLS = direct connection. Demo stays honest; no fake IPs.
  const proxyUrl = nextProxy(config.proxyUrls);
  let proxyAuth = null;
  if (proxyUrl) {
    const parsed = parseProxyEndpoint(proxyUrl);
    args.push(`--proxy-server=${parsed.serverArg}`);
    if (parsed.username) {
      proxyAuth = { username: parsed.username, password: parsed.password };
    }
  }

  const browser = await puppeteer.launch({
    headless: true,
    args,
  });

  return { browser, proxyAuth, proxyUrl: proxyUrl || null };
}
