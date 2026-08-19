import { useCallback, useEffect, useRef, useState } from 'react';
import { getHealth, getJobs, getScrapeStatus, triggerScrape } from './lib/api.js';
import StatusPanel from './components/StatusPanel.jsx';
import JobsTable from './components/JobsTable.jsx';

const STATUS_POLL_MS = 4000;
const PAGE_SIZE = 20;

export default function App() {
  const [health, setHealth] = useState({ state: 'loading' });
  const [status, setStatus] = useState(null);
  const [triggerState, setTriggerState] = useState('idle');
  const [page, setPage] = useState(1);
  const [jobsData, setJobsData] = useState({ items: [], total: 0, totalPages: 1 });
  const [jobsLoading, setJobsLoading] = useState(true);
  const wasRunning = useRef(false);

  const fetchJobs = useCallback(async (targetPage) => {
    setJobsLoading(true);
    try {
      const { body } = await getJobs({ page: targetPage, limit: PAGE_SIZE });
      setJobsData({
        items: body.items,
        total: body.total,
        totalPages: body.totalPages,
      });
    } catch {
      // Health check already surfaces API-down state; a jobs fetch failing
      // mid-session just leaves the last good list on screen.
    } finally {
      setJobsLoading(false);
    }
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const { body } = await getScrapeStatus();
      setStatus(body);

      // A run just finished (running: true -> false) — the jobs table is
      // stale the instant that happens, so refresh it without waiting for
      // the next manual page change.
      if (wasRunning.current && !body.running) {
        fetchJobs(page);
      }
      wasRunning.current = body.running;
    } catch {
      // Same reasoning as fetchJobs — health check owns the "API is down"
      // messaging, this just skips the update and tries again next poll.
    }
  }, [fetchJobs, page]);

  useEffect(() => {
    let cancelled = false;

    getHealth()
      .then(({ ok, body }) => {
        if (!cancelled) setHealth({ state: ok ? 'ok' : 'down', body });
      })
      .catch((err) => {
        if (!cancelled) setHealth({ state: 'down', body: { error: err.message } });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (health.state !== 'ok') return undefined;

    fetchStatus();
    const id = setInterval(fetchStatus, STATUS_POLL_MS);
    return () => clearInterval(id);
  }, [health.state, fetchStatus]);

  useEffect(() => {
    if (health.state !== 'ok') return;
    fetchJobs(page);
  }, [health.state, page, fetchJobs]);

  async function handleTrigger() {
    setTriggerState('starting');
    try {
      const { status: httpStatus } = await triggerScrape();
      if (httpStatus === 409) {
        // Status poll is what's actually authoritative here — a 409 just
        // means our local view was a beat behind the server's lock.
        fetchStatus();
      }
    } catch {
      setTriggerState('error');
      return;
    }
    setTriggerState('idle');
    fetchStatus();
  }

  if (health.state === 'loading') {
    return (
      <main className="page">
        <p className="lede">Checking API…</p>
      </main>
    );
  }

  if (health.state === 'down') {
    return (
      <main className="page">
        <header className="header">
          <p className="eyebrow">Ingestion pipeline</p>
          <h1>Job scraper</h1>
        </header>
        <section className="card" aria-live="polite">
          <h2>API not reachable</h2>
          <p className="down">
            Start <code>npm run dev:server</code> and confirm{' '}
            <code>server/.env</code> has a real Atlas URI.
          </p>
          {health.body && <pre>{JSON.stringify(health.body, null, 2)}</pre>}
        </section>
      </main>
    );
  }

  return (
    <main className="page page--wide">
      <header className="header">
        <p className="eyebrow">Ingestion pipeline</p>
        <h1>Job scraper</h1>
        <p className="lede">
          Real listings pulled from RemoteOK&apos;s public API. Nothing on
          this page is invented — an empty field says so, and a failed run
          says so too.
        </p>
      </header>

      <StatusPanel status={status} onTrigger={handleTrigger} triggerState={triggerState} />

      <JobsTable
        jobs={jobsData.items}
        page={page}
        totalPages={jobsData.totalPages}
        total={jobsData.total}
        onPageChange={setPage}
        loading={jobsLoading}
      />
    </main>
  );
}
