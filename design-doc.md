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

## Architecture (current — phase 5)

```
                    npm run scrape (CLI)
                              |
[Vite :5173] --proxy /api--> [Express :5000] --> [MongoDB Atlas]
                              |                        ^
                     GET /api/health                   |
                              |     circuit check (last N ScrapeLog rows)
                              |     jitter → stealth Chrome (+ optional proxy)
                              |     UA + headers → GET remoteok.com/api
                              |       (retry w/ full-jitter backoff on
                              |        timeout/network/429/5xx)
                              |     normalize → bulkWrite upsert on url
                              |     write ScrapeLog: success/partial/failure
```

Trigger HTTP endpoint is phase 7.

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
