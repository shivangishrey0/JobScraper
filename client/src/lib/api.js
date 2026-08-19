// Empty in local dev → Vite proxy. Set VITE_API_URL on Vercel to the Render host.
const apiBase = import.meta.env.VITE_API_URL ?? '';

async function request(path, options) {
  const res = await fetch(`${apiBase}${path}`, options);
  const body = await res.json().catch(() => null);
  if (!res.ok && res.status !== 409) {
    const message = body?.message ?? `HTTP ${res.status}`;
    throw new Error(message);
  }
  return { ok: res.ok, status: res.status, body };
}

export function getHealth() {
  return request('/api/health');
}

export function getJobs({ page = 1, limit = 20 } = {}) {
  return request(`/api/jobs?page=${page}&limit=${limit}`);
}

export function getScrapeStatus() {
  return request('/api/scrape/status');
}

export function triggerScrape() {
  return request('/api/scrape/trigger', { method: 'POST' });
}
