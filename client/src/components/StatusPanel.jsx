import { formatDateTime, formatDuration } from '../lib/format.js';

const STATUS_LABEL = {
  success: 'Success',
  partial: 'Partial',
  failure: 'Failed',
};

function lastRunBadge(lastRun) {
  if (!lastRun) return { label: 'No runs yet', tone: 'muted' };
  // circuit_open is a protective skip, not a fetch failure — say so, don't
  // lump it in with an actual failed run.
  if (lastRun.errorType === 'circuit_open') {
    return { label: 'Skipped (circuit open)', tone: 'warn' };
  }
  const label = STATUS_LABEL[lastRun.status] ?? lastRun.status;
  const tone = lastRun.status === 'success' ? 'ok' : lastRun.status === 'partial' ? 'warn' : 'down';
  return { label, tone };
}

export default function StatusPanel({ status, onTrigger, triggerState }) {
  const running = status?.running ?? false;
  const lastRun = status?.lastRun ?? null;
  const circuit = status?.circuit ?? { open: false };
  const nextRun = formatDateTime(status?.nextScheduledRun);
  const badge = lastRunBadge(lastRun);

  const buttonDisabled = running || triggerState === 'starting';
  const buttonLabel = running
    ? 'Scrape running…'
    : triggerState === 'starting'
      ? 'Starting…'
      : 'Run scrape now';

  return (
    <section className="card status-panel" aria-live="polite">
      <div className="status-panel__head">
        <h2>Scraper status</h2>
        <button type="button" onClick={onTrigger} disabled={buttonDisabled}>
          {buttonLabel}
        </button>
      </div>

      <div className="status-row">
        {running ? (
          <span className="pulse-dot" aria-hidden="true" />
        ) : (
          <span className={`dot dot--${badge.tone}`} aria-hidden="true" />
        )}
        <span>{running ? 'A scrape is running right now.' : 'Idle.'}</span>
      </div>

      <dl className="status-grid">
        <div>
          <dt>Last run</dt>
          <dd className={`tone-${badge.tone}`}>{badge.label}</dd>
        </div>
        {lastRun && (
          <>
            <div>
              <dt>When</dt>
              <dd>{formatDateTime(lastRun.timestamp) ?? 'Unknown'}</dd>
            </div>
            <div>
              <dt>Items found</dt>
              <dd>{lastRun.itemsFound}</dd>
            </div>
            <div>
              <dt>Duration</dt>
              <dd>{formatDuration(lastRun.durationMs) ?? '—'}</dd>
            </div>
          </>
        )}
        <div>
          <dt>Circuit breaker</dt>
          <dd className={circuit.open ? 'tone-down' : 'tone-ok'}>
            {circuit.open
              ? `Open — ${circuit.consecutiveFailures} failures in a row`
              : 'Closed'}
          </dd>
        </div>
        <div>
          <dt>Next automatic run</dt>
          <dd>{nextRun ?? 'Scheduler is off'}</dd>
        </div>
      </dl>

      {lastRun?.detail && <p className="status-detail">{lastRun.detail}</p>}
      {triggerState === 'error' && (
        <p className="status-detail tone-down">
          Could not start a scrape. Try again in a moment.
        </p>
      )}
    </section>
  );
}
