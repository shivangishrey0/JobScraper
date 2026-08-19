// In-process round-robin. CLI one-shots always start at 0; once Express + cron
// share a process (phase 6), consecutive runs actually walk the list.
let cursor = 0;

export function parseProxyUrls(raw) {
  return String(raw ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

export function nextProxy(urls) {
  if (!urls.length) return null;
  const value = urls[cursor % urls.length];
  cursor += 1;
  return value;
}

/**
 * Chromium --proxy-server wants host:port, not a full URL.
 * user:pass is returned separately so the caller can page.authenticate —
 * launch args cannot carry proxy auth safely.
 */
export function parseProxyEndpoint(proxyUrl) {
  const href = proxyUrl.includes('://') ? proxyUrl : `http://${proxyUrl}`;
  const u = new URL(href);
  const port = u.port || (u.protocol === 'https:' ? '443' : '80');
  return {
    serverArg: `${u.hostname}:${port}`,
    username: decodeURIComponent(u.username || ''),
    password: decodeURIComponent(u.password || ''),
  };
}
