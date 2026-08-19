// Every failure in the scrape path carries an errorType (matches ScrapeLog's
// enum) and whether it is worth retrying. Classifying at the throw site means
// run.js never has to re-guess "was this a blip or a block?" from a message.
export class ScrapeError extends Error {
  constructor(message, { errorType = 'unknown', retryable = false } = {}) {
    super(message);
    this.name = 'ScrapeError';
    this.errorType = errorType;
    this.retryable = retryable;
  }
}

export function toScrapeError(err) {
  if (err instanceof ScrapeError) return err;
  return new ScrapeError(err.message, { errorType: 'unknown', retryable: false });
}