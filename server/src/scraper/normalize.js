const DESCRIPTION_MAX = 10_000;

function stripHtml(html) {
  return String(html ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function postedDateFrom(raw) {
  if (raw.epoch) {
    const ms = Number(raw.epoch) * 1000;
    if (!Number.isNaN(ms)) return new Date(ms);
  }
  if (raw.date) {
    const d = new Date(raw.date);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

/**
 * RemoteOK's JSON array starts with a legal/metadata object (no position/url).
 * We drop that and any row missing identity or a title — never invent fields.
 */
export function normalizeRemoteOkJob(raw) {
  if (!raw || raw.legal || Array.isArray(raw)) return null;

  const title = String(raw.position ?? raw.title ?? '').trim();
  const company = String(raw.company ?? '').trim();
  const url = String(raw.url ?? raw.apply_url ?? '').trim();
  if (!title || !company || !url) return null;
  if (!/^https?:\/\//i.test(url)) return null;

  const location = String(raw.location ?? '').trim();
  const description = stripHtml(raw.description).slice(0, DESCRIPTION_MAX);

  return {
    title,
    company,
    location,
    url,
    postedDate: postedDateFrom(raw),
    source: 'remoteok',
    description,
  };
}

export function normalizeRemoteOkPayload(payload) {
  if (!Array.isArray(payload)) {
    throw new Error('RemoteOK payload was not a JSON array');
  }

  const jobs = [];
  let skipped = 0;
  for (const raw of payload) {
    const job = normalizeRemoteOkJob(raw);
    if (job) jobs.push(job);
    else skipped += 1;
  }
  return { jobs, skipped };
}
