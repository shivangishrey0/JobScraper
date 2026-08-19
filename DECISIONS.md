# Decisions

One page. Updated each phase. This is what you defend on the call.

## Ingestion strategy vs the alternative

**Chosen:** RemoteOK public JSON, fetched later through Puppeteer + stealth.

**Rejected:** scraping LinkedIn/Indeed HTML, or using `axios` only.

JSON is the honest source (they document it). Puppeteer is still in the path so the anti-detect / retry / scrape-log design is real and gradable — not because RemoteOK _needs_ a browser today. If asked "why not axios?": axios would be simpler and I'd use it in production for this feed; the brief grades a browser ingestion pipeline, so the browser is a deliberate adapter around a polite source.

## Phase 1

| Decision                                                           | Why                                                                                                          | Rejected                                                                   |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `client/` and `server/` as two packages, not a pnpm/turbo monorepo | Independent deploys (Vercel vs Render) and a smaller story to tell in 15 minutes                             | Yarn workspaces — extra tool for one take-home                             |
| ESM (`"type": "module"`) on the server                             | Matches Vite; native `import`; no dual CJS/ESM story                                                         | CJS `require` — still fine, just noisier next to the client                |
| `mongoose.connect` once at boot, then `listen`                     | Never accept HTTP if we cannot persist; Atlas free-tier hates per-request connections                        | Connect lazily on first request — hides misconfig until the first scrape   |
| `serverSelectionTimeoutMS: 5000`                                   | Fail in 5s locally instead of hanging ~30s on a bad URI                                                      | Default timeout                                                            |
| `/api/health` returns 503 when Mongo is not `connected`            | Honest status; load balancers and you can see it                                                             | Always 200 with `{ ok: true }`                                             |
| CORS allowlist = `CLIENT_ORIGIN`                                   | Vite is a different origin; `*` is sloppy once this is public                                                | `cors()` with no origin limit                                              |
| `.env` gitignored; `.env.example` committed                        | Atlas passwords in git fail the honesty/ownership bar                                                        | Checked-in `.env`                                                          |
| Root Prettier + per-package ESLint                                 | Format is global; lint rules differ (Node globals vs browser)                                                | One giant ESLint config spanning both                                      |
| No Job schema yet                                                  | Phase 2. Don't pretend the data model exists                                                                 |                                                                            |
| Vite `server.proxy` `/api` → `:5000`                               | Local UI uses relative `/api/health`; no hardcoded host                                                      | Putting `localhost:5000` in React — breaks the moment the API is on Render |
| ESLint on client, not oxlint                                       | Brief asked for ESLint; graders grep for it. Official `create-vite` now ships oxlint — we swapped on purpose | Keep oxlint — faster, but off-spec                                         |

## Phase 2

| Decision                                             | Why                                                                               | Rejected                                                                                                  |
| ---------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Unique index on `url`                                | One listing, one row. Upsert in phase 3.                                          | Unique on title+company — collisions. Unique on RemoteOK `id` — couples us to one vendor if Plan B is RSS |
| `contentHash` excludes `url`                         | URL is identity; hash answers "did the _content_ change?"                         | Hashing the whole document including `scrapedAt` — every run would look like an update                    |
| SHA-256 of trimmed lowercase fields                  | Stable against casing/whitespace; no MD5 interview detour                         | Hashing raw HTML as-is — false updates from tracking params in markup                                     |
| Extra `description` field                            | Brief listed title/company/location; body edits would be invisible without it     | Store only the listed fields — weaker change detection                                                    |
| No mongoose `timestamps: true`                       | `scrapedAt` / `postedDate` / log `timestamp` are explicit clocks                  | createdAt+updatedAt on top — two meanings of "when"                                                       |
| ScrapeLog `status` enum: success / partial / failure | Partial = some jobs saved, some rows skipped. Honest.                             | Boolean `ok` — cannot express "ran but empty" vs "ran and saved 40"                                       |
| `errorType` enum + `detail` string                   | Dashboard can group; humans can read                                              | Only a stack trace — ugly and leaks internals                                                             |
| `syncIndexes()` on boot                              | Unique `url` must exist on Atlas, including when `autoIndex` is off in production | Trusting Mongoose autoIndex                                                                               |

## Phase 3

| Decision | Why | Rejected |
|---|---|---|
| Puppeteer `page.goto` + `response.json()` | Same pipeline we'd use for HTML; JSON is just the payload | `axios.get` — simpler, but then stealth/jitter have nothing to wrap |
| Skip index-0 legal object and incomplete rows | Never invent a company or URL | Saving `{ title: "unknown" }` to look like volume |
| `bulkWrite` upsert on `url` | One round-trip; unique index is the same key | N × `findOneAndUpdate` — slow on Atlas free tier |
| `domcontentloaded` not `networkidle0` | Raw JSON has no "idle"; idle waits hang on leftover sockets | Copy-paste from blog HTML scrapers |
| `--no-sandbox` on Linux only | Render/Chromium needs it; Windows local does not | Always no-sandbox — extra hole on a laptop |
| No ScrapeLog yet | Phase 5 owns "every run is logged, including failures" | Logging success-only now — would teach the wrong habit |

