# Design doc

## Goal

Ingest remote job listings from a **public, documented** source, persist them, and display them. The pipeline should still behave predictably if the source slows down, returns empty payloads, or starts blocking the client.

## Source (locked, phase 0)

|             |                                                                           |
| ----------- | ------------------------------------------------------------------------- |
| Name        | RemoteOK                                                                  |
| Endpoint    | `GET https://remoteok.com/api`                                            |
| Format      | JSON array (index 0 is often legal/metadata, not a job)                   |
| Auth        | None                                                                      |
| Attribution | Credit RemoteOK; keep original job URLs so candidates apply on their site |

**Why this source:** they publish the feed on purpose. We are not logging into anyone's account and not fighting LinkedIn/Indeed/Naukri ToS.

**Plan B:** RemoteOK RSS (`https://remoteok.com/remote-jobs.rss`) if JSON is blocked or changed.

**Plan C:** swap the fetcher to `fetch`/`axios` against the same URL if a headless browser is the thing they block.

## Stack (locked, phase 0)

- MongoDB Atlas, Express, React (Vite), Node.js
- Scraper engine (phase 3+): Puppeteer + puppeteer-extra + stealth
- Scheduler (phase 6): `node-cron` in-process

**Deploy intent (phase 9, not done yet):** API + Chrome on Render/Railway; React on Vercel. Serverless + Puppeteer is a poor fit.

## Architecture (current — phase 7)

```
  npm run scrape (CLI)   node-cron "0 */6 * * *" UTC   POST /api/scrape/trigger
          \                        |                          /
           \          (both go through scraper/lock.js)      /
            v                      v                         v
                          runScrape()  <-- one shared function, one behavior
                              |
[Vite :5173] --proxy /api--> [Express :5000] --> [MongoDB Atlas]
                              |                        ^
                GET  /api/health                       |
                GET  /api/jobs        (paginated)       |
                GET  /api/scrape/status                 |
                              |     circuit check (last N ScrapeLog rows)
                              |     jitter → stealth Chrome (+ optional proxy)
                              |     UA + headers → GET remoteok.com/api
                              |       (retry w/ full-jitter backoff on
                              |        timeout/network/429/5xx)
                              |     normalize → bulkWrite upsert on url
                              |     write ScrapeLog: success/partial/failure
```

## Scheduler (phase 6)

`server/src/scheduler.js` wires `node-cron` to call the exact same
`runScrape()` the CLI already used — the retry, circuit breaker, and
`ScrapeLog` write-up from phase 5 apply to scheduled runs automatically,
with no second copy of that logic to keep in sync.

- **Schedule:** standard 5-field cron string, `SCRAPE_CRON_SCHEDULE`,
  default `0 */6 * * *` (every 6 hours) — conservative on purpose; this is a
  polite public feed, not a target to hammer with a tight interval.
- **No overlapping runs:** `node-cron` v4's built-in `noOverlap: true`
  option skips a tick if the previous run is still in flight (and warns).
  **Correction from this section's first draft:** the plan here was for
  phase 7's manual trigger to just check the same task's `isBusy()` before
  running — testing that directly (see "Trigger + status" under phase 7)
  found it has a race and does not actually prevent two overlapping runs.
  Phase 7 adds a small dedicated lock (`scraper/lock.js`) instead, shared by
  both the cron task and the manual trigger.
- **Fail-fast on bad config:** an invalid `SCRAPE_CRON_SCHEDULE` throws at
  startup (same rule as a missing `MONGODB_URI`) rather than silently
  running with a broken schedule.
- **Errors don't crash the scheduler:** a thrown error inside a scheduled
  run is caught and logged — `runScrape()` already wrote its own
  `ScrapeLog` row for that failure before throwing, so this catch exists
  only to keep the process alive, not to add a second log path.
- **Honest about Render's free tier:** the cron only fires while this
  Express process is actually running. Render's free plan suspends the
  process after inactivity, so "every 6 hours" means "every 6 hours while
  something keeps the server awake" — not a real always-on cron. Documented
  here and in the README rather than implied.

## Express API (phase 7)

**`GET /api/jobs`** — `?page=` / `?limit=` (default 20, capped at 100),
sorted newest-first on `postedDate` (index already existed on the `Job`
model from phase 2). Response is a straight projection of stored fields
(`contentHash`/`__v` excluded as internal bookkeeping) — no reshaping, no
invented fields, empty `location` comes back as `""` exactly as stored.

