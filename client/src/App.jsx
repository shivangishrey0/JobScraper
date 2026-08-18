import { useEffect, useState } from 'react';

// Empty in local dev → Vite proxy. Set VITE_API_URL on Vercel to the Render host.
const apiBase = import.meta.env.VITE_API_URL ?? '';

export default function App() {
  const [health, setHealth] = useState({ state: 'loading' });

  useEffect(() => {
    let cancelled = false;

    fetch(`${apiBase}/api/health`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!cancelled) {
          setHealth({
            state: res.ok ? 'ok' : 'down',
            http: res.status,
            body,
          });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setHealth({
            state: 'down',
            http: null,
            body: { ok: false, error: err.message },
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="page">
      <header className="header">
        <p className="eyebrow">Ingestion pipeline</p>
        <h1>Job scraper</h1>
        <p className="lede">
          Listings will come from RemoteOK&apos;s public API. Nothing is
          invented here — if Mongo is not connected, this page says so.
        </p>
      </header>

      <section className="card" aria-live="polite">
        <h2>API health</h2>
        {health.state === 'loading' && <p>Checking /api/health…</p>}
        {health.state === 'ok' && (
          <p className="ok">
            Express is up. Mongo: {health.body.mongo ?? 'unknown'}.
          </p>
        )}
        {health.state === 'down' && (
          <p className="down">
            API not reachable or Mongo is down.
            {health.http ? ` HTTP ${health.http}.` : ''} Start{' '}
            <code>npm run dev:server</code> and confirm <code>server/.env</code>{' '}
            has a real Atlas URI.
          </p>
        )}
        {health.body && <pre>{JSON.stringify(health.body, null, 2)}</pre>}
      </section>
    </main>
  );
}
