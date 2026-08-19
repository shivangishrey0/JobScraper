// Shared in-flight guard for runScrape(), used by both the cron scheduler
// and the manual HTTP trigger. Not built on node-cron's own isBusy()/execute()
// — tested that directly (two near-simultaneous execute() calls, and a
// isBusy()-then-execute() check a few ms apart) and both let two runs start
// at once. The busy flag apparently only becomes true after execute() has
// already begun, not synchronously when it's called, so two callers racing
// on it both pass. A plain module-level boolean, checked and set in one
// synchronous step with no `await` in between, has no such gap — JS won't
// preempt that single statement to let a second caller in.
let running = false;

export function isRunning() {
  return running;
}

export function tryAcquire() {
  if (running) return false;
  running = true;
  return true;
}

export function release() {
  running = false;
}