**Trigger + status.** `POST /api/scrape/trigger` and `GET
/api/scrape/status` are where the "two clicks, two Chromiums" requirement
actually gets tested. First attempt was to check the cron task's
`isBusy()` before calling its `execute()` — reusing node-cron's own state
instead of writing another lock. Testing it directly (two `execute()`
calls fired back to back, and `isBusy()` checked ~5ms before a second
`execute()`) showed **both requests got through**: the busy flag does not
flip to true synchronously when `execute()` is called, so two
near-simultaneous callers can both pass the check before either sets it.

`scraper/lock.js` fixes this with a plain module-level boolean, read and
written in one synchronous statement (`if (running) return false; running =
true; return true;`) — no `await` between the check and the set, so there's
no gap for a second caller to slip through. Both the cron task (phase 6)
and this endpoint call the same `tryAcquire()`/`release()`, so a scheduled
run and a manual click can't overlap either.

`POST /api/scrape/trigger` responds immediately (202 once the lock is
acquired, 409 if already running) rather than holding the connection open
for a run that can take up to ~40s — the scrape continues in the
background and `GET /api/scrape/status` is how the dashboard (phase 8)
watches it finish. Status reports whether a run is in flight, the last
`ScrapeLog` row, circuit-breaker state (reuses `checkCircuit()` from phase
5), and the next scheduled run time via the scheduler task's
`getNextRun()`.

Verified end-to-end against live Atlas + RemoteOK, not just read through:
fired two triggers back to back (202 then 409), polled status until the
run finished (100 items found, 1 upserted, 99 updated, ~22s), confirmed
`lastRun` populated correctly afterward.

## Detection surface (phase 4)

What gives an automated client away, and what we account for:

| Signal | Accounted for? |
| --- | --- |
| `navigator.webdriver` / common headless leaks | Yes — `puppeteer-extra-plugin-stealth` |
| Default Puppeteer user-agent | Yes — pick from a short current Chrome desktop list, one UA per run |
| Missing `Accept-Language` / `Referer` | Yes — `setExtraHTTPHeaders`. We do **not** override `Accept-Encoding` (Chromium owns that; faking it is itself a tell) |
| Perfectly even request timing | Yes — random sleep 800–2500ms (env) before `goto` |
| Datacenter IP | Stub only — `PROXY_URLS` round-robin into `--proxy-server` when set. Empty list = your real IP (honest local demo) |
| TLS / Chrome version mismatch | Partial — we use Puppeteer's bundled Chrome (`npx puppeteer browsers install chrome` if missing) |
| Behavioral / login / cookies | Out of scope — we do not log in |

**Mid-run block:** RemoteOK is **one GET**. A 403/429 fails the whole run (no upsert of a partial HTML crawl). On a paginated HTML board the same pattern would: stop remaining pages, keep jobs already saved, log `blocked`. Retries + circuit breaker are phase 5.

**Hostile-target upgrade we are not building:** paid residential proxies, sticky sessions, `page.authenticate` against a vendor, CAPTCHA farms, cookie jars. `PROXY_URLS` exists so the *rotation hook* is real and explainable.

## Ingestion strategy (phase 3–4)

One GET of the full JSON batch per run (RemoteOK is not paginated like a search UI). Skip the legal/metadata row and any item missing title, company, or http(s) URL. Strip HTML in descriptions, cap at 10k chars. Upsert with `bulkWrite` keyed on `url`. `scrapedAt` updates every time we see the listing. Pacing/UA/headers wrap that single GET so the same helpers can sit between pages later.

## Resilience (phase 5)

The pipeline assumes every run can fail, and treats "ran but produced nothing
believable" as a failure too — not a quiet success with zero jobs.

**Retry with backoff.** `attemptFetch` classifies every error into a
`ScrapeError` with an `errorType` (matches the `ScrapeLog` enum) and a
`retryable` flag:

| Failure | errorType | Retried? |
| --- | --- | --- |
| Navigation timeout / network error | `timeout` / `network` | Yes |
| No HTTP response | `network` | Yes |
| HTTP 429 or 5xx | `blocked` (429) / `network` (5xx) | Yes |
| HTTP 403 | `blocked` | **No** — retrying a block just repeats it and looks more automated, not less |
| Response body is not valid JSON | `parse` | **No** — the source changed shape; the same GET will parse the same way again |
| Zero usable jobs after normalize | `empty_payload` | **No** — not a transient blip, could be a decoy/changed feed |