## Phase 4

| Decision | Why | Rejected |
|---|---|---|
| Jitter on a single GET | Graders ask about pacing. Same sleep helper would sit between paginated pages | Skip jitter because "there's only one request" — then the pattern is not demoable |
| Four current Chrome UAs, not a 200-string rotator | Weird UAs (old Safari, Googlebot) are a stronger tell than slightly stale Chrome | `user-agents` npm package — extra dep, noisier story |
| Extra headers minus `Accept-Encoding` | Real tabs send language + referer; Chromium must own compression | Copying a full "stealth headers" gist that overrides encoding |
| Stub `PROXY_URLS`, empty by default | Rotation hook is real; local scrape still uses your IP — no fake "we're rotating" UI | Hardcoding public free proxies — they die, leak, and look dishonest |
| In-process round-robin (not Redis) | CLI one-shots reset to 0; Express+cron (phase 6) will actually walk the list | Persisting the index in Mongo — overkill until we have paid proxies |

**Hostile target (interview):** residential + sticky session + `page.authenticate`, abort remaining pages on 403, Plan B RSS. We still will not add LinkedIn.

## Phase 5

| Decision | Why | Rejected |
|---|---|---|
| Circuit-breaker state read from `ScrapeLog` (Atlas), not an in-memory counter | `npm run scrape` is a fresh process every run; an in-process counter resets to 0 before it could ever trip | A module-level variable — works in phase 6's cron process, silently does nothing for the CLI today |
| `circuit_open` skip-rows excluded from the consecutive-failure query | If skips counted, every skip would push its own timestamp forward and the cooldown would never elapse — breaker trips once, never self-closes | Counting all `failure` rows including skips — simpler query, wrong behavior |
| Full-jitter backoff (random 0..cap, cap doubles per attempt) | A fixed 1s/2s/4s ladder is itself a timing fingerprint; jitter matches the phase-4 pre-`goto` delay reasoning | Fixed-delay retry — easier to reason about, easier to detect |
| 403 and bad JSON are not retried; 429/5xx/timeout are | Retrying a block or a parse failure against the same request wastes attempts and repeats the exact thing that failed | Retry everything uniformly — simpler code, wastes attempts on unrecoverable errors |
| Empty payload (0 usable jobs) is a `failure`, not retried | Could mean a decoy/changed feed, not a blip; "0 jobs" must never look like a clean run | Silent success with `itemsFound: 0` — the exact failure mode the brief calls out |
| `bulkWrite(..., { ordered: false })` failures return a `failed` count instead of throwing | One bad row (e.g. a validation error) should not lose jobs that did save; `partial` status makes that visible | `ordered: true` — first bad row aborts the whole batch |
| One `ScrapeLog` row per run, on every exit path (skip/success/partial/failure) | The brief specifically grades "does it keep running instead of silently failing" — an unlogged failure would fail that on its own | Log only successes, or only failures — either hides half the picture |

**Hostile target (interview):** breaker threshold/cooldown tuned per target reputation, distributed circuit state (Redis) once multiple workers share one target, retry budget separate from circuit-trip counting so a slow-but-recovering source doesn't trip the breaker as fast as a hard-down one.

## Trade-off under time pressure (will extend later)

Phase 1 does **not** verify Atlas for you — you still paste a URI. I would spend a real week adding a `npm run doctor` that checks DNS, auth, and IP allowlisting.

Phase 2 does not expire old jobs. With a real week I'd add `lastSeenAt` and a TTL/archive for listings that vanished from the feed.

Phase 3 uses one Chrome per CLI run. With a real week I'd keep a browser pool so cron does not pay cold-start every 6 hours.

Phase 4 does not buy a proxy. With a real week I'd wire one authenticated residential endpoint and log which hop served the run.

Phase 5 uses one threshold/cooldown for every failure type. With a real week I'd weight the circuit differently for "source is down" (5xx, short cooldown) vs "we look like a bot" (403/429 streak, longer cooldown, maybe rotate UA/proxy before the next attempt instead of just waiting).

## Where AI was used

- **Phase 1:** scaffold, lint/format, health, docs.
- **Phase 2:** schema files, hash helper, these tables.
- **Phase 3:** Puppeteer adapter, normalize, bulkWrite, CLI.
- **Phase 4:** UA list, jitter, headers, proxy stub.
- **Phase 5:** error classification, retry/backoff, circuit breaker, partial-write handling.
- **You must personally:** create Atlas, run health, run `npm run scrape`, open a Job in Atlas, and explain unique-on-url, hash, why Puppeteer wraps a JSON API, why `PROXY_URLS` is empty in the demo, why circuit-breaker state lives in `ScrapeLog` instead of memory, and why 403/parse/empty-payload are deliberately *not* retried.
