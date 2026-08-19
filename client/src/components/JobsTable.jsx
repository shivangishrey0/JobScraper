import { formatDateTime } from '../lib/format.js';

export default function JobsTable({ jobs, page, totalPages, total, onPageChange, loading }) {
  return (
    <section className="card">
      <div className="jobs-head">
        <h2>Listings</h2>
        <span className="jobs-count">
          {total === 0 ? 'No jobs yet' : `${total} job${total === 1 ? '' : 's'}`}
        </span>
      </div>

      {loading && jobs.length === 0 && <p className="lede">Loading jobs…</p>}

      {!loading && jobs.length === 0 && (
        <p className="lede">
          No jobs yet — trigger a scrape above to pull the first batch from RemoteOK.
        </p>
      )}

      {jobs.length > 0 && (
        <table className="jobs-table" data-loading={loading || undefined}>
          <thead>
            <tr>
              <th>Title</th>
              <th>Company</th>
              <th>Location</th>
              <th>Posted</th>
              <th>Source</th>
              <th>Apply</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job._id}>
                <td data-label="Title">{job.title}</td>
                <td data-label="Company">{job.company}</td>
                <td data-label="Location">{job.location || 'Not listed'}</td>
                <td data-label="Posted">{formatDateTime(job.postedDate) ?? 'Not listed'}</td>
                <td data-label="Source">{job.source}</td>
                <td data-label="Apply">
                  <a href={job.url} target="_blank" rel="noreferrer noopener">
                    Apply →
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {totalPages > 1 && (
        <div className="pagination">
          <button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
            Previous
          </button>
          <span>
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            Next
          </button>
        </div>
      )}
    </section>
  );
}