Retries use exponential backoff **with full jitter** (`retry.js`): a random
point between 0 and `min(base × 2^attempt, cap)`, not a fixed 1s/2s/4s
ladder. A fixed ladder is itself a timing fingerprint — same anti-detect
reasoning as the pre-`goto` jitter in phase 4, just applied between retries.
Default: 2 retries (3 attempts total), 1s base, 8s cap — tunable via
`SCRAPE_MAX_RETRIES` / `SCRAPE_RETRY_BASE_MS` / `SCRAPE_RETRY_MAX_MS`. The
same browser and page-level UA are reused across retries inside one run —
relaunching a fresh Chromium fingerprint on every retry is more suspicious,
not less.

**Empty payload is a failure.** RemoteOK returning HTTP 200 with an empty or
all-invalid array (after skipping the legal/metadata row) is not silently
treated as "success, 0 jobs" — it's logged as `failure` / `empty_payload`.
That is the difference between a pipeline that fails loudly and one that
quietly stops working while looking green.

**Partial writes don't lose the run.** `upsertJobs` uses `bulkWrite` with
`ordered: false`, so one bad row (a Mongo-level validation error, say) does
not abort the rest of the batch. If some ops fail but others land, the run
is logged `partial` with a count of what failed; only "every op failed" is a
hard `failure`.

**Circuit breaker.** After `circuitBreakerThreshold` (default 3) consecutive
**failed attempts**, new runs are skipped for `circuitBreakerCooldownMs`
(default 5 min) instead of retried. Two things make this correct rather than
cosmetic:

- State lives in `ScrapeLog` (Atlas), not a module-level counter. `npm run
  scrape` is a fresh process every time — an in-memory counter would reset
  to 0 before it could ever trip. Querying "last N `ScrapeLog` rows" instead
  means the breaker survives process restarts, and the same query keeps
  working once phase 6's cron shares one long-lived process.
- The skip itself writes a `ScrapeLog` row (`failure` / `circuit_open`, so
  the dashboard can show it happened), but `circuit_open` rows are
  **excluded** from the consecutive-failure query. If they counted, every
  skip would push its own timestamp forward and the cooldown would never
  actually elapse — the breaker would trip once and never self-close.

**Every run writes exactly one `ScrapeLog` row** — circuit-open skip,
success, partial, or failure. No code path returns without logging.

**Mid-run block, extended:** on a paginated HTML board, a 403/429 mid-crawl
would stop fetching remaining pages, keep whatever was already upserted,
and log `partial` (if some pages landed) or `failure` / `blocked` (if none
did) — the same status vocabulary this single-GET source already uses.

## Where I stop (ToS)

I will use RemoteOK's public feed and keep outbound links. I will not add LinkedIn/Indeed/Naukri adapters, cookie jars, or login automation — even as a "demo."

## Data model (phase 2)

**Job** — identity is `url` (unique). `contentHash` is SHA-256 of title+company+location+description so a re-scrape can tell "same URL, listing changed" vs "same listing, we just saw it again." `scrapedAt` is _our_ clock; `postedDate` is _theirs_. Empty `location` stays empty — UI will say "Not listed."

**ScrapeLog** — every run writes one row: `success` | `partial` | `failure`, plus `errorType`, `itemsFound`, `durationMs`. An empty payload is `failure` + `empty_payload`, never a quiet success. Optional `detail` is the sentence the dashboard shows.

## Phase log

- **0** — Locked RemoteOK JSON + MERN + Puppeteer-for-pipeline-not-because-HTML-is-required.
- **1** — Repo split, Prettier, ESLint, Atlas connection, `/api/health`.
- **3** — Puppeteer + stealth, RemoteOK JSON, normalize, upsert on `url` (`npm run scrape`).
- **4** — Randomized Chrome UA, jitter before goto, extra headers, stub `PROXY_URLS` round-robin.
- **5** — Retry with full-jitter backoff (timeout/network/429/5xx only), empty payload treated as failure, `partial` status from bulkWrite errors, circuit breaker backed by `ScrapeLog` (not memory), every run logged.
- **6** — `node-cron` scheduler shares `runScrape()` with the CLI, `noOverlap: true` instead of a hand-rolled lock, fail-fast on bad schedule config, honest about Render spin-down.
- **7** — `GET /api/jobs` (paginated, sorted), `POST /api/scrape/trigger` + `GET /api/scrape/status`, backed by a tested-not-assumed `scraper/lock.js` after `isBusy()`/`execute()` turned out to be racy. Cron timezone pinned to UTC.
