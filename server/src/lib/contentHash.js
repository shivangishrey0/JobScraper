import { createHash } from 'node:crypto';

/**
 * Canonical hash of fields that mean "the listing changed", not "we re-saw it".
 * url is identity (unique key) so it is NOT in the hash — a new URL is a new Job.
 *
 * Lowercase + trim so whitespace/casing noise does not look like an update.
 * SHA-256 is the Node default for this; MD5 would work, we just do not want a
 * "why MD5" detour in the interview.
 */
export function hashJobContent({ title, company, location, description = '' }) {
  const canonical = [title, company, location, description]
    .map((part) =>
      String(part ?? '')
        .trim()
        .toLowerCase()
    )
    .join('\0');

  return createHash('sha256').update(canonical).digest('hex');
}
